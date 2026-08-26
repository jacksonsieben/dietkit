import type { IsoTimestamp } from "@/lib/storage/types";

import type { CollectionName } from "./collections";
import type { Cursor } from "./transport";

/**
 * What this device knows about each record's relationship with the server (#95).
 *
 * The records themselves stay exactly where they were — the journal is a second,
 * tiny store beside them holding three facts per record: does it still need
 * pushing, which server revision it is based on, and whether it is a tombstone.
 *
 * It is separate from the records for one reason that matters: a tombstone has
 * no record. When a diet is deleted, the row in `diets` is gone, and something
 * still has to remember that it was deleted rather than never created — or the
 * other device would helpfully push it straight back. That memory is the
 * journal, and once it exists the dirty flags belong in it too.
 */
export interface JournalEntry {
  readonly collection: CollectionName;
  readonly recordId: string;
  /** Written locally and not yet accepted by the server. */
  readonly dirty: boolean;
  /** The server revision this device is based on. `0` = never pushed. */
  readonly rev: number;
  readonly deleted: boolean;
  /**
   * When this device wrote it.
   *
   * The merge prefers the timestamp inside the record itself (see
   * `recordUpdatedAt`) — this is the fallback for the records that have none,
   * and the only timestamp a tombstone has at all.
   */
  readonly writtenAt: IsoTimestamp;
}

export interface Journal {
  get(
    collection: CollectionName,
    recordId: string,
  ): Promise<JournalEntry | undefined>;

  /** Everything waiting to be pushed. */
  pending(): Promise<JournalEntry[]>;

  /** A local write. Sets `dirty`; leaves `rev` alone, since it is the base. */
  markDirty(
    collection: CollectionName,
    recordId: string,
    deleted: boolean,
    writtenAt: IsoTimestamp,
  ): Promise<void>;

  /**
   * Agreement with the server: either the push was accepted, or a remote row
   * was applied locally. Both mean the same thing — this device and the server
   * now hold the same bytes at this revision, and there is nothing to send.
   */
  markSynced(
    collection: CollectionName,
    recordId: string,
    rev: number,
    deleted: boolean,
    writtenAt: IsoTimestamp,
  ): Promise<void>;

  /**
   * The server moved on while this device had an unsent write.
   *
   * Keeps `dirty` and only moves the base revision, which is what lets the
   * losing side of a conflict try again: it has looked at the winner, decided
   * it still wins, and now needs to claim the revision it just read in order
   * for the next push to be accepted.
   */
  rebase(
    collection: CollectionName,
    recordId: string,
    rev: number,
  ): Promise<void>;

  /** The pull cursor. `null` before the first pull, and after a reset. */
  cursor(): Promise<Cursor | null>;
  setCursor(cursor: Cursor | null): Promise<void>;

  /**
   * Forgets everything, cursor included.
   *
   * Deliberately *not* what a local delete does — this is for signing out, where
   * leaving a journal behind would have the next account inherit another
   * account's dirty list. Losing the cursor is safe by design: a pull from
   * `null` converges to the same state, only slower.
   */
  clear(): Promise<void>;
}

/** The journal the memory repository gets, and the one the tests read. */
export function createMemoryJournal(): Journal {
  const entries = new Map<string, JournalEntry>();
  let cursor: Cursor | null = null;

  const key = (collection: CollectionName, recordId: string) =>
    `${collection} ${recordId}`;

  return {
    async get(collection, recordId) {
      return entries.get(key(collection, recordId));
    },

    async pending() {
      return [...entries.values()].filter((entry) => entry.dirty);
    },

    async markDirty(collection, recordId, deleted, writtenAt) {
      const previous = entries.get(key(collection, recordId));
      entries.set(key(collection, recordId), {
        collection,
        recordId,
        dirty: true,
        rev: previous?.rev ?? 0,
        deleted,
        writtenAt,
      });
    },

    async markSynced(collection, recordId, rev, deleted, writtenAt) {
      entries.set(key(collection, recordId), {
        collection,
        recordId,
        dirty: false,
        rev,
        deleted,
        writtenAt,
      });
    },

    async rebase(collection, recordId, rev) {
      const previous = entries.get(key(collection, recordId));
      if (!previous) return;
      entries.set(key(collection, recordId), { ...previous, rev });
    },

    async cursor() {
      return cursor;
    },

    async setCursor(next) {
      cursor = next;
    },

    async clear() {
      entries.clear();
      cursor = null;
    },
  };
}
