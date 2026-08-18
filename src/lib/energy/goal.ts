import {
  DEFAULT_MACRO_GOAL,
  GOAL_PRESETS,
  MACRO_GOAL_LIMITS,
} from "@/lib/energy/macros";
import { parseDecimal } from "@/lib/profile/validation";
import type { Repository } from "@/lib/storage";
import {
  ENERGY_UNITS,
  GOAL_KINDS,
  type EnergyUnit,
  type GoalKind,
  type MacroGoal,
} from "@/lib/storage/types";

/**
 * The goal as a form, and the goal as a stored record.
 *
 * Both in one file because the interesting part is the translation between
 * them, and it is not obvious in either direction. The form asks one question —
 * which of three goals — and everything else is a preset the user may never
 * open. Underneath, that answer is what gives the adjustment its sign: a user
 * who means "cut 500" picks *Emagrecer* and writes 500, and no field anywhere
 * in this app ever asks a human to type a minus. A sign typed by hand is a sign
 * that eventually gets forgotten, and a forgotten minus turns a cut into a bulk
 * without changing anything on screen that looks wrong.
 */

/** Whether the adjustment box is worth showing at all. */
export function needsAdjustment(kind: GoalKind): boolean {
  return kind !== "maintain";
}

/**
 * The unit picker inside each box, in the order it is offered.
 *
 * Two lists rather than one, because the sensible default differs: an
 * adjustment is normally spoken in kilocalories ("500 below maintenance") and
 * fat is normally spoken as a share of intake, which is how the guidance behind
 * `GOAL_PRESETS` is written.
 */
export const ADJUSTMENT_UNITS: readonly EnergyUnit[] = ["kcal", "percent"];
export const FAT_UNITS: readonly EnergyUnit[] = ["percent", "kcal"];

/** What the adjustment box will take, per unit. Unsigned — the goal has the sign. */
export function adjustmentLimits(unit: EnergyUnit): { min: number; max: number } {
  return unit === "percent" ? MACRO_GOAL_LIMITS.percent : MACRO_GOAL_LIMITS.kcal;
}

/** What the fat box will take. The percentage floor is the physiological one. */
export function fatLimits(unit: EnergyUnit): { min: number; max: number } {
  return unit === "percent" ? MACRO_GOAL_LIMITS.fatPercent : MACRO_GOAL_LIMITS.fatKcal;
}

export interface GoalFormValues {
  kind: string;
  /** Unsigned, and empty on maintenance. */
  adjustment: string;
  adjustmentUnit: string;
  proteinGPerKg: string;
  fat: string;
  fatUnit: string;
}

export const GOAL_FIELDS = [
  "kind",
  "adjustment",
  "adjustmentUnit",
  "proteinGPerKg",
  "fat",
  "fatUnit",
] as const;

export type GoalField = (typeof GOAL_FIELDS)[number];

export const GOAL_ERROR_CODES = [
  "required",
  "notANumber",
  "kcalRange",
  "percentRange",
  "proteinRange",
  "fatPercentRange",
  "fatKcalRange",
  "invalidGoal",
  "invalidUnit",
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
  return {
    kind: goal.kind,
    // Maintenance keeps its box empty rather than showing a 0 the user then has
    // to clear before they can type anything else.
    adjustment: needsAdjustment(goal.kind) ? toField(goal.adjustment.value) : "",
    adjustmentUnit: goal.adjustment.unit,
    proteinGPerKg: toField(goal.proteinGPerKg),
    fat: toField(goal.fat.value),
    fatUnit: goal.fat.unit,
  };
}

/**
 * The form as a goal fills it in.
 *
 * This is what makes the three options worth having: picking one is a complete
 * answer, and the advanced section is where someone who disagrees with the
 * preset goes. It replaces every field rather than only the untouched ones,
 * because "the numbers that go with Hipertrofia" is the thing being asked for —
 * a goal that kept a 500 kcal deficit from the previous choice would be a
 * surplus that quietly is not one.
 */
export function presetForm(kind: GoalKind): GoalFormValues {
  return toGoalForm(GOAL_PRESETS[kind]);
}

/**
 * Validates the whole form at once, for the reason `validateProfileForm` does:
 * one pass that says everything that is wrong beats making the user discover
 * the next problem each time they fix the last one.
 */
