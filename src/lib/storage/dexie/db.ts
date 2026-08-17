import Dexie, { type Table } from "dexie";

import type {
  CustomFood,
  Diet,
  Profile,
  Settings,
  WeightEntry,
} from "../types";

/** Profile and settings are single rows; a fixed key keeps them addressable. */
export const SINGLETON_KEY = "singleton";

export type ProfileRow = Profile & { id: typeof SINGLETON_KEY };
export type SettingsRow = Settings & { id: typeof SINGLETON_KEY };

export class DietKitDatabase extends Dexie {
  profile!: Table<ProfileRow, string>;
  weight!: Table<WeightEntry, string>;
  diets!: Table<Diet, string>;
  customFoods!: Table<CustomFood, string>;
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
