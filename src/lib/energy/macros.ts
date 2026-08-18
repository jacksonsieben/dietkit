import type { GoalKind, MacroGoal, MacroSet } from "@/lib/storage/types";

/**
 * Daily macronutrient targets, in grams, from an energy expenditure.
 *
 * The chain is deliberately short and entirely explicit: TDEE (#14) is moved by
 * a deficit or surplus, protein is set per kilogram of bodyweight, fat takes a
 * share of the energy, and carbohydrate is whatever is left over. That last step
 * is the one worth naming — carbohydrate is the *remainder*, not a third
 * coefficient, which is why the three grams always add back up to the target
 * instead of to something near it.
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
 * The share of intake below which fat stops being a dial and starts being a
 * problem: endocrine function and the absorption of fat-soluble vitamins.
 *
 * 15% is the bottom of the range the sports-nutrition guidance treats as a
 * floor (ISSN/ACSM: 20–30% of intake in normal use, never under 15–20%, or
 * roughly 0.5–0.6 g/kg). It is a floor and not a recommendation — the presets
 * below sit well above it — and the health disclaimer (#10) says the rest.
 */
export const FAT_FLOOR_PERCENT = 15;

/**
 * Bounds, not dietary advice — same stance as `PROFILE_LIMITS`.
 *
 * They reject a typed digit that cannot have been meant (a 20 g/kg protein
 * target, a 90% deficit) and nothing narrower. Real protocols live well inside
 * them: 2.2 g/kg of protein for a lean bulk and a 30% fat maintenance diet are
 * both unremarkable and both allowed. The one exception is the fat floor, which
 * is a genuine physiological limit rather than a typo guard.
 */
export const MACRO_GOAL_LIMITS = {
  /** Unsigned magnitude of the adjustment: the direction is `goal.kind`. */
  kcal: { min: 1, max: 1500 },
  /** Unsigned too, as a percentage of TDEE. */
  percent: { min: 1, max: 40 },
  proteinGPerKg: { min: 0.5, max: 4 },
  /** Fat as a share of the energy target. */
  fatPercent: { min: FAT_FLOOR_PERCENT, max: 60 },
  /** Fat as an absolute figure. Not floored here — see `fatBelowFloor`. */
  fatKcal: { min: 100, max: 2000 },
} as const;

/**
 * What each goal fills the form with.
 *
 * The point of presets is that nobody should have to answer four questions to
 * get a plan: picking "emagrecer" is the answer, and the numbers underneath it
 * are a starting position the advanced section exists to argue with.
 *
 * Protein rises as energy falls, which is the one part of this that is not
 * arbitrary: 2 g/kg on a cut protects lean mass when there is less energy to do
 * it with, 2.5 g/kg supports the training that a surplus is for, and 1.8 g/kg
 * is the maintenance figure the evidence for trained adults is consistent
 * about. Fat sits at 25% cutting and gaining — leaving carbohydrate the room to
 * fuel training in both cases — and 30% at maintenance, where satiety and
 * hormonal health matter more than fuelling a session. Every one of those is
 * inside the ISSN/ACSM ranges (20–25% cutting, 25–30% maintaining, 20–30%
 * gaining) and none of them is a recommendation for any particular person.
 */
export const GOAL_PRESETS = {
  lose: {
    kind: "lose",
    adjustment: { unit: "kcal", value: 500 },
    proteinGPerKg: 2,
    fat: { unit: "percent", value: 25 },
  },
  maintain: {
    kind: "maintain",
    adjustment: { unit: "kcal", value: 0 },
    proteinGPerKg: 1.8,
    fat: { unit: "percent", value: 30 },
  },
  gain: {
    kind: "gain",
    adjustment: { unit: "kcal", value: 500 },
    proteinGPerKg: 2.5,
    fat: { unit: "percent", value: 25 },
  },
} satisfies Record<GoalKind, MacroGoal>;

/**
 * Maintenance, because it is the goal that assumes least about someone the app
 * has never met: it changes nothing about their intake and still produces a
 * split they can look at.
 *
 * A default is not a recommendation. It exists so the screen has something to
 * show before the user has decided anything.
 */
