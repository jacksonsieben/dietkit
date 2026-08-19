import { routing } from "@/i18n/routing";
import { fold } from "@/lib/text";

import {
  SNAPSHOT_SCHEMA_VERSION,
  type CustomFood,
  type Settings,
  type Snapshot,
} from "./types";

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
    substitutionGroups: [],
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

/**
 * What a search for a custom food looks in: the name and the brand, folded.
 *
 * Here rather than in each adapter because two adapters that fold different
 * fields are two search engines, and the one that ships is whichever the device
 * happened to get. The brand is in it because that is how people look for the
 * things TACO does not have — "growth", not the flavour they typed as a name.
 */
export function customFoodHaystack(food: CustomFood): string {
  return fold(`${food.name} ${food.brand ?? ""}`);
}
