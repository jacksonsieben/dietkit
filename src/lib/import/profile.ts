import { CATALOGUE_MACROS, DAY_TYPES } from "./catalogue";
import type { CatalogueMacro, DayType } from "./catalogue";

/**
 * The predecessor's exported profile JSON, read (#22).
 *
 * The file is flat: sixty-odd scalar keys, no nesting, no version field, no
 * diet. `dist_treino_carb_2` is breakfast-plus-two's share of the training
 * day's carbohydrate; `sel_descanso_prot_0` is *an index* into an option list
 * that lives in the predecessor's source rather than in the file. This module
 * turns that into a typed object and says what it had to assume; `catalogue.ts`
 * supplies the meaning of the indices, and `import.ts` turns the result into
 * DietKit records.
 *
 * Two rules shape it, and they pull in opposite directions:
 *
 * - **Read what the predecessor would have read.** The check here is the same
 *   check `validate_profile_data` makes, down to the ranges, because a file the
 *   old app opens and this one rejects is a file the user is entitled to be
 *   annoyed about. Its two late-added keys are optional there and optional here.
 * - **Never fill a gap quietly.** Its loader merged whatever it was given over
 *   the factory profile and said nothing, so a file that had lost half its
 *   distribution keys came back as somebody else's plan. Here a missing
 *   required key is an error — which is what its own validator says too — and
 *   the two genuinely optional keys, absent from any export written before the
 *   setting existed, come back in `defaulted` for the screen to report.
 *
 * Pure, with no knowledge of DietKit's own types: this file's only job is to
 * decide what the JSON says.
 */

/** Four, because the predecessor's day is four meals and its keys are `_0`–`_3`. */
export const PREDECESSOR_MEAL_COUNT = 4;

/** The option lists a meal selection can point into. */
export const SELECTION_CATEGORIES = ["carb", "prot"] as const;

export type SelectionCategory = (typeof SELECTION_CATEGORIES)[number];

/**
 * Keys the predecessor requires but nothing here reads.
 *
 * `pdf_layout` chooses between two shapes of its PDF export. Rejecting a file
 * for missing a setting we would ignore anyway would be strictness for its own
 * sake, so it is tolerated when absent and never mentioned again.
 */
export const IGNORED_KEYS = ["pdf_layout"] as const;

/** Added after the predecessor's first release; older exports lack them. */
export const OPTIONAL_KEYS = ["use_custom_fa", "custom_fa"] as const;

export const PROFILE_ISSUE_CODES = [
  "notAnObject",
  "missing",
  "wrongType",
  "outOfRange",
] as const;

export type ProfileIssueCode = (typeof PROFILE_ISSUE_CODES)[number];

export interface ProfileIssue {
  code: ProfileIssueCode;
  /** The key as the file spells it, so the message can quote the file. */
  key: string;
}

/** Percentages, in meal order. */
type MealNumbers = readonly number[];

export interface PredecessorProfile {
  weightKg: number;
  heightCm: number;
  age: number;
  /** "Masculino" / "Feminino", left as the file wrote it. */
  sexLabel: string;
  /** Index into the predecessor's five-rung activity ladder. */
  activityIdx: number;
  /** Signed: negative is a cut, positive a bulk. */
  kcalAdjustment: number;
  coeffProtein: number;
  coeffCarb: number;
  coeffFat: number;
  useCustomFa: boolean;
  customFa: number;
  /** `[dayType][macro][meal]`, whole percent 0–100. */
  distribution: Record<DayType, Record<CatalogueMacro, MealNumbers>>;
  /** Percent taken off each rest-day meal's carbohydrate, 0–50. */
  descansoCarbCut: MealNumbers;
  /** `[dayType][category][meal]`, an index into the catalogue's option list. */
  selection: Record<DayType, Record<SelectionCategory, MealNumbers>>;
}

export type ProfileParse =
  | {
      ok: true;
      value: PredecessorProfile;
      /** Keys absent from the file that took a factory default. */
      defaulted: readonly string[];
    }
  | { ok: false; issues: readonly ProfileIssue[] };

/**
 * The predecessor's factory profile, transcribed from `PROFILE_DEFAULTS`.
 *
 * Here rather than derived from `DISTRIBUTION_DEFAULTS` in the catalogue for
 * the reason the catalogue is frozen at all: these are the numbers a file
 * written by *that* version of the app was missing against, and they have to
 * keep meaning that after either app moves on.
 */
export const PROFILE_DEFAULTS = {
  weightKg: 70,
  heightCm: 170,
  age: 30,
  sexLabel: "Masculino",
  activityIdx: 1,
  kcalAdjustment: 0,
  coeffProtein: 2,
  coeffCarb: 3,
  coeffFat: 0.8,
  useCustomFa: false,
  customFa: 1.4,
  distribution: {
    treino: { carb: [15, 30, 10, 45], protein: [25, 25, 15, 35], fat: [20, 30, 15, 35] },
    descanso: { carb: [18, 27, 12, 43], protein: [25, 25, 15, 35], fat: [20, 30, 15, 35] },
  },
  descansoCarbCut: [0, 0, 0, 0],
  selection: {
    treino: { carb: [0, 0, 0, 0], prot: [0, 0, 0, 0] },
    descanso: { carb: [0, 0, 0, 0], prot: [0, 0, 0, 0] },
  },
} as const satisfies PredecessorProfile;

