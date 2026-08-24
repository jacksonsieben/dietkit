import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDietKitDatabase } from "./dexie/db";
import { createDexieRepository } from "./dexie/repository";
import { createMemoryRepository } from "./memory";
import type { Repository } from "./repository";
import { DEFAULT_SETTINGS } from "./shared";
import type {
  CustomFood,
  Diet,
  Profile,
  SubstitutionGroup,
  TrainingRotation,
  TrainingSession,
  WeightEntry,
} from "./types";
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

function makeGroup(
  overrides: Partial<SubstitutionGroup> = {},
): SubstitutionGroup {
  return {
    id: crypto.randomUUID(),
    name: "Frutas",
    foods: [
      { source: "taco", tacoId: 12 },
      { source: "taco", tacoId: 48 },
    ],
    // Carried in the default fixture for `makeFood`'s reason: every assertion
    // that compares a whole group is then also checking that the composition
    // snapshot — the thing that lets a swap work offline — survived the trip.
    tacoFoods: [
      {
        tacoId: 48,
        name: "Banana prata",
        per100g: { kcal: 98, proteinG: 1.3, carbG: 26, fatG: 0.1 },
      },
    ],
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

function makeRotation(
  overrides: Partial<TrainingRotation> = {},
): TrainingRotation {
  return {
    splitSlug: "abc-3x",
    nextDay: 1,
    lastFinishedAt: "2026-08-16T18:40:00.000Z",
    updatedAt: "2026-08-16T18:40:00.000Z",
    ...overrides,
  };
}

function makeSession(
  overrides: Partial<TrainingSession> = {},
): TrainingSession {
  return {
    id: "session-1",
    date: "2026-08-16",
    splitSlug: "abc-3x",
    dayIndex: 0,
    dayName: "A · Peito, ombros e tríceps",
    exercises: [
      {
        exercise: "supino-reto-barra",
        sets: [
          { reps: 8, loadKg: 60 },
          { reps: 6, loadKg: 62.5 },
        ],
      },
      { exercise: "triceps-corda-cabo", sets: [] },
    ],
    startedAt: "2026-08-16T17:40:00.000Z",
    finishedAt: "2026-08-16T18:40:00.000Z",
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

  describe("training", () => {
    it("is absent until a split is chosen", async () => {
      await expect(repository.training.get()).resolves.toBeUndefined();
    });

    it("round-trips and advances in place", async () => {
      await repository.training.save(makeRotation());
      await repository.training.save(makeRotation({ nextDay: 2 }));

      // One row, not a log: advancing the rotation replaces where you are, it
      // does not stack a second answer to "which session is next".
      await expect(repository.training.get()).resolves.toEqual(
        makeRotation({ nextDay: 2 }),
      );
    });

    it("keeps a rotation that has never been finished", async () => {
      const fresh: TrainingRotation = {
        splitSlug: "abc-3x",
        nextDay: 0,
        updatedAt: "2026-08-16T18:40:00.000Z",
      };
      await repository.training.save(fresh);

      const stored = await repository.training.get();
      expect(stored).toEqual(fresh);
      expect(stored).not.toHaveProperty("lastFinishedAt");
    });

    it("clears, which is what stopping a split is", async () => {
      await repository.training.save(makeRotation());
      await repository.training.clear();

      await expect(repository.training.get()).resolves.toBeUndefined();
    });

    it("hands back a copy, not a live reference to stored state", async () => {
      await repository.training.save(makeRotation());

      const first = await repository.training.get();
      first!.nextDay = 99;

      const second = await repository.training.get();
      expect(second?.nextDay).toBe(1);
    });
  });

  describe("trainingSessions", () => {
    it("is empty until something is trained", async () => {
      await expect(repository.trainingSessions.list()).resolves.toEqual([]);
    });

    it("round-trips a session down to its nested sets", async () => {
      const session = makeSession();
      await repository.trainingSessions.put(session);

      await expect(repository.trainingSessions.get("session-1")).resolves.toEqual(
        session,
      );
    });

    it("keeps a movement that was on the card and not done", async () => {
      // An empty `sets` is a fact, not an absence: dropping it in storage would
      // make a skipped session and a shorter one read the same afterwards.
      await repository.trainingSessions.put(makeSession());

      const stored = await repository.trainingSessions.get("session-1");
      expect(stored?.exercises[1]).toEqual({
        exercise: "triceps-corda-cabo",
        sets: [],
      });
    });

    it("keeps a set logged without a weight absent rather than zero", async () => {
      await repository.trainingSessions.put(
        makeSession({
          exercises: [
            { exercise: "barra-fixa-pronada", sets: [{ reps: 10 }] },
          ],
        }),
      );

      const set = (await repository.trainingSessions.get("session-1"))!
        .exercises[0]!.sets[0]!;
      expect(set).toEqual({ reps: 10 });
      expect(set.loadKg).toBeUndefined();
    });

    it("lists most recent first — what the pre-fill reads", async () => {
      await repository.trainingSessions.put(
        makeSession({ id: "b", finishedAt: "2026-08-19T18:40:00.000Z" }),
      );
      await repository.trainingSessions.put(
        makeSession({ id: "a", finishedAt: "2026-08-12T18:40:00.000Z" }),
      );
      await repository.trainingSessions.put(
        makeSession({ id: "c", finishedAt: "2026-08-24T18:40:00.000Z" }),
      );

      const ids = (await repository.trainingSessions.list()).map((s) => s.id);
      expect(ids).toEqual(["c", "b", "a"]);
    });

    it("stacks rather than replacing: this is a log, not a pointer", async () => {
      // The opposite of `training` above. Two sessions of the same day of the
      // same split are two sessions.
      await repository.trainingSessions.put(makeSession({ id: "a" }));
      await repository.trainingSessions.put(makeSession({ id: "b" }));

      await expect(repository.trainingSessions.list()).resolves.toHaveLength(2);
    });

    it("edits a session in place when it is put again", async () => {
      await repository.trainingSessions.put(makeSession());
      await repository.trainingSessions.put(
        makeSession({ exercises: [{ exercise: "supino-reto-barra", sets: [] }] }),
      );

      const all = await repository.trainingSessions.list();
      expect(all).toHaveLength(1);
      expect(all[0]?.exercises).toEqual([
        { exercise: "supino-reto-barra", sets: [] },
      ]);
    });

    it("removes one", async () => {
      await repository.trainingSessions.put(makeSession());
      await repository.trainingSessions.remove("session-1");

      await expect(repository.trainingSessions.list()).resolves.toEqual([]);
      await expect(
        repository.trainingSessions.get("session-1"),
      ).resolves.toBeUndefined();
    });

    it("copies on the way in and on the way out", async () => {
      // Both directions, because the sets are nested: an adapter that stored
      // the caller's object would let a later edit to the draft rewrite a
      // session that has already been logged.
      const session = makeSession();
      await repository.trainingSessions.put(session);
      session.exercises[0]!.sets[0]!.loadKg = 111;

      const first = await repository.trainingSessions.get("session-1");
      expect(first?.exercises[0]?.sets[0]?.loadKg).toBe(60);

      first!.exercises[0]!.sets[0]!.loadKg = 999;
      const second = await repository.trainingSessions.get("session-1");
      expect(second?.exercises[0]?.sets[0]?.loadKg).toBe(60);
    });
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

  describe("substitution groups", () => {
    it("has none until the user writes one", async () => {
      await expect(repository.substitutionGroups.list()).resolves.toEqual([]);
      await expect(
        repository.substitutionGroups.get(crypto.randomUUID()),
      ).resolves.toBeUndefined();
    });

    it("round-trips a group with its composition snapshots", async () => {
      const group = makeGroup();
      await repository.substitutionGroups.put(group);

      await expect(
        repository.substitutionGroups.get(group.id),
      ).resolves.toEqual(group);
    });

    it("replaces a group of the same id rather than adding a second", async () => {
      const group = makeGroup();
      await repository.substitutionGroups.put(group);
      await repository.substitutionGroups.put({
        ...group,
        name: "Frutas da manhã",
        foods: [...group.foods, { source: "custom", customFoodId: "abc" }],
        updatedAt: "2026-08-17T10:00:00.000Z",
      });

      const groups = await repository.substitutionGroups.list();
      expect(groups).toHaveLength(1);
      expect(groups[0]?.name).toBe("Frutas da manhã");
      expect(groups[0]?.foods).toHaveLength(3);
    });

    it("lists alphabetically and removes by id", async () => {
      const grains = makeGroup({ name: "Grãos" });
      const fruit = makeGroup({ name: "Frutas" });
      const acompanhamentos = makeGroup({ name: "Acompanhamentos" });
      await repository.substitutionGroups.put(grains);
      await repository.substitutionGroups.put(fruit);
      await repository.substitutionGroups.put(acompanhamentos);

      expect(
        (await repository.substitutionGroups.list()).map((g) => g.name),
      ).toEqual(["Acompanhamentos", "Frutas", "Grãos"]);

      await repository.substitutionGroups.remove(fruit.id);
      expect(
        (await repository.substitutionGroups.list()).map((g) => g.name),
      ).toEqual(["Acompanhamentos", "Grãos"]);
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
      const group = makeGroup();
      await repository.profile.save(profile);
      await repository.weight.put(entry);
      await repository.diets.put(diet);
      await repository.customFoods.put(food);
      await repository.substitutionGroups.put(group);
      await repository.training.save(makeRotation());
      await repository.trainingSessions.put(makeSession());
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
      expect(snapshot.substitutionGroups).toEqual([group]);
      expect(snapshot.training).toEqual(makeRotation());
      // The export is the only backup this architecture offers, and the log is
      // the only copy of it — a file that left it out would be a file whose
      // restore silently deleted somebody's training history.
      expect(snapshot.trainingSessions).toEqual([makeSession()]);
      expect(snapshot.settings.lastBackupAt).toBe("2026-08-17T09:00:00.000Z");
    });

    it("survives a full export/import round-trip", async () => {
      await repository.profile.save(makeProfile());
      await repository.weight.put(makeWeight({ date: "2026-08-01" }));
      await repository.weight.put(makeWeight({ date: "2026-08-17" }));
      await repository.diets.put(makeDiet());
      await repository.customFoods.put(makeFood());
      await repository.substitutionGroups.put(makeGroup());
      await repository.training.save(makeRotation());
      await repository.trainingSessions.put(makeSession({ id: "a" }));
      await repository.trainingSessions.put(
        makeSession({ id: "b", finishedAt: "2026-08-19T18:40:00.000Z" }),
      );

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
      expect(restored.substitutionGroups).toEqual(snapshot.substitutionGroups);
      expect(restored.training).toEqual(snapshot.training);
      expect(restored.trainingSessions).toEqual(snapshot.trainingSessions);
    });

    it("leaves no rotation behind when the file has none", async () => {
      const empty = await repository.exportAll();
      await repository.training.save(makeRotation());

      await repository.importAll(empty);

      // A restore replaces; it does not merge. A split left over from before
      // would be the one thing on the device the file did not put there.
      await expect(repository.training.get()).resolves.toBeUndefined();
    });

    it("leaves no sessions behind when the file has none", async () => {
      const empty = await repository.exportAll();
      await repository.trainingSessions.put(makeSession());

      await repository.importAll(empty);

      await expect(repository.trainingSessions.list()).resolves.toEqual([]);
    });

    it("restores a file written before the log existed, unchanged", async () => {
      // Schema 2 and older have no `trainingSessions` at all. Absent has to
      // read as absent rather than as an error: it is what every device that
      // has never opened the training screen looks like anyway.
      await repository.profile.save(makeProfile());
      const snapshot = await repository.exportAll();
      const older = { ...snapshot, schemaVersion: 2 };
      delete older.trainingSessions;

      await repository.clearAll();
      await repository.importAll(older);

      await expect(repository.profile.get()).resolves.toEqual(makeProfile());
      await expect(repository.trainingSessions.list()).resolves.toEqual([]);
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
      await repository.substitutionGroups.put(makeGroup());
      await repository.training.save(makeRotation());
      await repository.trainingSessions.put(makeSession());
      await repository.settings.patch({
        lastBackupAt: "2026-08-17T09:00:00.000Z",
      });

      await repository.clearAll();

      await expect(repository.profile.get()).resolves.toBeUndefined();
      await expect(repository.weight.list()).resolves.toEqual([]);
      await expect(repository.diets.list()).resolves.toEqual([]);
      await expect(repository.customFoods.list()).resolves.toEqual([]);
      await expect(repository.substitutionGroups.list()).resolves.toEqual([]);
      await expect(repository.training.get()).resolves.toBeUndefined();
      await expect(repository.trainingSessions.list()).resolves.toEqual([]);
      await expect(repository.settings.get()).resolves.toEqual(
        DEFAULT_SETTINGS,
      );
    });
  });
});
