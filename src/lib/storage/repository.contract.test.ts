import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDietKitDatabase } from "./dexie/db";
import { createDexieRepository } from "./dexie/repository";
import { createMemoryRepository } from "./memory";
import type { Repository } from "./repository";
import { DEFAULT_SETTINGS } from "./shared";
import type { CustomFood, Diet, Profile, WeightEntry } from "./types";
import { SNAPSHOT_SCHEMA_VERSION } from "./types";

/**
 * One suite, run against every adapter.
 *
 * This is what makes "the adapter is swappable" a fact rather than a claim: the
 * in-memory implementation and the real IndexedDB one are held to identical
 * behaviour, down to ordering and the one-weight-per-day rule. A third adapter
 * (sync, later) earns its place by passing this file unchanged.
 *
 * `fake-indexeddb` matters here — it means the Dexie rows below go through a
 * real IndexedDB implementation, transactions and unique indexes included,
 * instead of a hand-written stub that would agree with whatever the code does.
 */
interface AdapterCase {
  readonly name: string;
  readonly create: () => Promise<{
    repository: Repository;
    dispose: () => Promise<void>;
  }>;
}

const adapters: AdapterCase[] = [
  {
    name: "memory",
    async create() {
      return {
        repository: createMemoryRepository(),
        dispose: async () => {},
      };
    },
  },
  {
    name: "dexie",
    async create() {
      // A unique name per test: IndexedDB is process-global, so a shared
      // database would leak rows between tests and make failures order-dependent.
      const db = createDietKitDatabase(`dietkit-test-${crypto.randomUUID()}`);
      await db.open();
      return {
        repository: createDexieRepository(db),
        dispose: async () => {
          db.close();
          await db.delete();
        },
      };
    },
  },
];

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    heightCm: 178,
    birthDate: "1994-03-21",
    sex: "male",
    activityFactor: 1.55,
    updatedAt: "2026-08-17T10:00:00.000Z",
    ...overrides,
  };
}

function makeWeight(overrides: Partial<WeightEntry> = {}): WeightEntry {
  return {
    id: crypto.randomUUID(),
    date: "2026-08-17",
    weightKg: 82.4,
    recordedAt: "2026-08-17T10:00:00.000Z",
    ...overrides,
  };
}