const SCALARS = [
  ["weight_kg", "weightKg"],
  ["height_cm", "heightCm"],
  ["age", "age"],
  ["activity_idx", "activityIdx"],
  ["kcal_adjustment", "kcalAdjustment"],
  ["coeff_protein", "coeffProtein"],
  ["coeff_carb", "coeffCarb"],
  ["coeff_fat", "coeffFat"],
] as const;

type Raw = Record<string, unknown>;

/**
 * Reads one file's worth of JSON.
 *
 * `text` rather than a parsed object because a file chosen in a browser arrives
 * as text, and "this is not JSON" is one of the outcomes the screen has to be
 * able to describe.
 */
export function parseProfileFile(text: string): ProfileParse {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, issues: [{ code: "notAnObject", key: "" }] };
  }
  return parseProfile(data);
}

export function parseProfile(data: unknown): ProfileParse {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, issues: [{ code: "notAnObject", key: "" }] };
  }

  const raw = data as Raw;
  const issues: ProfileIssue[] = [];
  const defaulted: string[] = [];

  /**
   * A number the file is required to carry, unless `optional`.
   *
   * A required key that is absent is an error rather than a default, which is
   * where this parts company with `profile_to_session`: merging over the
   * factory profile meant a file that had lost half its distribution keys came
   * back as somebody else's plan, silently. Rejecting is the same rule
   * `validate_profile_data` already applies — the old app would not have opened
   * such a file either, only its writer half did.
   */
  const num = (
    key: string,
    fallback: number,
    range?: [number, number],
    optional = false,
  ) => {
    if (!(key in raw)) {
      if (optional) defaulted.push(key);
      else issues.push({ code: "missing", key });
      return fallback;
    }
    const value = raw[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      issues.push({ code: "wrongType", key });
      return fallback;
    }
    if (range && (value < range[0] || value > range[1])) {
      issues.push({ code: "outOfRange", key });
    }
    return value;
  };

  const list = (
    prefix: string,
    fallback: MealNumbers,
    range: [number, number],
  ): MealNumbers =>
    Array.from({ length: PREDECESSOR_MEAL_COUNT }, (_, meal) =>
      num(`${prefix}${meal}`, fallback[meal] ?? 0, range),
    );

  const scalars = Object.fromEntries(
    SCALARS.map(([key, field]) => [field, num(key, PROFILE_DEFAULTS[field])]),
  ) as Record<(typeof SCALARS)[number][1], number>;

  let sexLabel: string = PROFILE_DEFAULTS.sexLabel;
  if (!("sex_label" in raw)) {
    issues.push({ code: "missing", key: "sex_label" });
  } else if (typeof raw["sex_label"] !== "string") {
    issues.push({ code: "wrongType", key: "sex_label" });
  } else {
    sexLabel = raw["sex_label"];
  }

  let useCustomFa: boolean = PROFILE_DEFAULTS.useCustomFa;
  if (!("use_custom_fa" in raw)) {
    defaulted.push("use_custom_fa");
  } else {
    if (typeof raw["use_custom_fa"] !== "boolean") {
      issues.push({ code: "wrongType", key: "use_custom_fa" });
    } else {
      useCustomFa = raw["use_custom_fa"];
    }
  }
  // Optional rather than missing: an export that predates the setting is not
  // damaged, it is old, and the report says so in those words.
  const customFa = num("custom_fa", PROFILE_DEFAULTS.customFa, undefined, true);

  const distribution = Object.fromEntries(
    DAY_TYPES.map((day) => [
      day,
      Object.fromEntries(
        CATALOGUE_MACROS.map((macro) => [
          macro,
          list(
            `dist_${day}_${macro}_`,
            PROFILE_DEFAULTS.distribution[day][macro],
            [0, 100],
          ),
        ]),
      ),
    ]),
  ) as PredecessorProfile["distribution"];

  const selection = Object.fromEntries(
    DAY_TYPES.map((day) => [
      day,
      Object.fromEntries(
        SELECTION_CATEGORIES.map((category) => [
          category,
          list(`sel_${day}_${category}_`, PROFILE_DEFAULTS.selection[day][category], [
            0,
            Number.MAX_SAFE_INTEGER,
          ]),
        ]),
      ),
    ]),
  ) as PredecessorProfile["selection"];

  const descansoCarbCut = list(
    "descanso_carb_cut_",
    PROFILE_DEFAULTS.descansoCarbCut,
    [0, 50],
  );

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    value: {
      ...scalars,
      sexLabel,
      useCustomFa,
      customFa,
      distribution,
      descansoCarbCut,
      selection,
    },
    defaulted,
  };
}
