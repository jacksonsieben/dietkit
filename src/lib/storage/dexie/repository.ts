import { fold } from "@/lib/text";

import type { Repository } from "../repository";
import type {
  Profile,
  Settings,
  Snapshot,
  TrainingRotation,
} from "../types";
import { SNAPSHOT_SCHEMA_VERSION } from "../types";
import { DEFAULT_SETTINGS, customFoodHaystack } from "../shared";
import {
  SINGLETON_KEY,
  createDietKitDatabase,
  type DietKitDatabase,
} from "./db";

function stripKey<T extends { id: string }>(row: T): Omit<T, "id"> {
  const { id: _id, ...rest } = row;
  return rest;
}

/**
 * The only place in the codebase allowed to know IndexedDB exists — enforced by
 * the `no-restricted-imports` rule on `dexie` in `eslint.config.mjs`.
 */
export function createDexieRepository(
  db: DietKitDatabase = createDietKitDatabase(),
): Repository {
  return {
    profile: {
      async get() {
        const row = await db.profile.get(SINGLETON_KEY);
        return row ? (stripKey(row) as Profile) : undefined;
      },
      async save(profile) {
        await db.profile.put({ ...profile, id: SINGLETON_KEY });
      },
      async clear() {
        await db.profile.delete(SINGLETON_KEY);
      },
    },

    weight: {
      async list() {
        return db.weight.orderBy("date").toArray();
      },
      async getByDate(date) {
        return db.weight.where("date").equals(date).first();
      },
      async latest() {
        return db.weight.orderBy("date").last();
      },
      async put(entry) {
        // The `&date` index would reject a second row for the same day with a
        // ConstraintError. Re-logging a day is an edit, so drop the old row
        // first — in one transaction, so a failure can't leave the day blank.
        await db.transaction("rw", db.weight, async () => {
          const sameDay = await db.weight.where("date").equals(entry.date).first();
          if (sameDay && sameDay.id !== entry.id) {
            await db.weight.delete(sameDay.id);
          }
          await db.weight.put(entry);
        });
      },
      async remove(id) {
        await db.weight.delete(id);
      },
    },

    diets: {
      async list() {
        return db.diets.orderBy("updatedAt").reverse().toArray();
      },
      async get(id) {
        return db.diets.get(id);
      },
      async put(diet) {
        await db.diets.put(diet);
      },
      async remove(id) {
        await db.diets.delete(id);
      },
    },

    customFoods: {
      async list() {
        return db.customFoods.orderBy("name").toArray();
      },
      async get(id) {
        return db.customFoods.get(id);
      },
      async search(term) {
        const needle = fold(term);
        if (needle === "") return [];
        // A scan, not an index lookup: IndexedDB indexes are byte-ordered, so
        // they can't answer accent-insensitive *substring* queries. A user's own
        // food list is tens of rows, and a derived index column would be one
        // more thing to keep in sync for no measurable gain at that size.
        const matches = await db.customFoods
          .filter((food) => customFoodHaystack(food).includes(needle))
          .toArray();
        return matches.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      },
      async put(food) {
        await db.customFoods.put(food);
      },
      async remove(id) {
        await db.customFoods.delete(id);
      },
    },

    substitutionGroups: {
      async list() {
        return db.substitutionGroups.orderBy("name").toArray();
      },
      async get(id) {
        return db.substitutionGroups.get(id);
      },
      async put(group) {
        await db.substitutionGroups.put(group);
      },
      async remove(id) {
        await db.substitutionGroups.delete(id);
      },
    },

    training: {
      async get() {
        const row = await db.training.get(SINGLETON_KEY);
        return row ? (stripKey(row) as TrainingRotation) : undefined;
      },
      async save(rotation) {
        await db.training.put({ ...rotation, id: SINGLETON_KEY });
      },
      async clear() {
        await db.training.delete(SINGLETON_KEY);
      },
    },

    trainingSessions: {
      async list() {
        return db.trainingSessions.orderBy("finishedAt").reverse().toArray();
      },
      async get(id) {
        return db.trainingSessions.get(id);
      },
      async put(session) {
        await db.trainingSessions.put(session);
      },
      async remove(id) {
        await db.trainingSessions.delete(id);
      },
    },

    settings: {
      async get() {
        const row = await db.settings.get(SINGLETON_KEY);
        return row
          ? { ...DEFAULT_SETTINGS, ...(stripKey(row) as Settings) }
          : { ...DEFAULT_SETTINGS };
      },
      async patch(changes) {
        return db.transaction("rw", db.settings, async () => {
          const row = await db.settings.get(SINGLETON_KEY);
          const current = row
            ? { ...DEFAULT_SETTINGS, ...(stripKey(row) as Settings) }
            : { ...DEFAULT_SETTINGS };
          const next: Settings = { ...current, ...changes };
          await db.settings.put({ ...next, id: SINGLETON_KEY });
          return next;
        });
      },
    },

    async exportAll(): Promise<Snapshot> {
      return db.transaction(
        "r",
        [
          db.profile,
          db.weight,
          db.diets,
          db.customFoods,
          db.substitutionGroups,
          db.training,
          db.trainingSessions,
          db.settings,
        ],
        async () => {
          const [
            profileRow,
            weight,
            diets,
            customFoods,
            substitutionGroups,
            trainingRow,
            trainingSessions,
            settingsRow,
          ] = await Promise.all([
            db.profile.get(SINGLETON_KEY),
            db.weight.orderBy("date").toArray(),
            db.diets.toArray(),
            db.customFoods.toArray(),
            db.substitutionGroups.toArray(),
            db.training.get(SINGLETON_KEY),
            db.trainingSessions.orderBy("finishedAt").reverse().toArray(),
            db.settings.get(SINGLETON_KEY),
          ]);

          return {
            schemaVersion: SNAPSHOT_SCHEMA_VERSION,
            exportedAt: new Date().toISOString(),
            profile: profileRow ? (stripKey(profileRow) as Profile) : undefined,
            weight,
            diets,
            customFoods,
            substitutionGroups,
            ...(trainingRow
              ? { training: stripKey(trainingRow) as TrainingRotation }
              : {}),
            ...(trainingSessions.length > 0 ? { trainingSessions } : {}),
            settings: settingsRow
              ? { ...DEFAULT_SETTINGS, ...(stripKey(settingsRow) as Settings) }
              : { ...DEFAULT_SETTINGS },
          };
        },
      );
    },

    async importAll(snapshot) {
      // Restore replaces; it does not merge. Merging two devices' histories
      // without a sync protocol silently invents data, and a restore that
      // half-applies is worse than one that fails — hence the single
      // transaction across every table.
      await db.transaction(
        "rw",
        [
          db.profile,
          db.weight,
          db.diets,
          db.customFoods,
          db.substitutionGroups,
          db.training,
          db.trainingSessions,
          db.settings,
        ],
        async () => {
          await Promise.all([
            db.profile.clear(),
            db.weight.clear(),
            db.diets.clear(),
            db.customFoods.clear(),
            db.substitutionGroups.clear(),
            db.training.clear(),
            db.trainingSessions.clear(),
            db.settings.clear(),
          ]);

          if (snapshot.profile) {
            await db.profile.put({ ...snapshot.profile, id: SINGLETON_KEY });
          }
          await db.weight.bulkPut(snapshot.weight);
          await db.diets.bulkPut(snapshot.diets);
          await db.customFoods.bulkPut(snapshot.customFoods);
          await db.substitutionGroups.bulkPut(snapshot.substitutionGroups);
          if (snapshot.training) {
            await db.training.put({ ...snapshot.training, id: SINGLETON_KEY });
          }
          await db.trainingSessions.bulkPut(snapshot.trainingSessions ?? []);
          await db.settings.put({
            ...DEFAULT_SETTINGS,
            ...snapshot.settings,
            id: SINGLETON_KEY,
          });
        },
      );
    },

    async clearAll() {
      await db.transaction(
        "rw",
        [
          db.profile,
          db.weight,
          db.diets,
          db.customFoods,
          db.substitutionGroups,
          db.training,
          db.trainingSessions,
          db.settings,
        ],
        async () => {
          await Promise.all([
            db.profile.clear(),
            db.weight.clear(),
            db.diets.clear(),
            db.customFoods.clear(),
            db.substitutionGroups.clear(),
            db.training.clear(),
            db.trainingSessions.clear(),
            db.settings.clear(),
          ]);
        },
      );
    },
  };
}