export function validateGoalForm(values: GoalFormValues): GoalValidation {
  const kind = GOAL_KINDS.find((candidate) => candidate === values.kind);
  if (!kind) {
    // Nothing else can be judged without the goal — it is what decides whether
    // the adjustment is even asked for — so this one failure returns on its own.
    return { ok: false, errors: { kind: "invalidGoal" } };
  }

  const adjustmentUnit = toUnit(values.adjustmentUnit);
  const fatUnit = toUnit(values.fatUnit);
  if (!adjustmentUnit || !fatUnit) {
    // Same reasoning: a number whose unit is unknown has no bounds to check.
    return {
      ok: false,
      errors: {
        ...(adjustmentUnit ? {} : { adjustmentUnit: "invalidUnit" as const }),
        ...(fatUnit ? {} : { fatUnit: "invalidUnit" as const }),
      },
    };
  }

  const errors: GoalErrors = {};

  let adjustmentValue = 0;
  if (needsAdjustment(kind)) {
    const checked = checkNumber(
      values.adjustment,
      adjustmentLimits(adjustmentUnit),
      adjustmentUnit === "percent" ? "percentRange" : "kcalRange",
    );
    if ("error" in checked) errors.adjustment = checked.error;
    else adjustmentValue = checked.value;
  }

  const protein = checkNumber(
    values.proteinGPerKg,
    MACRO_GOAL_LIMITS.proteinGPerKg,
    "proteinRange",
  );
  if ("error" in protein) errors.proteinGPerKg = protein.error;

  const fat = checkNumber(
    values.fat,
    fatLimits(fatUnit),
    fatUnit === "percent" ? "fatPercentRange" : "fatKcalRange",
  );
  if ("error" in fat) errors.fat = fat.error;

  if ("error" in protein || "error" in fat || errors.adjustment) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      kind,
      adjustment: { unit: adjustmentUnit, value: adjustmentValue },
      proteinGPerKg: protein.value,
      fat: { unit: fatUnit, value: fat.value },
    },
  };
}

function toUnit(raw: string): EnergyUnit | undefined {
  return ENERGY_UNITS.find((candidate) => candidate === raw);
}

type Checked = { value: number } | { error: GoalErrorCode };

/** The out-of-range code is a parameter: each box quotes its own bounds. */
function checkNumber(
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
 * Whether a value out of the store is still a goal this version understands.
 *
 * The store is not a database we control the migrations of: it is a device that
 * may have been written by an older build, and an import (#26) is a JSON file a
 * user can hand-edit. A goal of the wrong shape reaching `planMacros` is
 * `undefined * weight` — a NaN target rendered as grams of food — so it is
 * checked here rather than trusted for having come out of IndexedDB.
 */
export function isMacroGoal(value: unknown): value is MacroGoal {
  if (typeof value !== "object" || value === null) return false;
  const goal = value as Partial<MacroGoal>;

  return (
    GOAL_KINDS.some((kind) => kind === goal.kind) &&
    isAmount(goal.adjustment) &&
    typeof goal.proteinGPerKg === "number" &&
    Number.isFinite(goal.proteinGPerKg) &&
    isAmount(goal.fat)
  );
}

function isAmount(value: unknown): value is { unit: EnergyUnit; value: number } {
  if (typeof value !== "object" || value === null) return false;
  const amount = value as { unit?: unknown; value?: unknown };

  return (
    ENERGY_UNITS.some((unit) => unit === amount.unit) &&
    typeof amount.value === "number" &&
    Number.isFinite(amount.value)
  );
}

/**
 * The stored goal, or the default when nothing usable was ever chosen.
 *
 * `Settings.goal` is optional on purpose, so this is the single place that
 * decides what "never chose" shows — rather than every caller of `settings.get`
 * inventing its own fallback and two screens disagreeing about the defaults.
 */
export async function loadGoal(repository: Repository): Promise<MacroGoal> {
  const settings = await repository.settings.get();
  return isMacroGoal(settings.goal) ? settings.goal : DEFAULT_MACRO_GOAL;
}

export async function saveGoal(
  repository: Repository,
  goal: MacroGoal,
): Promise<void> {
  await repository.settings.patch({ goal });
}