function makeDiet(overrides: Partial<Diet> = {}): Diet {
  return {
    id: crypto.randomUUID(),
    name: "Cutting",
    targets: { kcal: 2200, proteinG: 165, carbG: 220, fatG: 65 },
    meals: [
      {
        id: crypto.randomUUID(),
        name: "Café da manhã",
        share: 1,
        items: [
          {
            id: crypto.randomUUID(),
            food: { source: "taco", tacoId: 12 },
            quantityG: 100,
            mandatory: true,
            minG: 50,
            maxG: 200,
          },
        ],
      },
    ],
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

function makeFood(overrides: Partial<CustomFood> = {}): CustomFood {
  return {
    id: crypto.randomUUID(),
    name: "Açaí batido",
    per100g: { kcal: 110, proteinG: 1.2, carbG: 22, fatG: 2.1 },
    // In the default fixture rather than in one test, so that every assertion
    // comparing a whole food — the export, the round-trip through JSON — is
    // also checking that the optional serving size survived the trip.
    servingG: 200,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

describe.each(adapters)("Repository contract: $name", ({ create }) => {
  let repository: Repository;
  let dispose: () => Promise<void>;

  beforeEach(async () => {
    ({ repository, dispose } = await create());
  });

  afterEach(async () => {
    await dispose();
  });

  describe("profile", () => {
    it("is absent until saved", async () => {
      await expect(repository.profile.get()).resolves.toBeUndefined();
    });

    it("round-trips and overwrites in place", async () => {
      await repository.profile.save(makeProfile());
      await repository.profile.save(makeProfile({ heightCm: 180 }));

      await expect(repository.profile.get()).resolves.toEqual(
        makeProfile({ heightCm: 180 }),
      );
    });

    it("clears", async () => {
      await repository.profile.save(makeProfile());
      await repository.profile.clear();

      await expect(repository.profile.get()).resolves.toBeUndefined();
    });

    it("hands back a copy, not a live reference to stored state", async () => {
      await repository.profile.save(makeProfile());

      const first = await repository.profile.get();
      first!.heightCm = 999;

      const second = await repository.profile.get();
      expect(second?.heightCm).toBe(178);
    });
  });

  describe("weight", () => {
    it("lists ascending by date", async () => {
      await repository.weight.put(makeWeight({ date: "2026-08-17" }));
      await repository.weight.put(makeWeight({ date: "2026-08-01" }));
      await repository.weight.put(makeWeight({ date: "2026-08-09" }));

      const dates = (await repository.weight.list()).map((e) => e.date);
      expect(dates).toEqual(["2026-08-01", "2026-08-09", "2026-08-17"]);
    });

    it("keeps exactly one entry per day — re-logging a date edits it", async () => {
      await repository.weight.put(
        makeWeight({ date: "2026-08-17", weightKg: 82.4 }),
      );
      const replacement = makeWeight({ date: "2026-08-17", weightKg: 81.9 });
      await repository.weight.put(replacement);

      const entries = await repository.weight.list();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(replacement);
    });

    it("updates an entry by its own id without duplicating the day", async () => {
      const entry = makeWeight({ date: "2026-08-17", weightKg: 82.4 });
      await repository.weight.put(entry);
      await repository.weight.put({ ...entry, weightKg: 80.1, note: "manhã" });

      const entries = await repository.weight.list();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.weightKg).toBe(80.1);
      expect(entries[0]?.note).toBe("manhã");
    });

    it("finds a day and reports the most recent one", async () => {
      await repository.weight.put(
        makeWeight({ date: "2026-08-01", weightKg: 84 }),
      );
      await repository.weight.put(
        makeWeight({ date: "2026-08-17", weightKg: 82 }),
      );

      await expect(
        repository.weight.getByDate("2026-08-01"),
      ).resolves.toMatchObject({ weightKg: 84 });
      await expect(repository.weight.getByDate("2026-07-01")).resolves
        .toBeUndefined();
      await expect(repository.weight.latest()).resolves.toMatchObject({
        date: "2026-08-17",
      });
    });

    it("has no latest entry when the log is empty", async () => {
      await expect(repository.weight.latest()).resolves.toBeUndefined();
      await expect(repository.weight.list()).resolves.toEqual([]);
    });

    it("removes by id", async () => {
      const entry = makeWeight();
      await repository.weight.put(entry);
      await repository.weight.remove(entry.id);

      await expect(repository.weight.list()).resolves.toEqual([]);
    });
  });

  describe("diets", () => {
    it("lists most recently updated first", async () => {
      await repository.diets.put(
        makeDiet({ name: "Old", updatedAt: "2026-08-01T00:00:00.000Z" }),
      );
      await repository.diets.put(
        makeDiet({ name: "New", updatedAt: "2026-08-17T00:00:00.000Z" }),
      );

      const names = (await repository.diets.list()).map((d) => d.name);
      expect(names).toEqual(["New", "Old"]);
    });

    it("round-trips nested meals and items", async () => {
      const diet = makeDiet();
      await repository.diets.put(diet);

      await expect(repository.diets.get(diet.id)).resolves.toEqual(diet);
    });

    it("removes by id", async () => {
      const diet = makeDiet();
      await repository.diets.put(diet);
      await repository.diets.remove(diet.id);

      await expect(repository.diets.get(diet.id)).resolves.toBeUndefined();
      await expect(repository.diets.list()).resolves.toEqual([]);
    });
  });

  describe("custom foods", () => {
    it("searches without case or accents", async () => {
      const acai = makeFood({ name: "Açaí batido" });
      const frango = makeFood({ name: "Frango grelhado" });
      await repository.customFoods.put(acai);
      await repository.customFoods.put(frango);

      await expect(repository.customFoods.search("acai")).resolves.toEqual([
        acai,
      ]);
      await expect(repository.customFoods.search("AÇAÍ")).resolves.toEqual([
        acai,
      ]);
      await expect(repository.customFoods.search("grelhado")).resolves.toEqual([
        frango,
      ]);
    });

    it("searches the brand as well as the name", async () => {
      // The brand is often the only word a person remembers: they wrote the tub
      // down under its flavour, and they look for it by who makes it.
      const whey = makeFood({ name: "Baunilha", brand: "Growth" });
      await repository.customFoods.put(whey);
      await repository.customFoods.put(makeFood({ name: "Frango grelhado" }));

      await expect(repository.customFoods.search("growth")).resolves.toEqual([
        whey,
      ]);
    });

    it("returns search results in name order", async () => {
      // Pinned here rather than left to each adapter, because a caller that
      // filters the results keeps whatever order it was given — and a list that
      // reshuffles between two identical searches reads as a bug.
      await repository.customFoods.put(makeFood({ name: "Iogurte caseiro" }));
      await repository.customFoods.put(makeFood({ name: "Amendoim caseiro" }));
      await repository.customFoods.put(makeFood({ name: "Ervilha caseira" }));

      expect(
        (await repository.customFoods.search("caseir")).map((f) => f.name),
      ).toEqual(["Amendoim caseiro", "Ervilha caseira", "Iogurte caseiro"]);
    });

    it("returns nothing for a blank search rather than everything", async () => {
      await repository.customFoods.put(makeFood());

      await expect(repository.customFoods.search("")).resolves.toEqual([]);
      await expect(repository.customFoods.search("   ")).resolves.toEqual([]);
    });

    it("lists alphabetically and removes by id", async () => {
      const banana = makeFood({ name: "Banana prata" });
      const acai = makeFood({ name: "Açaí batido" });
      await repository.customFoods.put(banana);
      await repository.customFoods.put(acai);

      expect((await repository.customFoods.list()).map((f) => f.name)).toEqual([
        "Açaí batido",
        "Banana prata",
      ]);

      await repository.customFoods.remove(acai.id);
      expect((await repository.customFoods.list()).map((f) => f.name)).toEqual([
        "Banana prata",
      ]);
    });
  });

  describe("settings", () => {
    it("reads back defaults before anything is written", async () => {
      await expect(repository.settings.get()).resolves.toEqual(
        DEFAULT_SETTINGS,
      );
    });

    it("merges patches instead of replacing the record", async () => {
      await repository.settings.patch({ lastBackupAt: "2026-08-17T09:00:00.000Z" });
      const returned = await repository.settings.patch({
        disclaimerAcceptedAt: "2026-08-17T09:05:00.000Z",
      });

      expect(returned).toEqual({
        ...DEFAULT_SETTINGS,
        lastBackupAt: "2026-08-17T09:00:00.000Z",
        disclaimerAcceptedAt: "2026-08-17T09:05:00.000Z",
      });
      await expect(repository.settings.get()).resolves.toEqual(returned);
    });
  });

  describe("export and import", () => {
    it("exports everything with a schema version", async () => {
      const profile = makeProfile();
      const entry = makeWeight();
      const diet = makeDiet();
      const food = makeFood();
      await repository.profile.save(profile);
      await repository.weight.put(entry);
      await repository.diets.put(diet);
      await repository.customFoods.put(food);
      await repository.settings.patch({
        lastBackupAt: "2026-08-17T09:00:00.000Z",
      });

      const snapshot = await repository.exportAll();

      expect(snapshot.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
      expect(Date.parse(snapshot.exportedAt)).not.toBeNaN();
      expect(snapshot.profile).toEqual(profile);
      expect(snapshot.weight).toEqual([entry]);
      expect(snapshot.diets).toEqual([diet]);
      expect(snapshot.customFoods).toEqual([food]);
      expect(snapshot.settings.lastBackupAt).toBe("2026-08-17T09:00:00.000Z");
    });

    it("survives a full export/import round-trip", async () => {
      await repository.profile.save(makeProfile());
      await repository.weight.put(makeWeight({ date: "2026-08-01" }));
      await repository.weight.put(makeWeight({ date: "2026-08-17" }));
      await repository.diets.put(makeDiet());
      await repository.customFoods.put(makeFood());

      // Through JSON, because that is exactly what the backup file is.
      const snapshot = JSON.parse(
        JSON.stringify(await repository.exportAll()),
      ) as Awaited<ReturnType<Repository["exportAll"]>>;

      await repository.clearAll();
      await repository.importAll(snapshot);

      const restored = await repository.exportAll();
      expect(restored.profile).toEqual(snapshot.profile);
      expect(restored.weight).toEqual(snapshot.weight);
      expect(restored.diets).toEqual(snapshot.diets);
      expect(restored.customFoods).toEqual(snapshot.customFoods);
    });

    it("replaces on import rather than merging", async () => {
      await repository.weight.put(makeWeight({ date: "2026-01-01" }));
      const snapshot = await repository.exportAll();

      await repository.weight.put(makeWeight({ date: "2026-08-17" }));
      await repository.importAll(snapshot);

      const dates = (await repository.weight.list()).map((e) => e.date);
      expect(dates).toEqual(["2026-01-01"]);
    });

    it("keeps the one-per-day rule usable after an import", async () => {
      await repository.weight.put(makeWeight({ date: "2026-08-17" }));
      const snapshot = await repository.exportAll();

      await repository.clearAll();
      await repository.importAll(snapshot);
      await repository.weight.put(
        makeWeight({ date: "2026-08-17", weightKg: 79.5 }),
      );

      const entries = await repository.weight.list();
      expect(entries).toHaveLength(1);
      expect(entries[0]?.weightKg).toBe(79.5);
    });
  });

  describe("clearAll", () => {
    it("wipes every store and resets settings to defaults", async () => {
      await repository.profile.save(makeProfile());
      await repository.weight.put(makeWeight());
      await repository.diets.put(makeDiet());
      await repository.customFoods.put(makeFood());
      await repository.settings.patch({
        lastBackupAt: "2026-08-17T09:00:00.000Z",
      });

      await repository.clearAll();

      await expect(repository.profile.get()).resolves.toBeUndefined();
      await expect(repository.weight.list()).resolves.toEqual([]);
      await expect(repository.diets.list()).resolves.toEqual([]);
      await expect(repository.customFoods.list()).resolves.toEqual([]);
      await expect(repository.settings.get()).resolves.toEqual(
        DEFAULT_SETTINGS,
      );
    });
  });
});
