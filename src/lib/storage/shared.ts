import { routing } from "@/i18n/routing";

import { SNAPSHOT_SCHEMA_VERSION, type Settings, type Snapshot } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  locale: routing.defaultLocale,
};

export function emptySnapshot(): Snapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    weight: [],
    diets: [],
    customFoods: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/**
 * Copy on the way in and on the way out of the in-memory adapter.
 *
 * IndexedDB structurally clones everything it stores, so a caller that mutates
 * an object it wrote earlier does not corrupt the Dexie-backed store. Without
 * this, the in-memory adapter would hand out live references, quietly behave
 * *better* than the real one, and let a mutation bug pass the contract suite
 * and fail in production.
 */
export function clone<T>(value: T): T {
  return structuredClone(value);
}
