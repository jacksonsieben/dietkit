import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDietKitDatabase } from "@/lib/storage/dexie/db";
import { createDexieEnrollmentStore } from "@/lib/storage/dexie/enrollment";
import { createDexieJournal } from "@/lib/storage/dexie/journal";
import type { DietKitDatabase } from "@/lib/storage/dexie/db";
import type { IsoTimestamp } from "@/lib/storage/types";

import type { Enrollment, EnrollmentStore } from "./enrollment";
import { createMemoryEnrollmentStore } from "./enrollment";
import { generateDataKey, open, seal } from "./sealed";

/**
 * What a device remembers about being enrolled (#96).
 *
 * Both stores, one suite, and through `fake-indexeddb` rather than a stub —
 * because the single fact worth proving here is one only a real IndexedDB can
 * tell you: a `CryptoKey` survives the round trip as a key, not as a shape that
 * looks like one. The last test seals with the key that went in and opens with
 * the key that came back out.
 */

interface StoreCase {
  readonly name: string;
  readonly create: () => Promise<{
    store: EnrollmentStore;
    dispose: () => Promise<void>;
  }>;
}

const stores: StoreCase[] = [
  {
    name: "memory",
    async create() {
      return { store: createMemoryEnrollmentStore(), dispose: async () => {} };
    },
  },
  {
    name: "dexie",
    async create() {
      // A unique name per test: IndexedDB is process-global.
      const database = createDietKitDatabase(
        `dietkit-test-${crypto.randomUUID()}`,
      );
      await database.open();
      return {
        store: createDexieEnrollmentStore(database),
        dispose: async () => {
          database.close();
          await (database as DietKitDatabase).delete();
        },
      };
    },
  },
];

describe.each(stores)("the enrollment store ($name)", ({ create }) => {
  let store: EnrollmentStore;
  let dispose: () => Promise<void>;

  beforeEach(async () => {
    ({ store, dispose } = await create());
  });

  afterEach(async () => {
    await dispose();
  });

  async function enrollment(
    overrides: Partial<Enrollment> = {},
  ): Promise<Enrollment> {
    return {
      accountId: "account-1",
      deviceId: "device-1",
      notice: "2026-08-18",
      consentedAt: "2026-08-20T10:00:00.000Z" as IsoTimestamp,
      dataKey: await generateDataKey(),
      ...overrides,
    };
  }

  it("holds nothing until sync is turned on", async () => {
    await expect(store.read()).resolves.toBeUndefined();
  });

  it("reads back what was written", async () => {
    const written = await enrollment();
    await store.write(written);

    const read = await store.read();
    expect(read).toMatchObject({
      accountId: "account-1",
      deviceId: "device-1",
      notice: "2026-08-18",
      consentedAt: "2026-08-20T10:00:00.000Z",
    });
  });

  it("holds one enrollment, because a device syncs one account", async () => {
    await store.write(await enrollment());
    await store.write(await enrollment({ accountId: "account-2" }));

    await expect(store.read()).resolves.toMatchObject({
      accountId: "account-2",
    });
  });

  it("forgets everything when sync is turned off", async () => {
    await store.write(await enrollment());
    await store.clear();

    await expect(store.read()).resolves.toBeUndefined();
  });

  it("gives back a key that still opens what the old one sealed", async () => {
    const written = await enrollment();
    const sealed = await seal(written.dataKey, "72.4", "weight/rec-1");
    await store.write(written);

    const read = await store.read();
    // Not `toEqual` on the key: two `CryptoKey`s with the same shape are not
    // the same key, and a store that returned a plausible-looking object would
    // pass that. Only decryption can tell.
    await expect(open(read!.dataKey, sealed, "weight/rec-1")).resolves.toBe(
      "72.4",
    );
  });
});

describe("the enrollment and the journal, in one table", () => {
  it("survives the journal being cleared", async () => {
    const database = createDietKitDatabase(
      `dietkit-test-${crypto.randomUUID()}`,
    );
    await database.open();

    try {
      const store = createDexieEnrollmentStore(database);
      const journal = createDexieJournal(database);

      await store.write({
        accountId: "account-1",
        deviceId: "device-1",
        notice: "2026-08-18",
        consentedAt: "2026-08-20T10:00:00.000Z" as IsoTimestamp,
        dataKey: await generateDataKey(),
      });
      await journal.setCursor({
        updatedAt: "2026-08-20T10:00:00.000Z" as IsoTimestamp,
        collection: "weight",
        recordId: "w-1",
      });

      // Both live in `syncMeta`, and the journal's own comment says it forgets
      // "everything, cursor included" -- not "and the device's key as well".
      // Turning sync off clears both, deliberately and in one place.
      await journal.clear();

      await expect(journal.cursor()).resolves.toBeNull();
      await expect(store.read()).resolves.toMatchObject({
        accountId: "account-1",
      });
    } finally {
      database.close();
      await database.delete();
    }
  });
});
