import Dexie, { type Table } from "dexie";

import type {
  CustomFood,
  Diet,
  Profile,
  Settings,
  SubstitutionGroup,
  TrainingRotation,
  TrainingSession,
  WeightEntry,
} from "../types";

/** Profile and settings are single rows; a fixed key keeps them addressable. */
export const SINGLETON_KEY = "singleton";

export type ProfileRow = Profile & { id: typeof SINGLETON_KEY };
export type SettingsRow = Settings & { id: typeof SINGLETON_KEY };
export type TrainingRow = TrainingRotation & { id: typeof SINGLETON_KEY };

export class DietKitDatabase extends Dexie {
  profile!: Table<ProfileRow, string>;
  weight!: Table<WeightEntry, string>;
  diets!: Table<Diet, string>;
  customFoods!: Table<CustomFood, string>;
  substitutionGroups!: Table<SubstitutionGroup, string>;
  training!: Table<TrainingRow, string>;
  trainingSessions!: Table<TrainingSession, string>;
  settings!: Table<SettingsRow, string>;

  constructor(name: string) {
    super(name);

    this.version(1).stores({
      profile: "id",
      // `&date` is unique: "one weight per day" is an invariant of the data,
      // not just of the code that writes it, so the store enforces it too.
      weight: "id, &date",
      diets: "id, updatedAt",
      customFoods: "id, name",
      settings: "id",
    });

    // Additive: Dexie carries every table it is not asked about forward, so
    // this adds the store without touching a device's existing rows. A version
    // rather than an edit to version 1 because a browser that already opened
    // the database at version 1 will never re-read it.
    this.version(2).stores({
      substitutionGroups: "id, name",
    });

    // Additive again, on the same terms (#78). One row, keyed like `profile`
    // and `settings`: which split is being run and where the rotation is. No
    // index beyond the key, because there is nothing to look this up *by* —
    // the screen wants the single row and there is only ever one.
    this.version(3).stores({
      training: "id",
    });

    // Additive again (#79). `finishedAt` is indexed because every read of this
    // store is "what happened most recently" — the pre-fill and any history
    // both walk it backwards — and `date` because a session belongs to a day.
    // Nothing here is indexed by exercise: which movements a session contains
    // is a nested array, which IndexedDB cannot index without a derived
    // column, and the log is small enough that the scan is cheaper than a
    // second copy of the truth to keep in sync.
    this.version(4).stores({
      trainingSessions: "id, date, finishedAt",
    });
  }
}

/**
 * A factory rather than a module-level singleton, because a singleton would
 * construct itself at import time — before a test has installed a fake
 * IndexedDB, and on the server during SSR where there is no IndexedDB at all.
 */
export function createDietKitDatabase(name = "dietkit"): DietKitDatabase {
  return new DietKitDatabase(name);
}
