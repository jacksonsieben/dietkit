import type { MacroGoal, MacroSet } from "@/lib/storage/types";

/**
 * Daily macronutrient targets, in grams, from an energy expenditure.
 *
 * The chain is deliberately short and entirely explicit: TDEE (#14) is moved by
 * a deficit or surplus, protein and fat are set per kilogram of bodyweight, and
 * carbohydrate is whatever energy is left over. That last step is the one worth
 * naming — carbohydrate is the *remainder*, not a third coefficient, which is
 * why the three grams always add back up to the target instead of to something
 * near it.
 *
 * Everything here is pure arithmetic on numbers. Where the goal came from and
 * where it is stored is somebody else's problem (`Settings.goal`).
 */

/**
 * Kilocalories per gram, the Atwater general factors.
 *
 * Named rather than inlined for the reason `SEX_CONSTANT` is: a 9 written as a
 * 4 in one of the several places this arithmetic happens produces a number that
 * still looks like a plausible number. The factors are used in exactly two
 * directions — grams from energy, and energy from grams — and both go through
 * these constants so the round trip cannot drift apart.
 *
 * Atwater WO, Bryant AP. *The availability and fuel value of food materials.*
 * Connecticut (Storrs) Agricultural Experiment Station, 12th Annual Report,
 * 1900. Still the basis of the values printed on Brazilian labels (RDC 429/2020)
 * and of the energy column in TACO, which is why this app uses them rather than
 * the more precise food-specific factors: our targets have to be comparable
 * with the numbers on the package.
 */
export const ATWATER = {
  proteinKcalPerG: 4,
  carbKcalPerG: 4,
  fatKcalPerG: 9,
} as const;

/**
 * Bounds, not dietary advice — same stance as `PROFILE_LIMITS`.
 *
 * They reject a typed digit that cannot have been meant (a 20 g/kg protein
 * target, a 90% deficit) and nothing narrower. Real protocols live well inside
 * them: 2.2 g/kg of protein for a lean bulk and 0.4 g/kg of fat on a
 * low-fat cut are both unusual and both allowed.
 */
export const MACRO_GOAL_LIMITS = {
  /** Signed: negative is a deficit, positive a surplus. */
  kcal: { min: -1500, max: 1500 },
  /** Signed, as a percentage of TDEE. */
  percent: { min: -40, max: 40 },
  proteinGPerKg: { min: 0.5, max: 4 },
  fatGPerKg: { min: 0.3, max: 2.5 },
} as const;

/**
 * Maintenance, with coefficients most people can start from and then argue
 * with: 1.8 g/kg of protein sits at the top of the range where the evidence for
 * resistance-trained adults is consistent, and 1 g/kg of fat is a round number
 * comfortably above the point where intake becomes a problem.
 *
 * A default is not a recommendation. It exists so the screen has something to
 * show before the user has decided anything, and the health disclaimer (#10)
 * says the rest.
 */
export const DEFAULT_MACRO_GOAL: MacroGoal = {
  adjustment: { kind: "percent", value: 0 },
  proteinGPerKg: 1.8,
  fatGPerKg: 1,
};

/** What a set of grams is worth, by the same factors that produced them. */
export function macroEnergy(macros: Omit<MacroSet, "kcal">): number {
  return (
    macros.proteinG * ATWATER.proteinKcalPerG +
    macros.carbG * ATWATER.carbKcalPerG +
    macros.fatG * ATWATER.fatKcalPerG
  );
}

/**
 * The adjusted energy target, unrounded.
 *
 * A percentage and an absolute figure are both offered because people hold the
 * goal in whichever one they were given: "eat 500 below maintenance" and "cut
 * 20%" are the two sentences that come out of a gym, and converting one to the
 * other in your head requires knowing your own TDEE to begin with.
 */
export function adjustedEnergy(
  totalDailyEnergyExpenditure: number,
  adjustment: MacroGoal["adjustment"],
): number {
  assertPositive("totalDailyEnergyExpenditure", totalDailyEnergyExpenditure);

  const bounds =
    adjustment.kind === "percent" ? MACRO_GOAL_LIMITS.percent : MACRO_GOAL_LIMITS.kcal;
  assertWithin(`adjustment.value (${adjustment.kind})`, adjustment.value, bounds);

  return adjustment.kind === "percent"
    ? totalDailyEnergyExpenditure * (1 + adjustment.value / 100)
    : totalDailyEnergyExpenditure + adjustment.value;
}

