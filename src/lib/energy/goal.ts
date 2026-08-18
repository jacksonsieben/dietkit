import { parseDecimal } from "@/lib/profile/validation";
import type { Repository } from "@/lib/storage";
import type { MacroGoal } from "@/lib/storage/types";

import { DEFAULT_MACRO_GOAL, MACRO_GOAL_LIMITS } from "./macros";

/**
 * The goal as a form, and the goal as a stored record.
 *
 * Both in one file because the interesting part is the translation between
 * them, and it is not obvious in either direction. `MacroGoal` holds a signed
 * adjustment — one number that is negative for a deficit — and the form never
 * asks anyone to type a minus sign: a user who means "cut 500" writes 500 and
 * picks the mode that says which side of maintenance that is. A sign typed by
 * hand is a sign that eventually gets forgotten, and a forgotten minus turns a
 * cut into a bulk without changing anything on screen that looks wrong.
 */

/**
 * The five things a goal can be, as a single control.
 *
 * A mode plus an unsigned magnitude, rather than a sign field and a unit field,
 * because "deficit of 20%" is one decision and splitting it across two selects
 * makes the invalid combinations (a deficit of −20%) representable.
 */
export const GOAL_MODES = [
  "maintain",
  "deficitKcal",
  "surplusKcal",
  "deficitPercent",
  "surplusPercent",
] as const;

export type GoalMode = (typeof GOAL_MODES)[number];

/** Whether the magnitude box is worth showing at all. */
export function needsMagnitude(mode: GoalMode): boolean {
  return mode !== "maintain";
}

const PERCENT_MODES: readonly GoalMode[] = ["deficitPercent", "surplusPercent"];
const DEFICIT_MODES: readonly GoalMode[] = ["deficitKcal", "deficitPercent"];

/**
 * What the magnitude box will take, per mode. Derived from the signed limits
 * rather than restated, so widening one widens the other; `goal.test.ts` pins
 * that those limits are symmetric, which is the assumption doing the work here.
 */
export function magnitudeLimits(mode: GoalMode): { min: number; max: number } {
  return PERCENT_MODES.includes(mode)
    ? { min: 1, max: MACRO_GOAL_LIMITS.percent.max }
    : { min: 1, max: MACRO_GOAL_LIMITS.kcal.max };
}

export interface GoalFormValues {
  mode: string;
  /** Unsigned, and empty in `maintain` mode. */
  magnitude: string;
  proteinGPerKg: string;
  fatGPerKg: string;
}

export const GOAL_FIELDS = ["mode", "magnitude", "proteinGPerKg", "fatGPerKg"] as const;

export type GoalField = (typeof GOAL_FIELDS)[number];

export const GOAL_ERROR_CODES = [
  "required",
  "notANumber",
  "kcalRange",
  "percentRange",
  "proteinRange",
  "fatRange",
  "invalidMode",
] as const;

export type GoalErrorCode = (typeof GOAL_ERROR_CODES)[number];

export type GoalErrors = Partial<Record<GoalField, GoalErrorCode>>;

export type GoalValidation =
  | { ok: true; value: MacroGoal }
  | { ok: false; errors: GoalErrors };

/** Renders a stored number the way pt-BR writes one — see `toField`. */
function toField(value: number): string {
  return String(value).replace(".", ",");
}

export function toGoalForm(goal: MacroGoal): GoalFormValues {
  const percent = goal.adjustment.kind === "percent";
  const deficit = goal.adjustment.value < 0;

  const mode: GoalMode =
    goal.adjustment.value === 0
      ? "maintain"
      : percent
        ? deficit
          ? "deficitPercent"
          : "surplusPercent"
        : deficit
          ? "deficitKcal"
          : "surplusKcal";

  return {
    mode,
    // Maintenance keeps its box empty rather than showing a 0 the user then has
    // to clear before they can type anything else.
    magnitude: goal.adjustment.value === 0 ? "" : toField(Math.abs(goal.adjustment.value)),
    proteinGPerKg: toField(goal.proteinGPerKg),
    fatGPerKg: toField(goal.fatGPerKg),
  };
}

/**
 * Validates the whole form at once, for the reason `validateProfileForm` does:
 * one pass that says everything that is wrong beats making the user discover
 * the next problem each time they fix the last one.
 */
export function validateGoalForm(values: GoalFormValues): GoalValidation {
  const errors: GoalErrors = {};

  const mode = GOAL_MODES.find((candidate) => candidate === values.mode);
  if (!mode) {
    // Nothing else can be judged without knowing the mode — the magnitude's
    // units are not even decided — so this one failure returns on its own.
    return { ok: false, errors: { mode: "invalidMode" } };
  }

  let adjustmentValue = 0;
  if (needsMagnitude(mode)) {
    const bounds = magnitudeLimits(mode);
    const percent = PERCENT_MODES.includes(mode);
    const magnitude = parseDecimal(values.magnitude);

    if (values.magnitude.trim() === "") {
      errors.magnitude = "required";
    } else if (magnitude === undefined) {
      errors.magnitude = "notANumber";
    } else if (magnitude < bounds.min || magnitude > bounds.max) {
      errors.magnitude = percent ? "percentRange" : "kcalRange";
    } else {
      adjustmentValue = DEFICIT_MODES.includes(mode) ? -magnitude : magnitude;
    }
  }

  const protein = checkCoefficient(
    values.proteinGPerKg,
    MACRO_GOAL_LIMITS.proteinGPerKg,
    "proteinRange",
  );
  if ("error" in protein) errors.proteinGPerKg = protein.error;

  const fat = checkCoefficient(
    values.fatGPerKg,
    MACRO_GOAL_LIMITS.fatGPerKg,
    "fatRange",
  );
  if ("error" in fat) errors.fatGPerKg = fat.error;

  if ("error" in protein || "error" in fat || errors.magnitude) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      adjustment: {
        kind: PERCENT_MODES.includes(mode) ? "percent" : "kcal",
        value: adjustmentValue,
      },
      proteinGPerKg: protein.value,
      fatGPerKg: fat.value,
    },
  };
}

type Checked = { value: number } | { error: GoalErrorCode };

/** The out-of-range code is a parameter: each coefficient quotes its own bounds. */
function checkCoefficient(
  raw: string,
  bounds: { min: number; max: number },
  outOfRange: GoalErrorCode,
): Checked {
  if (raw.trim() === "") return { error: "required" };

  const value = parseDecimal(raw);
  if (value === undefined) return { error: "notANumber" };
  if (value < bounds.min || value > bounds.max) return { error: outOfRange };

  return { value };
}

/**
 * The stored goal, or the default when nothing was ever chosen.
 *
 * `Settings.goal` is optional on purpose, so this is the single place that
 * decides what "never chose" shows — rather than every caller of `settings.get`
 * inventing its own fallback and two screens disagreeing about the defaults.
 */
export async function loadGoal(repository: Repository): Promise<MacroGoal> {
  const settings = await repository.settings.get();
  return settings.goal ?? DEFAULT_MACRO_GOAL;
}

export async function saveGoal(
  repository: Repository,
  goal: MacroGoal,
): Promise<void> {
  await repository.settings.patch({ goal });
}
