import type { Repository } from "./repository";
import { createDexieRepository } from "./dexie/repository";

export type {
  CustomFoodRepository,
  DietRepository,
  ProfileRepository,
  Repository,
  SettingsRepository,
  TrainingRepository,
  WeightRepository,
} from "./repository";
export type {
  CustomFood,
  Diet,
  DietItem,
  FoodRef,
  Id,
  IsoDate,
  IsoTimestamp,
  MacroSet,
  Meal,
  Profile,
  Settings,
  Sex,
  Snapshot,
  TrainingRotation,
  WeightEntry,
} from "./types";
export { SNAPSHOT_SCHEMA_VERSION } from "./types";
export { DEFAULT_SETTINGS, customFoodHaystack } from "./shared";
export { createMemoryRepository } from "./memory";

let instance: Repository | undefined;

/**
 * The app's one way in. Components call this; nothing constructs an adapter
 * directly, so swapping the implementation is a change to this function alone.
 *
 * Throws on the server rather than falling back to an in-memory store. The
 * whole architecture rests on personal data never reaching the server
 * (docs/DECISIONS.md § D1), so a server-side read is a bug to surface loudly,
 * not to paper over with an empty store that would make the page render
 * plausible-looking nonsense.
 */
export function getRepository(): Repository {
  if (typeof indexedDB === "undefined") {
    throw new Error(
      "getRepository() was called where IndexedDB does not exist — personal " +
        "data is device-only, so it must be read from a client component.",
    );
  }

  instance ??= createDexieRepository();
  return instance;
}

/** Test seam: forces the next `getRepository()` to build a fresh adapter. */
export function resetRepository(): void {
  instance = undefined;
}
