import type { EnrollmentStore } from "@/lib/sync/enrollment";
import type { Journal } from "@/lib/sync/journal";

import type { Repository } from "./repository";
import { createDietKitDatabase, type DietKitDatabase } from "./dexie/db";
import { createDexieEnrollmentStore } from "./dexie/enrollment";
import { createDexieJournal } from "./dexie/journal";
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

let database: DietKitDatabase | undefined;
let instance: Repository | undefined;
let decorated: Repository | undefined;

/**
 * The app's one way in. Components call this; nothing constructs an adapter
 * directly, so swapping the implementation is a change to this function alone.
 *
 * Throws on the server rather than falling back to an in-memory store. The
 * whole architecture rests on personal data never reaching the server
 * (docs/DECISIONS.md § D1), so a server-side read is a bug to surface loudly,
 * not to paper over with an empty store that would make the page render
 * plausible-looking nonsense.
 *
 * When sync is on, this hands back the decorator instead (#96). Every caller in
 * the app asks for the repository at the moment it needs one and none of them
 * hold on to it, so turning sync on part-way through a session reaches every
 * screen without a reload.
 */
export function getRepository(): Repository {
  if (typeof indexedDB === "undefined") {
    throw new Error(
      "getRepository() was called where IndexedDB does not exist — personal " +
        "data is device-only, so it must be read from a client component.",
    );
  }

  return decorated ?? adapter();
}

/**
 * Wraps the repository for as long as sync is on (#96).
 *
 * `wrap` is handed the real adapter and returns something that behaves like it
 * — in practice `createSyncRepository`, which passes every write through and
 * writes a journal entry beside it. Installing twice replaces the wrapper
 * rather than stacking two (see `adapter()`).
 *
 * Returns the wrapper, so the caller that installed it can drive `sync()`
 * without going back through `getRepository()` and re-narrowing the type.
 */
export function installRepository<T extends Repository>(
  wrap: (inner: Repository) => T,
): T {
  decorated = wrap(adapter());
  return decorated as T;
}

/**
 * The device's own store, underneath whatever is decorating it.
 *
 * The decorator has to be built around *this* and not around whatever
 * `getRepository()` currently answers, or installing twice would wrap the
 * wrapper: every write journalled twice, and the second copy pushed as a
 * conflict with itself.
 */
function adapter(): Repository {
  instance ??= createDexieRepository(connection());
  return instance;
}

/**
 * The device's one open connection.
 *
 * One rather than several because the journal, the enrollment and the records
 * are in the same IndexedDB database and sync writes across them in a
 * transaction — `createDexieJournal.clear()` touches two tables at once, and
 * Dexie can only do that within a single connection. Two connections would
 * also mean two version-upgrade handlers racing on the first load after a
 * schema change.
 */
function connection(): DietKitDatabase {
  return (database ??= createDietKitDatabase());
}

/**
 * What this device has and has not yet sent (#95), over that connection.
 *
 * Exported from here rather than imported from `./dexie/` directly because the
 * seam is the point: eslint stops the rest of `src/` from reaching into the
 * adapter folder, and sync is not an exception to that — it just needs two
 * more things out of the same database as the records.
 */
export function deviceJournal(): Journal {
  return createDexieJournal(connection());
}

/** What this device remembers about being enrolled in sync (#96). */
export function deviceEnrollment(): EnrollmentStore {
  return createDexieEnrollmentStore(connection());
}

/** Sync off: writes stop being journalled from the next call onward. */
export function uninstallRepository(): void {
  decorated = undefined;
}

/** Test seam: forces the next `getRepository()` to build a fresh adapter. */
export function resetRepository(): void {
  database = undefined;
  instance = undefined;
  decorated = undefined;
}
