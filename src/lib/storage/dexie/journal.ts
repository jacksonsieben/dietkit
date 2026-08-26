import type { Journal, JournalEntry } from "@/lib/sync/journal";
import type { Cursor } from "@/lib/sync/transport";

import type { DietKitDatabase } from "./db";

/**
 * The journal on a real device (#95).
 *
 * Same interface as `createMemoryJournal`, same rules, different store — and it
 * lives under `src/lib/storage/dexie/` rather than beside the rest of sync
 * because that is the only directory allowed to import `dexie` at all. The rule
 * is in `eslint.config.mjs` and it is what keeps IndexedDB from leaking upward
 * one convenient import at a time.
 *
 * It shares the records' database on purpose. A write and its journal entry are
 * only meaningful together, and one Dexie database is the only place we can put
 * both inside a single transaction.
 */

const CURSOR_KEY = "cursor";

export function createDexieJournal(database: DietKitDatabase): Journal {
  return {
    async get(collection, recordId) {
      return database.syncJournal.get([collection, recordId]);
    },

    async pending() {
      return database.syncJournal.filter((entry) => entry.dirty).toArray();
    },

    async markDirty(collection, recordId, deleted, writtenAt) {
      await database.transaction("rw", database.syncJournal, async () => {
        const previous = await database.syncJournal.get([collection, recordId]);
        await database.syncJournal.put({
          collection,
          recordId,
          dirty: true,
          // The base revision survives a local edit: it is what the server last
          // agreed to, and the next push has to claim it to be accepted.
          rev: previous?.rev ?? 0,
          deleted,
          writtenAt,
        });
      });
    },

    async markSynced(collection, recordId, rev, deleted, writtenAt) {
      const entry: JournalEntry = {
        collection,
        recordId,
        dirty: false,
        rev,
        deleted,
        writtenAt,
      };
      await database.syncJournal.put(entry);
    },

    async rebase(collection, recordId, rev) {
      await database.transaction("rw", database.syncJournal, async () => {
        const previous = await database.syncJournal.get([collection, recordId]);
        if (!previous) return;
        await database.syncJournal.put({ ...previous, rev });
      });
    },

    async cursor() {
      const row = await database.syncMeta.get(CURSOR_KEY);
      return (row?.value as Cursor | null | undefined) ?? null;
    },

    async setCursor(cursor) {
      await database.syncMeta.put({ key: CURSOR_KEY, value: cursor });
    },

    async clear() {
      // The cursor by key, not the whole of `syncMeta` — the enrollment lives
      // in that table too (#96), and a journal that quietly un-enrolled the
      // device would be doing something its interface does not say it does.
      // Turning sync off clears both, and says so in both places.
      await database.transaction(
        "rw",
        database.syncJournal,
        database.syncMeta,
        async () => {
          await database.syncJournal.clear();
          await database.syncMeta.delete(CURSOR_KEY);
        },
      );
    },
  };
}