export interface MacroPlanInput {
  /** From #14. Unrounded, so the division into grams is not compounding a round. */
  totalDailyEnergyExpenditure: number;
  /** The bodyweight the coefficients are per kilogram *of*. */
  weightKg: number;
  goal: MacroGoal;
}

export interface MacroPlan {
  totalDailyEnergyExpenditure: number;
  /** The deficit or surplus in kilocalories, even when it was typed as a percent. */
  adjustmentKcal: number;
  /** TDEE plus the adjustment, unrounded — what the grams were derived from. */
  targetKcal: number;
  /** Grams before rounding. Kept so the drift below can be explained. */
  exact: Omit<MacroSet, "kcal">;
  /**
   * The numbers to actually show and store. `kcal` is what the *rounded* grams
   * are worth — not the target — because these grams are what a plan gets built
   * from, and a MacroSet whose kcal disagreed with its own grams would put a
   * reconciliation error into every diet that referenced it (#21).
   */
  targets: MacroSet;
  /**
   * `targets.kcal − targetKcal`: how far the plate you can actually weigh lands
   * from the figure the equation asked for.
   *
   * This is the number the issue asks to be shown rather than hidden. It is
   * normally a few kilocalories of rounding and it is never zero on purpose —
   * hiding it is what makes a user, adding their own targets up later, believe
   * the app cannot do arithmetic.
   */
  driftKcal: number;
  /**
   * Zero in the ordinary case. Positive when protein and fat alone already cost
   * more than the target, which happens on an aggressive deficit with high
   * coefficients: carbohydrate is floored at zero and this holds the kilocalories
   * that would not fit. It is the honest failure — the goal as stated is not
   * reachable — and the UI has to say so rather than print a negative gram count.
   */
  carbShortfallKcal: number;
}

/**
 * Splits an adjusted energy target into grams.
 *
 * Throws on input that cannot describe a goal, for the same reason
 * `basalMetabolicRate` does: the form validates what a user types, so anything
 * out of range arriving here is our bug, and a NaN reaching a plate of food is
 * exactly what this module exists to prevent.
 */
export function planMacros({
  totalDailyEnergyExpenditure,
  weightKg,
  goal,
}: MacroPlanInput): MacroPlan {
  assertPositive("weightKg", weightKg);
  assertWithin(
    "proteinGPerKg",
    goal.proteinGPerKg,
    MACRO_GOAL_LIMITS.proteinGPerKg,
  );
  assertWithin("fatGPerKg", goal.fatGPerKg, MACRO_GOAL_LIMITS.fatGPerKg);

  const targetKcal = adjustedEnergy(totalDailyEnergyExpenditure, goal.adjustment);
  if (targetKcal <= 0) {
    throw new RangeError(`Adjusted target must stay positive, got ${targetKcal}`);
  }

  const proteinG = weightKg * goal.proteinGPerKg;
  const fatG = weightKg * goal.fatGPerKg;

  // Carbohydrate is the remainder of the energy, not a coefficient of its own.
  const remainderKcal =
    targetKcal - proteinG * ATWATER.proteinKcalPerG - fatG * ATWATER.fatKcalPerG;
  const carbShortfallKcal = remainderKcal < 0 ? -remainderKcal : 0;
  const carbG = remainderKcal > 0 ? remainderKcal / ATWATER.carbKcalPerG : 0;

  const exact = { proteinG, carbG, fatG };
  const rounded = {
    proteinG: Math.round(proteinG),
    carbG: Math.round(carbG),
    fatG: Math.round(fatG),
  };

  return {
    totalDailyEnergyExpenditure,
    adjustmentKcal: targetKcal - totalDailyEnergyExpenditure,
    targetKcal,
    exact,
    targets: { ...rounded, kcal: macroEnergy(rounded) },
    driftKcal: macroEnergy(rounded) - targetKcal,
    carbShortfallKcal,
  };
}

interface Bounds {
  readonly min: number;
  readonly max: number;
}

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number, got ${value}`);
  }
}

function assertWithin(name: string, value: number, bounds: Bounds): void {
  if (!Number.isFinite(value) || value < bounds.min || value > bounds.max) {
    throw new RangeError(
      `${name} must be between ${bounds.min} and ${bounds.max}, got ${value}`,
    );
  }
}
