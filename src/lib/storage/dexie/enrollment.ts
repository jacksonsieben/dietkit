import type { Enrollment, EnrollmentStore } from "@/lib/sync/enrollment";

import type { DietKitDatabase } from "./db";

/**
 * The enrollment, in `syncMeta` beside the cursor (#96).
 *
 * One row, because a device syncs one account. `SyncMetaRow.value` is typed
 * `unknown` for exactly this: a `CryptoKey` is structured-cloneable, so IndexedDB
 * stores it as itself rather than as bytes, and nothing in this file ever holds
 * the key as something that could be printed.
 */

const ENROLLMENT_KEY = "enrollment";

export function createDexieEnrollmentStore(
  database: DietKitDatabase,
): EnrollmentStore {
  return {
    async read(): Promise<Enrollment | undefined> {
      const row = await database.syncMeta.get(ENROLLMENT_KEY);
      return row?.value as Enrollment | undefined;
    },

    async write(enrollment: Enrollment): Promise<void> {
      await database.syncMeta.put({ key: ENROLLMENT_KEY, value: enrollment });
    },

    async clear(): Promise<void> {
      await database.syncMeta.delete(ENROLLMENT_KEY);
    },
  };
}
