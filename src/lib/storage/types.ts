import type { AppLocale } from "@/i18n/routing";

/** UUID v4, generated with `crypto.randomUUID()`. */
export type Id = string;

/** Calendar day, `YYYY-MM-DD`. Deliberately not a `Date`: a weight is logged on
 *  a day, not at an instant, and day-granularity strings can't drift across
 *  timezones the way an epoch timestamp silently does. */
export type IsoDate = string;

/** Full ISO-8601 instant, `YYYY-MM-DDTHH:mm:ss.sssZ`. */
export type IsoTimestamp = string;

export type Sex = "male" | "female";

/** Everything is metric — docs/DECISIONS.md § D7. */
export interface MacroSet {
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

/**
 * Note what is *absent*: weight. The current weight always comes from the
 * weight log, so "use my latest weight" (#25) reads one source rather than
 * reconciling a profile field that goes stale the first time someone logs.
 *
 * `birthDate` rather than age for the same reason — an age recorded once is
 * wrong within a year.
 */
export interface Profile {
  heightCm: number;
  birthDate: IsoDate;
  sex: Sex;
  /** Shown in the picker and under the result, overridable 1.0–2.5 (#14). */
  activityFactor: number;
  updatedAt: IsoTimestamp;
}

export interface WeightEntry {
  id: Id;
  /** Unique. Logging the same day twice edits that day rather than stacking. */
  date: IsoDate;
  weightKg: number;
  note?: string;
  recordedAt: IsoTimestamp;
}

export interface CustomFood {
  id: Id;
  name: string;
  brand?: string;
  per100g: MacroSet;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

/**
 * A diet item points at either a TACO row (reference data, on the server) or a
 * custom food (personal data, on the device). Keeping the two apart in the type
 * is what stops a custom food ever being written to a server table.
 */
export type FoodRef =
  | { source: "taco"; tacoId: number }
  | { source: "custom"; customFoodId: Id };

export interface DietItem {
  id: Id;
  food: FoodRef;
  quantityG: number;
  /** Credited against the meal target before scaling (P2). */
  mandatory: boolean;
  /** Per-food bounds the joint solver optimises within (#6, #19). */
  minG: number;
  maxG: number;
  /** Items sharing a group are interchangeable — the fruit swap, generalised (#20). */
  substitutionGroupId?: Id;
}

export interface Meal {
  id: Id;
  name: string;
  items: DietItem[];
}

export interface Diet {
  id: Id;
  name: string;
  targets: MacroSet;
  /** Count is the user's, never hardcoded to four (#18). */
  meals: Meal[];
  /** The weight this plan was calculated from, so a later plan can show drift. */
  basedOnWeightKg?: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface Settings {
  locale: AppLocale;
  /** Drives the backup nagging the local-first tradeoff demands (#26). */
  lastBackupAt?: IsoTimestamp;
  backupRemindedAt?: IsoTimestamp;
  /** When the health disclaimer was acknowledged (#10). */
  disclaimerAcceptedAt?: IsoTimestamp;
}

export const SNAPSHOT_SCHEMA_VERSION = 1;

/**
 * The whole of a user's data in one object — the shape of the JSON export that
 * is the *only* backup they have (docs/SCOPE.md § 3). `schemaVersion` is here
 * from the first release because a restore path that can't tell which format it
 * is reading is a restore path that breaks on the first migration.
 */
export interface Snapshot {
  schemaVersion: number;
  exportedAt: IsoTimestamp;
  profile?: Profile;
  weight: WeightEntry[];
  diets: Diet[];
  customFoods: CustomFood[];
  settings: Settings;
}
