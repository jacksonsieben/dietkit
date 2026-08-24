import { fold } from "@/lib/text";

import type {
  CustomFood,
  Diet,
  Id,
  IsoDate,
  Profile,
  Settings,
  Snapshot,
  SubstitutionGroup,
  TrainingRotation,
  TrainingSession,
  WeightEntry,
} from "./types";
import type { Repository } from "./repository";
import { SNAPSHOT_SCHEMA_VERSION } from "./types";
import { DEFAULT_SETTINGS, clone, customFoodHaystack } from "./shared";

interface MemoryState {
  profile?: Profile;
  weight: Map<Id, WeightEntry>;
  diets: Map<Id, Diet>;
  customFoods: Map<Id, CustomFood>;
  substitutionGroups: Map<Id, SubstitutionGroup>;
  training?: TrainingRotation;
  trainingSessions: Map<Id, TrainingSession>;
  settings: Settings;
}

function emptyState(): MemoryState {
  return {
    profile: undefined,
    weight: new Map(),
    diets: new Map(),
    customFoods: new Map(),
    substitutionGroups: new Map(),
    training: undefined,
    trainingSessions: new Map(),
    settings: { ...DEFAULT_SETTINGS },
  };
}

/**
 * The proof that the `Repository` seam is real.
 *
 * Issue #5 asks for a swappable adapter "demonstrated with an in-memory
 * implementation used by tests", and this is it — but it is not test-only
 * scaffolding. It is the second implementation that makes the shared contract
 * suite meaningful, and it is what a future sync adapter gets written against.
 *
 * Deliberately has no persistence: it exists to prove nothing above this layer
 * depends on IndexedDB.
 */
export function createMemoryRepository(): Repository {
  let state = emptyState();

  return {
    profile: {
      async get() {
        return state.profile ? clone(state.profile) : undefined;
      },
      async save(profile) {
        state.profile = clone(profile);
      },
      async clear() {
        state.profile = undefined;
      },
    },

    weight: {
      async list() {
        return [...state.weight.values()]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map(clone);
      },
      async getByDate(date: IsoDate) {
        const found = [...state.weight.values()].find(
          (entry) => entry.date === date,
        );
        return found ? clone(found) : undefined;
      },
      async latest() {
        const sorted = [...state.weight.values()].sort((a, b) =>
          a.date.localeCompare(b.date),
        );
        const last = sorted.at(-1);
        return last ? clone(last) : undefined;
      },
      async put(entry) {
        // Keyed on the day, not the id: re-logging a date replaces it.
        for (const existing of state.weight.values()) {
          if (existing.date === entry.date && existing.id !== entry.id) {
            state.weight.delete(existing.id);
          }
        }
        state.weight.set(entry.id, clone(entry));
      },
      async remove(id) {
        state.weight.delete(id);
      },
    },

    diets: {
      async list() {
        return [...state.diets.values()]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map(clone);
      },
      async get(id) {
        const found = state.diets.get(id);
        return found ? clone(found) : undefined;
      },
      async put(diet) {
        state.diets.set(diet.id, clone(diet));
      },
      async remove(id) {
        state.diets.delete(id);
      },
    },

    customFoods: {
      async list() {
        return [...state.customFoods.values()]
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
          .map(clone);
      },
      async get(id) {
        const found = state.customFoods.get(id);
        return found ? clone(found) : undefined;
      },
      async search(term) {
        const needle = fold(term);
        if (needle === "") return [];
        return [...state.customFoods.values()]
          .filter((food) => customFoodHaystack(food).includes(needle))
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
          .map(clone);
      },
      async put(food) {
        state.customFoods.set(food.id, clone(food));
      },
      async remove(id) {
        state.customFoods.delete(id);
      },
    },

    substitutionGroups: {
      async list() {
        return [...state.substitutionGroups.values()]
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
          .map(clone);
      },
      async get(id) {
        const found = state.substitutionGroups.get(id);
        return found ? clone(found) : undefined;
      },
      async put(group) {
        state.substitutionGroups.set(group.id, clone(group));
      },
      async remove(id) {
        state.substitutionGroups.delete(id);
      },
    },

    training: {
      async get() {
        return state.training ? clone(state.training) : undefined;
      },
      async save(rotation) {
        state.training = clone(rotation);
      },
      async clear() {
        state.training = undefined;
      },
    },

    trainingSessions: {
      async list() {
        return sessionsNewestFirst(state);
      },
      async get(id) {
        const found = state.trainingSessions.get(id);
        return found ? clone(found) : undefined;
      },
      async put(session) {
        state.trainingSessions.set(session.id, clone(session));
      },
      async remove(id) {
        state.trainingSessions.delete(id);
      },
    },

    settings: {
      async get() {
        return clone(state.settings);
      },
      async patch(changes) {
        state.settings = { ...state.settings, ...clone(changes) };
        return clone(state.settings);
      },
    },

    async exportAll(): Promise<Snapshot> {
      return {
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        profile: state.profile ? clone(state.profile) : undefined,
        weight: [...state.weight.values()]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map(clone),
        diets: [...state.diets.values()].map(clone),
        customFoods: [...state.customFoods.values()].map(clone),
        substitutionGroups: [...state.substitutionGroups.values()].map(clone),
        ...(state.training ? { training: clone(state.training) } : {}),
        ...(state.trainingSessions.size > 0
          ? { trainingSessions: sessionsNewestFirst(state) }
          : {}),
        settings: clone(state.settings),
      };
    },

    async importAll(snapshot) {
      const next = emptyState();
      next.profile = snapshot.profile ? clone(snapshot.profile) : undefined;
      for (const entry of snapshot.weight) next.weight.set(entry.id, clone(entry));
      for (const diet of snapshot.diets) next.diets.set(diet.id, clone(diet));
      for (const food of snapshot.customFoods) {
        next.customFoods.set(food.id, clone(food));
      }
      for (const group of snapshot.substitutionGroups) {
        next.substitutionGroups.set(group.id, clone(group));
      }
      next.training = snapshot.training ? clone(snapshot.training) : undefined;
      for (const session of snapshot.trainingSessions ?? []) {
        next.trainingSessions.set(session.id, clone(session));
      }
      next.settings = { ...DEFAULT_SETTINGS, ...clone(snapshot.settings) };
      state = next;
    },

    async clearAll() {
      state = emptyState();
    },
  };
}

/** Most recent first, matching the `finishedAt` index the Dexie adapter reads. */
function sessionsNewestFirst(state: MemoryState): TrainingSession[] {
  return [...state.trainingSessions.values()]
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
    .map(clone);
}