export const DEFAULT_MACRO_GOAL: MacroGoal = GOAL_PRESETS.maintain;

/** Which way the adjustment points. Maintenance is the zero, not a direction. */
export function goalSign(kind: GoalKind): -1 | 0 | 1 {
  if (kind === "lose") return -1;
  return kind === "gain" ? 1 : 0;
}

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
 *
 * Maintenance returns before the adjustment is even looked at: its magnitude is
 * a stored zero, which is deliberately outside the unsigned bounds every other
 * goal is held to.
 */
export function adjustedEnergy(
  totalDailyEnergyExpenditure: number,
  goal: Pick<MacroGoal, "kind" | "adjustment">,
): number {
  assertPositive("totalDailyEnergyExpenditure", totalDailyEnergyExpenditure);

  const sign = goalSign(goal.kind);
  if (sign === 0) return totalDailyEnergyExpenditure;

  const bounds =
    goal.adjustment.unit === "percent"
      ? MACRO_GOAL_LIMITS.percent
      : MACRO_GOAL_LIMITS.kcal;
  assertWithin(
    `adjustment.value (${goal.adjustment.unit})`,
    goal.adjustment.value,
    bounds,
  );

  const signed = sign * goal.adjustment.value;

  return goal.adjustment.unit === "percent"
    ? totalDailyEnergyExpenditure * (1 + signed / 100)
    : totalDailyEnergyExpenditure + signed;
}

/** What the fat side of a goal costs, once there is a target to take a share of. */
export function fatEnergy(fat: MacroGoal["fat"], targetKcal: number): number {
  return fat.unit === "percent" ? (targetKcal * fat.value) / 100 : fat.value;
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
   * What share of the target the fat is taking, as a fraction — 0.25 for a
   * quarter. Computed rather than read off the goal, because a goal expressed
   * in kilocalories does not know its own share until there is a target.
   */
  fatShare: number;
  /**
   * Whether that share is under `FAT_FLOOR_PERCENT`.
   *
   * Only reachable when fat was given in kilocalories: a percentage is held to
   * the floor by the form's own bounds, while an absolute figure only becomes
   * too small relative to a target the form cannot see. It is a warning rather
   * than a refusal — the arithmetic is fine, the diet is the problem — and the
   * UI is expected to say so.
   */
  fatBelowFloor: boolean;
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
  assertWithin("proteinGPerKg", goal.proteinGPerKg, MACRO_GOAL_LIMITS.proteinGPerKg);
  assertWithin(
    `fat.value (${goal.fat.unit})`,
    goal.fat.value,
    goal.fat.unit === "percent"
      ? MACRO_GOAL_LIMITS.fatPercent
      : MACRO_GOAL_LIMITS.fatKcal,
  );

  const targetKcal = adjustedEnergy(totalDailyEnergyExpenditure, goal);
  if (targetKcal <= 0) {
    throw new RangeError(`Adjusted target must stay positive, got ${targetKcal}`);
  }

  const proteinG = weightKg * goal.proteinGPerKg;
  const fatKcal = fatEnergy(goal.fat, targetKcal);
  const fatG = fatKcal / ATWATER.fatKcalPerG;

  // Carbohydrate is the remainder of the energy, not a coefficient of its own.
  const remainderKcal = targetKcal - proteinG * ATWATER.proteinKcalPerG - fatKcal;
  const carbShortfallKcal = remainderKcal < 0 ? -remainderKcal : 0;
  const carbG = remainderKcal > 0 ? remainderKcal / ATWATER.carbKcalPerG : 0;

  const exact = { proteinG, carbG, fatG };
  const rounded = {
    proteinG: Math.round(proteinG),
    carbG: Math.round(carbG),
    fatG: Math.round(fatG),
  };
  const fatShare = fatKcal / targetKcal;

  return {
    totalDailyEnergyExpenditure,
    adjustmentKcal: targetKcal - totalDailyEnergyExpenditure,
    targetKcal,
    exact,
    targets: { ...rounded, kcal: macroEnergy(rounded) },
    driftKcal: macroEnergy(rounded) - targetKcal,
    fatShare,
    fatBelowFloor: fatShare * 100 < FAT_FLOOR_PERCENT,
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
