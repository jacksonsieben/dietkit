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
  { source: "taco"; tacoId: number } | { source: "custom"; customFoodId: Id };

export interface DietItem {
  id: Id;
  food: FoodRef;
  quantityG: number;
  /** Credited against the meal target before scaling (P2). */
  mandatory: boolean;
  /** Per-food bounds the joint solver optimises within (#6, #19). */
  minG: number;
  maxG: number;
  /**
   * The `SubstitutionGroup` this row draws from, if it is a slot rather than a
   * fixed food (#20).
   *
   * On the item, not on the food: the same banana can be a swappable "fruit" in
   * breakfast and the one thing that is definitely happening in the afternoon,
   * and only the row knows which.
   */
  substitutionGroupId?: Id;
}

/**
 * The composition of one TACO row, copied into the plan that uses it (#19).
 *
 * The published table lives on the server; a plan lives on the device and has
 * to still add up on a phone with no signal, which is the whole promise of an
 * offline-first app. So the numbers a meal was solved against travel with the
 * meal rather than being fetched back.
 *
 * The second reason is more important than the first: TACO gets re-ingested,
 * and a row that changes between two visits would silently re-solve someone's
 * plan into different portions with nothing on screen to say why. A quotation
 * copied at the moment the food was chosen is a plan that stays the plan.
 *
 * Custom foods are deliberately *not* snapshotted here. They are the user's own
 * record and an edit to one is meant to reach the plans that use it — that is
 * what `saveCustomFood` keeping the id is for.
 */
export interface FoodComposition {
  tacoId: number;
  /** As TACO prints it, so the plan can be read without the table beside it. */
  name: string;
  per100g: MacroSet;
}

/**
 * A set of foods that may stand in for one another (#20).
 *
 * The predecessor had one of these hardcoded — a list of fruits, swappable in
 * the morning meal and nowhere else — which is the shape of the mistake this
 * generalises. "Interchangeable" is not a property of fruit; it is a decision
 * the person eating makes, and it applies just as well to rice and potato, or
 * to the three protein sources someone actually keeps in the house.
 *
 * So a group is a record the user writes, not a class the app knows. Nothing in
 * the codebase ships a group, and nothing reads a food's TACO category to guess
 * one.
 */
