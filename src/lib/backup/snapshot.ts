import { routing } from "@/i18n/routing";
import { DEFAULT_SETTINGS } from "@/lib/storage/shared";
import {
  ENERGY_UNITS,
  GOAL_KINDS,
  SNAPSHOT_SCHEMA_VERSION,
  type CustomFood,
  type Diet,
  type DietItem,
  type FoodComposition,
  type FoodRef,
  type IsoTimestamp,
  type MacroGoal,
  type MacroSet,
  type Meal,
  type Profile,
  type Settings,
  type Snapshot,
  type SubstitutionGroup,
  type TrainingRotation,
  type WeightEntry,
} from "@/lib/storage/types";

/**
 * Reading a backup file back (#26).
 *
 * This is the counterpart to the only copy the user has. Everything personal
 * lives in IndexedDB on one device (docs/DECISIONS.md § D1), so clearing site
 * data or losing a phone destroys months of logs unless a file was written
 * first — and a file is worth nothing if the thing that reads it is not careful.
 *
 * Two failure modes pull in opposite directions, and the whole design here is
 * the trade between them:
 *
 * - **Too strict destroys data.** If one weight row is corrupt and the restore
 *   refuses the file, three hundred good rows were thrown away to protect
 *   against one bad one. That is the wrong trade for a backup of last resort.
 * - **Too loose destroys data too.** A restore replaces everything. Writing a
 *   half-understood file over a working device is worse than not restoring.
 *
 * So the *envelope* is strict and the *records* are tolerant. A file that is
 * not a snapshot, or is a snapshot from a newer DietKit than this one, is
 * refused outright and nothing is touched. Past that, each record is checked on
 * its own: the ones that survive are restored, the ones that do not are dropped
 * and named. Nothing is folded into a bare number — the screen shows which day,
 * which food, which plan was left behind, on the same principle as the
 * predecessor import (#22).
 *
 * Pure, and knows nothing about IndexedDB or React: this file's only job is to
 * decide what a string says.
 */

/**
 * Why a file cannot be read at all. Each of these means nothing was restored
 * and nothing on the device was touched.
 */
export const SNAPSHOT_ERRORS = [
  /** Not JSON. Usually the wrong file entirely, or a truncated download. */
  "notJson",
  /** JSON, but not shaped like a backup: no version, or sections of the wrong type. */
  "notSnapshot",
  /**
   * Written by a newer DietKit than this one. Refused rather than guessed at:
   * a format this version does not know is a format it would restore *wrongly*,
   * and the user would have no way to tell.
   */
  "futureVersion",
] as const;

export type SnapshotError = (typeof SNAPSHOT_ERRORS)[number];

/** The parts of a backup, for naming what was dropped. */
export const DROP_KINDS = [
  "profile",
  "weight",
  "diet",
  "customFood",
  "group",
  "goal",
  "training",
] as const;

export type DropKind = (typeof DROP_KINDS)[number];

export interface Drop {
  kind: DropKind;
  /**
   * What the record called itself, where it said: the day of a weighing, the
   * name of a plan. Absent when the record was too broken to name — which is
   * itself worth showing, rather than hiding the drop.
   */
  subject?: string;
}

