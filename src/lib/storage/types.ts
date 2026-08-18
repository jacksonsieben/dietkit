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
  /**
   * Per 100 g, like every TACO row, so the two kinds of food are one kind of
   * number everywhere downstream. The `kcal` in here is *derived* from the
   * three macros rather than typed — see `deriveKcal` in src/lib/foods/custom.ts
   * for why a label's own energy figure is not what gets stored.
   */
  per100g: MacroSet;
  /**
   * One portion, in grams, when the food comes in portions: a 30 g scoop, a
   * 25 g slice. Optional because most foods do not — and because a serving is
   * a convenience for entering quantities, never a unit anything is stored in.
   * Grams are the only unit that crosses this boundary (docs/DECISIONS.md § D7).
   */
  servingG?: number;
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
  /**
   * The fraction of the day's targets this meal is meant to carry (#18).
   *
   * A share per meal rather than an even split computed from the count,
   * because breakfast and lunch are not the same meal in any plan anyone
   * actually eats. Stored as a fraction of one rather than a percentage so
   * nothing has to agree on where the decimal point goes, and normalised on
   * read (`distributeTargets`) rather than trusted: this is a device store an
   * import can hand-edit, and shares that do not add to one are a plan that
   * silently feeds the user the wrong amount.
   */
  share: number;
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

/**
 * The three things a goal can be, in the words people already use for them.
 *
 * The direction lives here rather than in the sign of a number, which is what
 * makes an unsigned adjustment safe: "cut" and "bulk" are a choice, and a
 * forgotten minus in front of 500 is not a choice anyone made.
 */
export const GOAL_KINDS = ["lose", "maintain", "gain"] as const;

export type GoalKind = (typeof GOAL_KINDS)[number];

/** How an energy figure was expressed: absolute, or as a share of something. */
export const ENERGY_UNITS = ["kcal", "percent"] as const;

export type EnergyUnit = (typeof ENERGY_UNITS)[number];

/**
 * How the daily targets are derived from expenditure (#15).
 *
 * Stored rather than recomputed from scratch each visit because it is a
 * decision, not a measurement: the goal and the numbers under it are what the
 * user chose, and bodyweight moving under them is the whole point — the grams
 * are expected to follow the weight log without anyone retyping anything.
 */
export interface MacroGoal {
  kind: GoalKind;
  /**
   * Unsigned — `kind` says which side of maintenance it falls on — and zero on
   * maintenance. `unit` is kept rather than being normalised to kilocalories,
   * because a user who chose "20%" wants to still be on 20% after they lose
   * five kilograms.
   */
  adjustment: { unit: EnergyUnit; value: number };
  /** Grams per kilogram of bodyweight. Carbohydrate fills what is left. */
  proteinGPerKg: number;
  /**
   * Fat as a share of the energy target, or as an absolute number of
   * kilocalories — not per kilogram of bodyweight like protein.
   *
   * The guidance it exists to express is written that way (ISSN/ACSM put fat at
   * 20–30% of intake), and it is the form that keeps behaving sensibly when the
   * target moves: a percentage of a deficit is still a percentage, whereas a
   * fixed g/kg quietly eats a larger and larger share of a shrinking target.
   */
  fat: { unit: EnergyUnit; value: number };
}

export interface Settings {
  locale: AppLocale;
  /** Drives the backup nagging the local-first tradeoff demands (#26). */
  lastBackupAt?: IsoTimestamp;
  backupRemindedAt?: IsoTimestamp;
  /** When the health disclaimer was acknowledged (#10). */
  disclaimerAcceptedAt?: IsoTimestamp;
  /**
   * Absent until the user has set one; the energy screen falls back to
   * `DEFAULT_MACRO_GOAL`. Optional rather than defaulted in `DEFAULT_SETTINGS`
   * so that "never chose" stays distinguishable from "chose the defaults" — and
   * so this file keeps knowing nothing about the arithmetic in lib/energy.
   */
  goal?: MacroGoal;
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
