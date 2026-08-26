import type { Repository } from "@/lib/storage/repository";
import type { Id, IsoTimestamp, Snapshot } from "@/lib/storage/types";

import type { CollectionName } from "./collections";
import {
  COLLECTIONS,
  SINGLETON_ID,
  applyRecord,
  readCollection,
  recordUpdatedAt,
  removeRecord,
} from "./collections";
import { openEnvelope, sealEnvelope, wins } from "./envelope";
import type { Journal, JournalEntry } from "./journal";
import type { PushRow, ServerRow, SyncTransport } from "./transport";
import { PUSH_LIMIT } from "./transport";

/**
 * Sync, as a decorator around any `Repository` (#95).
 *
 * Issue #5 built this seam and #29 predicted exactly this use of it, so there
 * are no screen changes here and no component knows sync exists. Every write
 * goes through to the adapter underneath unchanged, and then one journal entry
 * is written saying "this one needs sending".
 *
 * Three rules hold the whole thing up:
 *
 * 1. **The server is never told anything.** Every record is sealed with a key
 *    that only this account's devices have, and the row's identity is bound
 *    into the ciphertext as additional data, so the server cannot even move a
 *    blob from one record to another without the move being detected.
 * 2. **Remote records are applied to `inner`, never to `this`.** A pull is not
 *    a local write, and the decorator's whole job is to journal local writes.
 *    Going through it would queue every pulled record for sending back, and
 *    only the revision recorded a few lines later would take it off the queue
 *    again — correct by an ordering rather than by construction.
 * 3. **Merging happens on the device, on timestamps the server cannot read.**
 *    `updated_at` in Postgres orders the pull; it decides nothing.
 */

export interface SyncOutcome {
  /** Records the server accepted from this device. */
  readonly pushed: number;
  /** Remote records written into the local store. */
  readonly applied: number;
  /** Rows this device left alone: echoes, losers, and newer schema versions. */
  readonly skipped: number;
}

export interface SyncRepository extends Repository {
  /** One round trip. Safe to call again; safe to call while offline (it throws). */
  sync(): Promise<SyncOutcome>;
}

export interface SyncRepositoryOptions {
  /** The real store. Reads pass straight through; writes are journalled. */
  readonly inner: Repository;
  readonly journal: Journal;
  readonly transport: SyncTransport;
  /** The account's data key, already unwrapped by `vault.ts`. */
  readonly dataKey: CryptoKey;
  /**
   * This device, as an opaque random string.
   *
   * A tiebreak and an echo filter, not a fingerprint: it is generated on the
   * device, it says nothing about the hardware, and it never leaves the
   * ciphertext — `sync.rows` has no column for it, so the server cannot count
   * this account's devices or tell which of them wrote a record. Two devices
   * need *some* stable total order to settle a tie the same way without talking
   * to each other, and that order is settled where the records are readable.
   */
  readonly deviceId: string;
  readonly now?: () => IsoTimestamp;
}

/**
 * How many push/resolve rounds one `sync()` will do before giving up.
 *
 * A device that keeps losing to a device that keeps writing should stop and try
 * again on the next sync rather than spin. Three is enough for every conflict
 * that is not a live editing race, and a live editing race resolves itself the
 * moment one side stops typing.
 */
const MAX_ROUNDS = 3;

