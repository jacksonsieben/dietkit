import { describe, expect, it } from "vitest";

import { createMemoryRepository } from "@/lib/storage/memory";
import { DEFAULT_SETTINGS } from "@/lib/storage/shared";
import type { Snapshot } from "@/lib/storage/types";
import { SNAPSHOT_SCHEMA_VERSION } from "@/lib/storage/types";

import type { CollectionName } from "./collections";
import {
  COLLECTIONS,
  SINGLETON_ID,
  applyRecord,
  readCollection,
  recordUpdatedAt,
  removeRecord,
} from "./collections";

/**
 * One sample record per collection, each carrying a timestamp that is *not*
 * `"2026-01-01T00:00:00.000Z"` in any other field, so a `recordUpdatedAt` that
 * read the wrong field would return the wrong string rather than a coincidence.
 */
const SAMPLES: Record<
  CollectionName,
  { id: string; value: unknown; updatedAt: string | undefined }
> = {
  profile: {
    id: SINGLETON_ID,
    value: {
      heightCm: 178,
      birthDate: "1994-03-21",
      sex: "male",
      activityFactor: 1.55,
      updatedAt: "2026-03-01T10:00:00.000Z",
    },
    updatedAt: "2026-03-01T10:00:00.000Z",
  },
  weight: {
    id: "weight-1",
    value: {
      id: "weight-1",
      date: "2026-03-02",
      weightKg: 81.4,
      recordedAt: "2026-03-02T07:15:00.000Z",
    },
    // `recordedAt`, not `date`: the day it is about and the moment it was typed
    // are different facts, and only the second one can order two writes.
    updatedAt: "2026-03-02T07:15:00.000Z",
  },
  diets: {
    id: "diet-1",
    value: {
      id: "diet-1",
      name: "Cutting",
      targets: { kcal: 2200, proteinG: 180, carbG: 200, fatG: 60 },
      meals: [],
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-03T10:00:00.000Z",
    },
    updatedAt: "2026-03-03T10:00:00.000Z",
  },
  customFoods: {
    id: "food-1",
    value: {
      id: "food-1",
      name: "Whey",
      per100g: { kcal: 400, proteinG: 80, carbG: 8, fatG: 6 },
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-04T10:00:00.000Z",
    },
    updatedAt: "2026-03-04T10:00:00.000Z",
  },
  substitutionGroups: {
    id: "group-1",
    value: {
      id: "group-1",
      name: "Frutas",
      foods: [],
      createdAt: "2026-03-01T10:00:00.000Z",
      updatedAt: "2026-03-05T10:00:00.000Z",
    },
    updatedAt: "2026-03-05T10:00:00.000Z",
  },
  training: {
    id: SINGLETON_ID,
    value: {
      splitSlug: "push-pull-legs",
      nextDay: 1,
      updatedAt: "2026-03-06T10:00:00.000Z",
    },
    updatedAt: "2026-03-06T10:00:00.000Z",
  },
  trainingSessions: {
    id: "session-1",
    value: {
      id: "session-1",
      date: "2026-03-07",
      splitSlug: "push-pull-legs",
      dayIndex: 0,
      dayName: "A",
      exercises: [],
      startedAt: "2026-03-07T18:00:00.000Z",
      finishedAt: "2026-03-07T19:02:00.000Z",
    },
    // `finishedAt`: a session is written once, when it ends.
    updatedAt: "2026-03-07T19:02:00.000Z",
  },
  settings: {
    id: SINGLETON_ID,
    value: { ...DEFAULT_SETTINGS },
    updatedAt: undefined,
  },
};

function snapshotOf(collections: CollectionName[]): Snapshot {
  const snapshot: Snapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    exportedAt: "2026-03-08T00:00:00.000Z",
    weight: [],
    diets: [],
    customFoods: [],
    substitutionGroups: [],
    settings: { ...DEFAULT_SETTINGS },
  };

  const record = (collection: CollectionName) =>
    SAMPLES[collection].value as never;

  for (const collection of collections) {
    switch (collection) {
      case "profile":
        snapshot.profile = record(collection);
        break;
      case "training":
        snapshot.training = record(collection);
        break;
      case "settings":
        snapshot.settings = record(collection);
        break;
      case "weight":
        snapshot.weight = [record(collection)];
        break;
      case "diets":
        snapshot.diets = [record(collection)];
        break;
      case "customFoods":
        snapshot.customFoods = [record(collection)];
        break;
      case "substitutionGroups":
        snapshot.substitutionGroups = [record(collection)];
        break;
      case "trainingSessions":
        snapshot.trainingSessions = [record(collection)];
        break;
    }
  }

  return snapshot;
}

describe("the collections sync moves", () => {
  it("has a sample for every one of them", () => {
    // The guard that makes every loop below meaningful. A ninth collection
    // added without a sample fails here rather than being quietly untested.
    expect(Object.keys(SAMPLES).sort()).toEqual([...COLLECTIONS].sort());
  });

  describe("recordUpdatedAt", () => {
    it.each(COLLECTIONS)(
      "knows which field means last written: %s",
      (collection) => {
        const sample = SAMPLES[collection];
        expect(recordUpdatedAt(collection, sample.value)).toBe(
          sample.updatedAt,
        );
      },
    );

    it("names exactly one collection that has no timestamp of its own", () => {
      // Pinned deliberately. `settings` falls back to the journal's write time,
      // which is weaker; if a second collection ever joins it, that is a
      // decision someone should have to make on purpose.
      const without = COLLECTIONS.filter(
        (collection) => SAMPLES[collection].updatedAt === undefined,
      );
      expect(without).toEqual(["settings"]);
    });

    it("returns undefined rather than a lie when the field is missing", () => {
      expect(recordUpdatedAt("diets", { id: "x" })).toBeUndefined();
      expect(
        recordUpdatedAt("weight", { id: "x", recordedAt: 7 }),
      ).toBeUndefined();
    });
  });

  describe("readCollection", () => {
    it.each(COLLECTIONS)("finds the record it was given: %s", (collection) => {
      const sample = SAMPLES[collection];
      expect(readCollection(snapshotOf([collection]), collection)).toEqual([
        { id: sample.id, value: sample.value },
      ]);
    });

    it("finds nothing in the collections a snapshot left out", () => {
      const empty = snapshotOf([]);
      for (const collection of COLLECTIONS) {
        if (collection === "settings") continue;
        expect(readCollection(empty, collection)).toEqual([]);
      }
    });

    it("always finds settings, because an unset store still reads as defaults", () => {
      expect(readCollection(snapshotOf([]), "settings")).toEqual([
        { id: SINGLETON_ID, value: DEFAULT_SETTINGS },
      ]);
    });
  });

  describe("applyRecord and removeRecord", () => {
    it.each(COLLECTIONS)(
      "round-trips one record through a repository: %s",
      async (collection) => {
        const repository = createMemoryRepository();
        const sample = SAMPLES[collection];

        await applyRecord(repository, collection, sample.value);
        expect(
          readCollection(await repository.exportAll(), collection),
        ).toEqual([{ id: sample.id, value: sample.value }]);

        await removeRecord(repository, collection, sample.id);
        const after = readCollection(await repository.exportAll(), collection);
        // Settings cannot be deleted -- an unset store reads back as defaults, so
        // the nearest true thing is that the defaults come back.
        expect(after).toEqual(
          collection === "settings"
            ? [{ id: SINGLETON_ID, value: DEFAULT_SETTINGS }]
            : [],
        );
      },
    );
  });
});