export type SnapshotParse =
  | {
      ok: false;
      error: SnapshotError;
      /** On `futureVersion`, what the file claims to be, for the message. */
      version?: number;
    }
  | { ok: true; snapshot: Snapshot; drops: readonly Drop[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositive(value: unknown): value is number {
  return isNumber(value) && value > 0;
}

function isAtLeastZero(value: unknown): value is number {
  return isNumber(value) && value >= 0;
}

/**
 * A calendar day the calendar actually has.
 *
 * The shape test alone would accept `2026-02-31`, which reads back as 3 March
 * and would silently move a weighing to a day it was not taken on.
 */
function isDay(value: unknown): boolean {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;

  const time = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(time)) return false;

  return new Date(time).toISOString().startsWith(value);
}

function isInstant(value: unknown): value is IsoTimestamp {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isMacroSet(value: unknown): value is MacroSet {
  return (
    isObject(value) &&
    isAtLeastZero(value.kcal) &&
    isAtLeastZero(value.proteinG) &&
    isAtLeastZero(value.carbG) &&
    isAtLeastZero(value.fatG)
  );
}

function isFoodRef(value: unknown): value is FoodRef {
  if (!isObject(value)) return false;

  if (value.source === "taco") return isNumber(value.tacoId);
  if (value.source === "custom") return isText(value.customFoodId);

  return false;
}

function isComposition(value: unknown): value is FoodComposition {
  return (
    isObject(value) &&
    isNumber(value.tacoId) &&
    isText(value.name) &&
    isMacroSet(value.per100g)
  );
}

/**
 * Optional fields are checked only when present.
 *
 * An absent `note` and a `note` set to `42` are different files: the first is
 * an ordinary record, the second is corruption. Written out rather than
 * expressed with `??` so that "absent" cannot quietly pass as "valid".
 */
function optional(value: unknown, check: (value: unknown) => boolean): boolean {
  return value === undefined || check(value);
}

function readProfile(value: unknown): Profile | undefined {
  if (
    !isObject(value) ||
    !isPositive(value.heightCm) ||
    !isDay(value.birthDate) ||
    (value.sex !== "male" && value.sex !== "female") ||
    !isPositive(value.activityFactor) ||
    !isInstant(value.updatedAt)
  ) {
    return undefined;
  }

  return {
    heightCm: value.heightCm,
    birthDate: value.birthDate as string,
    sex: value.sex,
    activityFactor: value.activityFactor,
    updatedAt: value.updatedAt,
  };
}

/**
 * The training rotation, or nothing (#78).
 *
 * `nextDay` is checked against the integers rather than against a particular
 * split's length: which splits exist is a property of the build doing the
 * restoring, not of the file, and a rotation pointing past the end of a split
 * that has since been shortened is handled where it is read, by wrapping. A
 * restore that silently discarded it would lose a real choice over a number
 * the screen already knows how to survive.
 */
function readTraining(value: unknown): TrainingRotation | undefined {
  if (
    !isObject(value) ||
    !isText(value.splitSlug) ||
    !isAtLeastZero(value.nextDay) ||
    !Number.isInteger(value.nextDay) ||
    !optional(value.lastFinishedAt, isInstant) ||
    !isInstant(value.updatedAt)
  ) {
    return undefined;
  }

  return {
    splitSlug: value.splitSlug,
    nextDay: value.nextDay,
    ...(isInstant(value.lastFinishedAt)
      ? { lastFinishedAt: value.lastFinishedAt }
      : {}),
    updatedAt: value.updatedAt,
  };
}

function readWeight(value: unknown): WeightEntry | undefined {
  if (
    !isObject(value) ||
    !isText(value.id) ||
    !isDay(value.date) ||
    !isPositive(value.weightKg) ||
    !optional(value.note, (note) => typeof note === "string") ||
    !isInstant(value.recordedAt)
  ) {
    return undefined;
  }

  return {
    id: value.id,
    date: value.date as string,
    weightKg: value.weightKg,
    ...(typeof value.note === "string" && value.note.length > 0
      ? { note: value.note }
      : {}),
    recordedAt: value.recordedAt,
  };
}

function readCustomFood(value: unknown): CustomFood | undefined {
  if (
    !isObject(value) ||
    !isText(value.id) ||
    !isText(value.name) ||
    !optional(value.brand, isText) ||
    !isMacroSet(value.per100g) ||
    !optional(value.servingG, isPositive) ||
    !isInstant(value.createdAt) ||
    !isInstant(value.updatedAt)
  ) {
    return undefined;
  }

  return {
    id: value.id,
    name: value.name,
    ...(isText(value.brand) ? { brand: value.brand } : {}),
    per100g: value.per100g,
    ...(isPositive(value.servingG) ? { servingG: value.servingG } : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function readItem(value: unknown): DietItem | undefined {
  if (
    !isObject(value) ||
    !isText(value.id) ||
    !isFoodRef(value.food) ||
    !isAtLeastZero(value.quantityG) ||
    typeof value.mandatory !== "boolean" ||
    !isAtLeastZero(value.minG) ||
    !isAtLeastZero(value.maxG) ||
    !optional(value.substitutionGroupId, isText)
  ) {
    return undefined;
  }

  return {
    id: value.id,
    food: value.food,
    quantityG: value.quantityG,
    mandatory: value.mandatory,
    minG: value.minG,
    maxG: value.maxG,
    ...(isText(value.substitutionGroupId)
      ? { substitutionGroupId: value.substitutionGroupId }
      : {}),
  };
}

/**
 * A meal, minus any item that did not survive.
 *
 * A broken row does not take the meal down with it: the reconciliation panel
 * (#21) is built to show a plan that does not add up, so a lunch missing one of
 * its four foods is still a lunch the user can see and repair. Losing the whole
 * meal would hide the damage instead of showing it.
 */
function readMeal(value: unknown): Meal | undefined {
  if (
    !isObject(value) ||
    !isText(value.id) ||
    !isText(value.name) ||
    !isNumber(value.share) ||
    !Array.isArray(value.items)
  ) {
    return undefined;
  }

  return {
    id: value.id,
    name: value.name,
    share: value.share,
    items: value.items
      .map(readItem)
      .filter((item): item is DietItem => item !== undefined),
  };
}

function readDiet(value: unknown): Diet | undefined {
  if (
    !isObject(value) ||
    !isText(value.id) ||
    !isText(value.name) ||
    !isMacroSet(value.targets) ||
    !Array.isArray(value.meals) ||
    !optional(value.basedOnWeightKg, isPositive) ||
    !isInstant(value.createdAt) ||
    !isInstant(value.updatedAt)
  ) {
    return undefined;
  }

  return {
    id: value.id,
    name: value.name,
    targets: value.targets,
    meals: value.meals
      .map(readMeal)
      .filter((meal): meal is Meal => meal !== undefined),
    ...(Array.isArray(value.tacoFoods)
      ? { tacoFoods: value.tacoFoods.filter(isComposition) }
      : {}),
    ...(isPositive(value.basedOnWeightKg)
      ? { basedOnWeightKg: value.basedOnWeightKg }
      : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function readGroup(value: unknown): SubstitutionGroup | undefined {
  if (
    !isObject(value) ||
    !isText(value.id) ||
    !isText(value.name) ||
    !Array.isArray(value.foods) ||
    !isInstant(value.createdAt) ||
    !isInstant(value.updatedAt)
  ) {
    return undefined;
  }

  return {
    id: value.id,
    name: value.name,
    foods: value.foods.filter(isFoodRef),
    ...(Array.isArray(value.tacoFoods)
      ? { tacoFoods: value.tacoFoods.filter(isComposition) }
      : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function readGoal(value: unknown): MacroGoal | undefined {
  if (!isObject(value)) return undefined;

  const { kind, adjustment, proteinGPerKg, fat } = value;

  if (!GOAL_KINDS.includes(kind as MacroGoal["kind"])) return undefined;
  if (!isAtLeastZero(proteinGPerKg)) return undefined;

  const energy = (part: unknown) =>
    isObject(part) &&
    ENERGY_UNITS.includes(part.unit as MacroGoal["fat"]["unit"]) &&
    isAtLeastZero(part.value);

  if (!energy(adjustment) || !energy(fat)) return undefined;

  return {
    kind: kind as MacroGoal["kind"],
    adjustment: adjustment as MacroGoal["adjustment"],
    proteinGPerKg,
    fat: fat as MacroGoal["fat"],
  };
}

/**
 * Settings, repaired rather than dropped.
 *
 * Every field here has a defensible fallback and none of them is data the user
 * typed at length, so a malformed corner costs a default instead of costing the
 * restore. The goal is the exception worth reporting: it is a decision the user
 * made on the energy screen (#15), and silently reverting it to the preset
 * would change the numbers on every plan with nothing on screen to say why.
 */
function readSettings(value: unknown, drops: Drop[]): Settings {
  if (!isObject(value)) return { ...DEFAULT_SETTINGS };

  const locale = routing.locales.includes(value.locale as never)
    ? (value.locale as Settings["locale"])
    : DEFAULT_SETTINGS.locale;

  const goal = value.goal === undefined ? undefined : readGoal(value.goal);
  if (value.goal !== undefined && goal === undefined) drops.push({ kind: "goal" });

  return {
    locale,
    ...(isInstant(value.lastBackupAt) ? { lastBackupAt: value.lastBackupAt } : {}),
    ...(isInstant(value.backupRemindedAt)
      ? { backupRemindedAt: value.backupRemindedAt }
      : {}),
    ...(isInstant(value.disclaimerAcceptedAt)
      ? { disclaimerAcceptedAt: value.disclaimerAcceptedAt }
      : {}),
    ...(goal === undefined ? {} : { goal }),
  };
}

/**
 * Reads each entry of a section, keeping what survives and naming what did not.
 *
 * `name` is what the drop is reported as — the day, the food's name — read from
 * the raw value rather than the parsed one, because the whole point is that
 * there is no parsed one.
 */
function readAll<T>(
  raw: readonly unknown[],
  kind: DropKind,
  read: (value: unknown) => T | undefined,
  name: (value: unknown) => string | undefined,
  drops: Drop[],
): T[] {
  const kept: T[] = [];

  for (const value of raw) {
    const record = read(value);
    if (record === undefined) {
      const subject = name(value);
      drops.push(subject === undefined ? { kind } : { kind, subject });
      continue;
    }
    kept.push(record);
  }

  return kept;
}

/** The value of a key, if it is a usable string. Used only to name a drop. */
function label(value: unknown, key: string): string | undefined {
  return isObject(value) && isText(value[key]) ? value[key] : undefined;
}

/** A section that is absent reads as empty; one of the wrong type is corruption. */
function section(value: unknown): readonly unknown[] | undefined {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : undefined;
}

/**
 * Turns the text of a backup file into something restorable, or says why not.
 *
 * Never throws: every path a malformed file can take ends in a value the screen
 * can render.
 */
export function parseSnapshotFile(text: string): SnapshotParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "notJson" };
  }

  if (!isObject(raw)) return { ok: false, error: "notSnapshot" };

  const version = raw.schemaVersion;
  if (!isNumber(version) || version < 1) {
    return { ok: false, error: "notSnapshot" };
  }
  if (version > SNAPSHOT_SCHEMA_VERSION) {
    return { ok: false, error: "futureVersion", version };
  }

  const weightRaw = section(raw.weight);
  const dietsRaw = section(raw.diets);
  const foodsRaw = section(raw.customFoods);
  const groupsRaw = section(raw.substitutionGroups);

  if (
    weightRaw === undefined ||
    dietsRaw === undefined ||
    foodsRaw === undefined ||
    groupsRaw === undefined
  ) {
    return { ok: false, error: "notSnapshot" };
  }

  const drops: Drop[] = [];

  const profile =
    raw.profile === undefined || raw.profile === null
      ? undefined
      : readProfile(raw.profile);
  if (raw.profile !== undefined && raw.profile !== null && profile === undefined) {
    drops.push({ kind: "profile" });
  }

  const training =
    raw.training === undefined || raw.training === null
      ? undefined
      : readTraining(raw.training);
  if (
    raw.training !== undefined &&
    raw.training !== null &&
    training === undefined
  ) {
    drops.push({ kind: "training" });
  }

  return {
    ok: true,
    snapshot: {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      exportedAt: isInstant(raw.exportedAt)
        ? raw.exportedAt
        : new Date().toISOString(),
      ...(profile === undefined ? {} : { profile }),
      ...(training === undefined ? {} : { training }),
      weight: readAll(
        weightRaw,
        "weight",
        readWeight,
        (value) => label(value, "date"),
        drops,
      ),
      diets: readAll(
        dietsRaw,
        "diet",
        readDiet,
        (value) => label(value, "name"),
        drops,
      ),
      customFoods: readAll(
        foodsRaw,
        "customFood",
        readCustomFood,
        (value) => label(value, "name"),
        drops,
      ),
      substitutionGroups: readAll(
        groupsRaw,
        "group",
        readGroup,
        (value) => label(value, "name"),
        drops,
      ),
      settings: readSettings(raw.settings, drops),
    },
    drops,
  };
}

/**
 * What is in a snapshot, in the terms the restore screen compares them in.
 *
 * The same shape describes the file and the device, so the preview can put the
 * two side by side. That comparison is the whole of "non-destructive": a
 * restore replaces everything, and the only honest way to ask for it is to show
 * what would be lost next to what would arrive.
 */
export interface SnapshotSummary {
  exportedAt?: IsoTimestamp;
  hasProfile: boolean;
  hasGoal: boolean;
  weight: number;
  /** Earliest and latest day in the log — absent when there are none. */
  weightFrom?: string;
  weightTo?: string;
  diets: number;
  customFoods: number;
  groups: number;
  /** Whether a split is being run — a rotation is one record or none (#78). */
  hasTraining: boolean;
}

export function describeSnapshot(snapshot: Snapshot): SnapshotSummary {
  // Not `snapshot.weight[0]`: the adapter returns these sorted by date, but a
  // file that has been through someone's text editor need not be.
  const days = snapshot.weight.map((entry) => entry.date).sort();

  return {
    ...(snapshot.exportedAt === undefined
      ? {}
      : { exportedAt: snapshot.exportedAt }),
    hasProfile: snapshot.profile !== undefined,
    hasGoal: snapshot.settings.goal !== undefined,
    weight: snapshot.weight.length,
    ...(days.length === 0
      ? {}
      : { weightFrom: days[0], weightTo: days[days.length - 1] }),
    diets: snapshot.diets.length,
    customFoods: snapshot.customFoods.length,
    groups: snapshot.substitutionGroups.length,
    hasTraining: snapshot.training !== undefined,
  };
}

/**
 * The most recent moment anything in here was written.
 *
 * This is what makes the backup reminder (#26) answer "is there anything new to
 * save?" rather than "has it been a while?". A calendar timer nags someone who
 * has not opened the app since their last export, which teaches them to ignore
 * it — and an ignored reminder is the same as no reminder on the day the phone
 * is lost.
 *
 * `undefined` when the store is empty, which is the one case where there is
 * genuinely nothing to say.
 */
export function lastChangeAt(snapshot: Snapshot): IsoTimestamp | undefined {
  const stamps = [
    snapshot.profile?.updatedAt,
    ...snapshot.weight.map((entry) => entry.recordedAt),
    ...snapshot.diets.map((diet) => diet.updatedAt),
    ...snapshot.customFoods.map((food) => food.updatedAt),
    ...snapshot.substitutionGroups.map((group) => group.updatedAt),
    // Advancing the rotation is a write like any other: someone who finished
    // three sessions since their last export has three sessions that only
    // exist on the phone, and a reminder that stayed quiet about it would be
    // measuring the wrong thing.
    snapshot.training?.updatedAt,
  ].filter((stamp): stamp is IsoTimestamp => stamp !== undefined);

  if (stamps.length === 0) return undefined;

  return stamps.reduce((latest, stamp) => (stamp > latest ? stamp : latest));
}