export function createSyncRepository(
  options: SyncRepositoryOptions,
): SyncRepository {
  const { inner, journal, transport, dataKey, deviceId } = options;
  const now = options.now ?? (() => new Date().toISOString());

  const dirty = (collection: CollectionName, recordId: string) =>
    journal.markDirty(collection, recordId, false, now());

  const tombstone = (collection: CollectionName, recordId: string) =>
    journal.markDirty(collection, recordId, true, now());

  /**
   * One record, by id, for the collections that have no `get(id)`.
   *
   * `WeightRepository` has `getByDate` and `latest` but no lookup by id,
   * because no screen has ever needed one. Rather than widen the seam for
   * sync's benefit, this scans — over a list that is one row per day and only
   * for records that are actually being pushed or reconciled.
   */
  async function readOne(
    collection: CollectionName,
    recordId: string,
  ): Promise<unknown> {
    switch (collection) {
      case "profile":
        return inner.profile.get();
      case "training":
        return inner.training.get();
      case "settings":
        return inner.settings.get();
      case "weight":
        return (await inner.weight.list()).find(
          (entry) => entry.id === recordId,
        );
      case "diets":
        return inner.diets.get(recordId);
      case "customFoods":
        return inner.customFoods.get(recordId);
      case "substitutionGroups":
        return inner.substitutionGroups.get(recordId);
      case "trainingSessions":
        return inner.trainingSessions.get(recordId);
    }
  }

  /**
   * The clock the merge uses for a local record: the record's own timestamp if
   * it has one, otherwise when this device wrote it. See `recordUpdatedAt` for
   * why there is no new `updatedAt` field on every type.
   */
  function stampOf(
    collection: CollectionName,
    value: unknown,
    entry: JournalEntry,
  ) {
    const updatedAt =
      (value === undefined ? undefined : recordUpdatedAt(collection, value)) ??
      entry.writtenAt;
    return { updatedAt, deviceId };
  }

  /**
   * `weight.put` is an upsert keyed on the *day*, so writing today's weight can
   * silently delete a different row with a different id. Locally that is
   * correct and intended (#23). For sync it is a delete nobody journalled, and
   * an unjournalled delete is a record the other device pushes straight back.
   */
  async function tombstoneDisplacedWeight(entry: {
    id: Id;
    date: string;
  }): Promise<void> {
    const existing = await inner.weight.getByDate(entry.date);
    if (existing && existing.id !== entry.id) {
      await tombstone("weight", existing.id);
    }
  }

  /**
   * Writes one row from the server into the local store, unless this device has
   * a better claim to that record.
   *
   * Used for both halves of a sync: a row that came back from `pull`, and a row
   * the server handed back as a conflict. They are the same problem.
   */
  async function reconcile(row: ServerRow): Promise<"applied" | "skipped"> {
    const entry = await journal.get(row.collection, row.recordId);

    // The echo filter, and it needs no device id: a row this device already
    // agreed to is a row whose revision it already recorded.
    if (entry && entry.rev === row.rev && !entry.dirty) return "skipped";

    const envelope = await openEnvelope(
      dataKey,
      row.collection,
      row.recordId,
      row,
    );

    // A record written by a newer version of the app. Left untouched and
    // *not* marked as agreed, so this device picks it up after it updates
    // rather than having quietly skipped past it forever.
    if (!envelope) return "skipped";

    if (entry?.dirty) {
      const local = stampOf(
        row.collection,
        await readOne(row.collection, row.recordId),
        entry,
      );

      if (!wins(envelope, local)) {
        // This device still wins. Claim the revision it just read so the next
        // push is accepted instead of conflicting on the same row forever.
        await journal.rebase(row.collection, row.recordId, row.rev);
        return "skipped";
      }
    }

    if (envelope.record === null) {
      await removeRecord(inner, row.collection, row.recordId);
    } else {
      if (row.collection === "weight") {
        await tombstoneDisplacedWeight(
          envelope.record as { id: Id; date: string },
        );
      }
      await applyRecord(inner, row.collection, envelope.record);
    }

    await journal.markSynced(
      row.collection,
      row.recordId,
      row.rev,
      envelope.record === null,
      envelope.updatedAt,
    );

    return "applied";
  }

  async function pushPending(): Promise<{
    accepted: number;
    conflicts: number;
    skipped: number;
  }> {
    const pending = await journal.pending();
    if (pending.length === 0) return { accepted: 0, conflicts: 0, skipped: 0 };

    const rows: PushRow[] = [];
    for (const entry of pending) {
      const value = entry.deleted
        ? undefined
        : await readOne(entry.collection, entry.recordId);

      // A record that is marked dirty but is no longer in the store was deleted
      // by something that did not go through this decorator. Treated as a
      // tombstone rather than as a reason to crash: a delete that is guessed
      // right is recoverable from the other device, and a throw here would wedge
      // every later sync behind one bad entry.
      const record = value ?? null;
      const { updatedAt } = stampOf(entry.collection, value, entry);

      const sealed = await sealEnvelope(
        dataKey,
        entry.collection,
        entry.recordId,
        { record, updatedAt, deviceId },
      );

      rows.push({
        collection: entry.collection,
        recordId: entry.recordId,
        ciphertext: sealed.ciphertext,
        nonce: sealed.nonce,
        baseRev: entry.rev,
        deleted: record === null,
      });
    }

    let accepted = 0;
    let conflicts = 0;
    let skipped = 0;

    // In batches, because a first sync carries the whole account: one request
    // with every record in it would be refused by the route (PUSH_LIMIT) and,
    // if it were not, would lose everything to a single dropped connection.
    // Each batch is journalled before the next is sent, so an interrupted sync
    // leaves the rows that did land marked as landed.
    for (let start = 0; start < rows.length; start += PUSH_LIMIT) {
      const result = await transport.push(
        rows.slice(start, start + PUSH_LIMIT),
      );

      for (const row of result.accepted) {
        const entry = pending.find(
          (candidate) =>
            candidate.collection === row.collection &&
            candidate.recordId === row.recordId,
        )!;
        await journal.markSynced(
          row.collection,
          row.recordId,
          row.rev,
          entry.deleted,
          entry.writtenAt,
        );
      }

      for (const conflict of result.conflicts) {
        if ((await reconcile(conflict)) === "skipped") skipped += 1;
      }

      accepted += result.accepted.length;
      conflicts += result.conflicts.length;
    }

    return { accepted, conflicts, skipped };
  }

  async function pullAll(): Promise<{ applied: number; skipped: number }> {
    let applied = 0;
    let skipped = 0;
    let cursor = await journal.cursor();

    for (;;) {
      const page = await transport.pull(cursor);
      for (const row of page.rows) {
        if ((await reconcile(row)) === "applied") applied += 1;
        else skipped += 1;
      }

      cursor = page.cursor;
      // Saved per page, not at the end: a sync that dies halfway through a slow
      // connection should resume, not start over.
      await journal.setCursor(cursor);
      if (!page.more) break;
    }

    return { applied, skipped };
  }

  const repository: SyncRepository = {
    profile: {
      get: () => inner.profile.get(),
      async save(profile) {
        await inner.profile.save(profile);
        await dirty("profile", SINGLETON_ID);
      },
      async clear() {
        await inner.profile.clear();
        await tombstone("profile", SINGLETON_ID);
      },
    },

    weight: {
      list: () => inner.weight.list(),
      getByDate: (date) => inner.weight.getByDate(date),
      latest: () => inner.weight.latest(),
      async put(entry) {
        await tombstoneDisplacedWeight(entry);
        await inner.weight.put(entry);
        await dirty("weight", entry.id);
      },
      async remove(id) {
        await inner.weight.remove(id);
        await tombstone("weight", id);
      },
    },

    diets: {
      list: () => inner.diets.list(),
      get: (id) => inner.diets.get(id),
      async put(diet) {
        await inner.diets.put(diet);
        await dirty("diets", diet.id);
      },
      async remove(id) {
        await inner.diets.remove(id);
        await tombstone("diets", id);
      },
    },

    customFoods: {
      list: () => inner.customFoods.list(),
      get: (id) => inner.customFoods.get(id),
      search: (term) => inner.customFoods.search(term),
      async put(food) {
        await inner.customFoods.put(food);
        await dirty("customFoods", food.id);
      },
      async remove(id) {
        await inner.customFoods.remove(id);
        await tombstone("customFoods", id);
      },
    },

    substitutionGroups: {
      list: () => inner.substitutionGroups.list(),
      get: (id) => inner.substitutionGroups.get(id),
      async put(group) {
        await inner.substitutionGroups.put(group);
        await dirty("substitutionGroups", group.id);
      },
      async remove(id) {
        await inner.substitutionGroups.remove(id);
        await tombstone("substitutionGroups", id);
      },
    },

    training: {
      get: () => inner.training.get(),
      async save(rotation) {
        await inner.training.save(rotation);
        await dirty("training", SINGLETON_ID);
      },
      async clear() {
        await inner.training.clear();
        await tombstone("training", SINGLETON_ID);
      },
    },

    trainingSessions: {
      list: () => inner.trainingSessions.list(),
      get: (id) => inner.trainingSessions.get(id),
      async put(session) {
        await inner.trainingSessions.put(session);
        await dirty("trainingSessions", session.id);
      },
      async remove(id) {
        await inner.trainingSessions.remove(id);
        await tombstone("trainingSessions", id);
      },
    },

    settings: {
      get: () => inner.settings.get(),
      async patch(changes) {
        const settings = await inner.settings.patch(changes);
        await dirty("settings", SINGLETON_ID);
        return settings;
      },
    },

    exportAll: () => inner.exportAll(),

    /**
     * Restore is a replace, not a merge, and sync has to be told that in both
     * directions: everything in the file becomes a local write to send, and
     * everything that was here and is not in the file becomes a tombstone. A
     * restore that only marked what it wrote would have the other device push
     * back every record the restore was meant to remove.
     */
    async importAll(snapshot) {
      const before = idsByCollection(await inner.exportAll());
      await inner.importAll(snapshot);
      const after = idsByCollection(snapshot);

      for (const collection of COLLECTIONS) {
        for (const id of after[collection]) await dirty(collection, id);
        for (const id of before[collection]) {
          if (!after[collection].has(id)) await tombstone(collection, id);
        }
      }
    },

    /**
     * "Erase everything" means everything, including on the other device. The
     * journal keeps its tombstones — they are the only remaining evidence that
     * these records ever existed, and without them the next sync would pull the
     * whole dataset straight back.
     */
    async clearAll() {
      const before = idsByCollection(await inner.exportAll());
      await inner.clearAll();

      for (const collection of COLLECTIONS) {
        for (const id of before[collection]) await tombstone(collection, id);
      }
    },

    async sync() {
      let pushed = 0;
      let skipped = 0;

      // Push first: a conflict then arrives with the server's row already in
      // hand, so it is settled in this round trip instead of the next one.
      for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const result = await pushPending();
        pushed += result.accepted;
        skipped += result.skipped;
        if (result.conflicts === 0) break;
      }

      const pulled = await pullAll();
      skipped += pulled.skipped;

      // A pull can rebase a local write that beat what it found. Sending it now
      // is what makes the two devices agree at the end of one sync rather than
      // leaving the server holding the record that lost.
      const trailing = await pushPending();
      pushed += trailing.accepted;
      skipped += trailing.skipped;

      return { pushed, applied: pulled.applied, skipped };
    },
  };

  return repository;
}

/** Which record ids a snapshot contains, per collection. */
function idsByCollection(
  snapshot: Snapshot,
): Record<CollectionName, Set<string>> {
  const ids = {} as Record<CollectionName, Set<string>>;
  for (const collection of COLLECTIONS) {
    ids[collection] = new Set(
      readCollection(snapshot, collection).map((record) => record.id),
    );
  }
  return ids;
}