export interface SubstitutionGroup {
  id: Id;
  /** The user's word for the class — "Frutas", "Carboidrato do almoço". */
  name: string;
  /** The interchangeable foods, in the order they were added. */
  foods: FoodRef[];
  /**
   * Composition for every TACO row in `foods`, on the same terms as
   * `Diet.tacoFoods` and for a sharper version of the same reason: the
   * alternatives are, by definition, foods the plan is *not* currently using,
   * so their numbers are nowhere else on the device. Without this, swapping
   * would be the one action in the app that needs a network.
   */
  tacoFoods?: FoodComposition[];
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

/**
 * One way a meal can be made, chosen as a unit (#111).
 *
 * Not a food and not a group of foods: a *set of rows*. The predecessor's
 * breakfast offered `pão branco + fruta + doce de leite` against `aveia + fruta
 * + pasta de amendoim` — different foods, different counts of them, and the
 * choice is one choice. A `SubstitutionGroup` cannot say that, because it swaps
 * one food inside one row, and no amount of grouping turns three rows into one
 * decision.
 *
 * The items are ordinary `DietItem`s, which is the point: quantity, bounds,
 * `mandatory` and a substitution group all keep working inside an option, so
 * "the fruit in whichever breakfast I picked" is still a swappable slot.
 */
export interface DietOption {
  id: Id;
  /** The user's word for this way of doing it — "Aveia", "Ovos". */
  name: string;
  items: DietItem[];
}

/**
 * A decision a meal carries: several options, exactly one of them selected.
 *
 * `selectedId` lives here, on the record, and not in a screen's state. The
 * predecessor learned that one the hard way — its own README calls the lesson
 * *selection-dependence*: the plan, the daily summary and the export all have
 * to render the same choice, and a selection held by a component is a selection
 * the exporter has to guess at.
 *
 * The options that are *not* selected are still part of the plan. They survive
 * a save, a backup and a sync round trip, and their foods keep a snapshot in
 * `Diet.tacoFoods` — for `SubstitutionGroup.tacoFoods`'s reason, sharpened:
 * they are by definition the foods the plan is not using, so their numbers are
 * nowhere else on the device, and switching option would otherwise be the one
 * action in the app that needs a network.
 *
 * They are not the plan *today*, though, so nothing counts them: the solver,
 * the reconciliation panel, `/hoje` and the totals all read the selected option
 * and only the selected option.
 */
export interface OptionSet {
  id: Id;
  /** The user's word for the decision — "Carboidrato", "Proteína". */
  name: string;
  /** Two or more. A set with one option is a decision nobody is making. */
  options: DietOption[];
  /** Which option is on the plate. Always one of `options`. */
  selectedId: Id;
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
  /**
   * The rows that are in this meal however it is made — the predecessor's
   * `fixed_always`: the vegetables, the olive oil, the supplement.
   */
  items: DietItem[];
  /**
   * The decisions this meal offers, if any (#111).
   *
   * Optional because most meals are a list of foods and should stay one: a
   * plan written before this existed has none, and requiring an empty array
   * would make every such plan a migration.
   *
   * What the meal actually contributes is `items` plus the selected option of
   * each set — `effectiveItems` in `src/lib/diet/options.ts` is the single
   * place that says so, and everything that adds a meal up reads it.
   */
  optionSets?: OptionSet[];
}

export interface Diet {
  id: Id;
  name: string;
  targets: MacroSet;
  /** Count is the user's, never hardcoded to four (#18). */
  meals: Meal[];
  /**
   * Composition for every TACO row any meal points at — see `FoodComposition`.
   * Optional because a plan written before #19 has none, and a plan whose meals
   * are still empty needs none.
   */
  tacoFoods?: FoodComposition[];
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

/**
 * Where someone is in a training split (#78).
 *
 * A rotation, not a calendar. The app holds which split was chosen and which
 * of its days comes next, and it advances when a session is finished — so
 * missing a Tuesday moves nothing, because nothing here ever knew about
 * Tuesday. A weekday schedule would have to decide what a skipped day means,
 * and every answer to that is wrong for somebody.
 *
 * The whole record is two facts and a timestamp, which is the point: what a
 * split *contains* is reference data in `src/lib/training/splits.ts`, shipped
 * in the bundle and identical for everyone. Copying a split in here would be a
 * second copy of the prescription that goes stale the moment a rep range is
 * edited.
 *
 * Personal, therefore device-only, like everything else in this file
 * (docs/DECISIONS.md § D1). Which split a person runs is a fact about their
 * body and their week, and the server is never told.
 */
export interface TrainingRotation {
  /** A slug from `splits.ts`. Unresolvable slugs read as "choose again". */
  splitSlug: string;
  /**
   * Index into the split's days, for the session that has not been done yet.
   * Zero on the day the split is chosen — the rotation starts at its first
   * letter rather than at whatever the calendar thinks today is.
   */
  nextDay: number;
  /** Absent until the first session is finished; there is no rotation yet. */
  lastFinishedAt?: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

/**
 * One set, as it was actually performed (#79).
 *
 * Written from what happened, never from what was prescribed. A set checked
 * off with eight reps when the card said twelve is logged as eight, and a set
 * that was never checked off is not in here at all — `done` exists only for
 * the moments between the screen being opened and the session being saved.
 * Nothing rounds a bad session up, because the slice after this one reads these
 * numbers to decide whether a load may go up, and a log that flatters is a log
 * that puts weight on a bar that should not have it.
 */
export interface LoggedSet {
  /**
   * Total reps in the set, across both sides.
   *
   * For a unilateral movement — `unilateral` in the exercise catalog — the
   * screen shows this halved, "8 por lado", and steps it in twos. The total is
   * what gets stored so that every sum downstream is a sum of comparable
   * numbers, with no caller having to know which movements need doubling.
   */
  reps: number;
  /**
   * Kilograms on the bar, the stack, or in the hand.
   *
   * Absent on a bodyweight movement, which carries no external load, and absent
   * on a set somebody logged without recording the weight. Both are real
   * answers and neither is zero: a zero here would read as "lifted nothing",
   * which is a different and false claim.
   *
   * This number is the reason this file is the only place training data lives.
   * There is no column for a kilogram anywhere in the reference database and
   * there is not going to be (docs/DECISIONS.md § D1, § D19).
   */
  loadKg?: number;
}

/** One movement inside a session, and the sets that were done of it. */
export interface LoggedExercise {
  /** A slug from `src/lib/training/catalog.ts`. */
  exercise: string;
  /** In the order they were performed. Empty means the movement was skipped. */
  sets: LoggedSet[];
}

/**
 * A session that happened (#79).
 *
 * The first personal training data the app has ever held, and it holds it the
 * way it holds a weight entry: on the device, in IndexedDB, and nowhere else.
 *
 * `dayName` is copied in rather than looked up from the split, on the same
 * terms as `FoodComposition` in a diet: a split can be renamed or dropped
 * between two releases, and a log of a session nobody can read the name of is a
 * log that lost the thing it was for. The slug and index stay beside it so a
 * later reading can still line sessions up against a split that is still there.
 *
 * Only performed sets reach this record. An exercise nobody touched has an
 * empty `sets`, which is the honest shape of "it was on the card and it did not
 * happen".
 */
export interface TrainingSession {
  id: Id;
  /** The day it happened on, for grouping. `startedAt` is the exact instant. */
  date: IsoDate;
  /** The split it came from. May name a split this build no longer ships. */
  splitSlug: string;
  /** Which of that split's days, zero-based. */
  dayIndex: number;
  /** The day's name as it read on the card that day — "A · Peito, ombros...". */
  dayName: string;
  exercises: LoggedExercise[];
  /**
   * When the first set was checked off, not when the screen was opened.
   *
   * Opening the screen on the sofa is not training, and a duration measured
   * from it would say a session took four hours. The pair with `finishedAt` is
   * what the finish summary means by how long it took.
   */
  startedAt: IsoTimestamp;
  finishedAt: IsoTimestamp;
}

export const SNAPSHOT_SCHEMA_VERSION = 3;

/**
 * The whole of a user's data in one object — the shape of the JSON export that
 * is the *only* backup they have (docs/SCOPE.md § 3). `schemaVersion` is here
 * from the first release because a restore path that can't tell which format it
 * is reading is a restore path that breaks on the first migration.
 *
 * Version 2 added `training` (#78) and version 3 `trainingSessions` (#79).
 * Older files still restore unchanged: a section that is absent reads as
 * absent, which is what a device that has never opened the training screen
 * looks like anyway.
 */
export interface Snapshot {
  schemaVersion: number;
  exportedAt: IsoTimestamp;
  profile?: Profile;
  weight: WeightEntry[];
  diets: Diet[];
  customFoods: CustomFood[];
  substitutionGroups: SubstitutionGroup[];
  /** Absent on a device that has never opened the training screen, and in
   *  every file written before schema 2. */
  training?: TrainingRotation;
  /**
   * Every session ever logged, most recent first. Absent rather than empty on a
   * device that has trained nothing, and in every file written before schema 3.
   *
   * This is the only copy. The export is the only backup this architecture
   * offers (docs/SCOPE.md § 3), so a log the file did not carry would be a log
   * that a restore silently deleted.
   */
  trainingSessions?: TrainingSession[];
  settings: Settings;
}
