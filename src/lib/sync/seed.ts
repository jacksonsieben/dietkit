import type { Repository } from "@/lib/storage/repository";
import type { IsoTimestamp } from "@/lib/storage/types";

import { COLLECTIONS, readCollection, recordUpdatedAt } from "./collections";
import type { Journal } from "./journal";

/**
 * Marks every record the journal has never heard of as needing a push (#96).
 *
 * The decorator in `./repository.ts` journals writes as they happen, which
 * covers everything written *after* sync was turned on and nothing written
 * before it. For anyone already using the app that is the entire database: turn
 * sync on, and without this the second device would receive an empty account.
 * The same call also closes a smaller window — the records written between a
 * page load and the decorator being installed.
 *
 * **Order matters on a second device: pull first, then seed.** A pulled record
 * gets a journal entry (`markSynced`), so seeding afterwards skips it and only
 * finds what is genuinely local-only. Seeding first would mark records dirty
 * that the server already has at a revision this device has not seen, and every
 * one of them would come back as a conflict to be resolved for nothing.
 *
 * Idempotent, so it is safe to run on every enrollment and after a restore.
 *
 * One thing it cannot recover: a record deleted before sync existed leaves no
 * tombstone, because a tombstone lives in the journal and there was no journal.
 * The other device pushes that record back, and somebody deletes it a second
 * time. That is the right way round to be wrong — a deletion that has to be
 * repeated is an annoyance, and a record that vanishes because a device
 * inferred a tombstone from its absence is data loss.
 */
export async function seedJournal(
  repository: Repository,
  journal: Journal,
  now: () => IsoTimestamp = () => new Date().toISOString() as IsoTimestamp,
): Promise<{ readonly seeded: number }> {
  const snapshot = await repository.exportAll();
  let seeded = 0;

  for (const collection of COLLECTIONS) {
    for (const record of readCollection(snapshot, collection)) {
      if (await journal.get(collection, record.id)) continue;

      // The record's own timestamp where it has one, so a device that has been
      // holding a year of weights does not claim it wrote them all today. The
      // merge reads that timestamp to settle ties, and today's date would beat
      // every genuinely newer record on the other device.
      await journal.markDirty(
        collection,
        record.id,
        false,
        recordUpdatedAt(collection, record.value) ?? now(),
      );
      seeded += 1;
    }
  }

  return { seeded };
}
