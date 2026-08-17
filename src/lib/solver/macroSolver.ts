import type { MacroSet } from "@/lib/storage/types";

import { solveBoundedLeastSquares } from "./boundedLeastSquares";

export interface SolverFood {
  id: string;
  /** Composition per 100 g, as TACO and custom foods both store it. */
  per100g: MacroSet;
  minG: number;
  maxG: number;
  /**
   * What the plan currently says. The solution is anchored here, so tweaking a
   * target nudges portions instead of reshuffling the whole meal.
   */
  quantityG: number;
}

export interface MacroTargets {
  proteinG: number;
  carbG: number;
  fatG: number;
  /**
   * Reported against but not solved for. Energy is a consequence of the three
   * macros, and TACO's kcal column is measured rather than derived from
   * 4/4/9 — solving both would be asking the solver to satisfy two versions of
   * the same constraint.
   */
  kcal?: number;
}

export interface SolveOptions {
  /** Per-macro trade-off. Equal by default: a gram is a gram. */
  weights?: { proteinG: number; carbG: number; fatG: number };
  /** Portions round to this, in grams. Nobody weighs food to a decimal. */
  roundToG?: number;
  /** A macro within this many grams of target counts as hit. */
  toleranceG?: number;
  /** See `regularisation` in boundedLeastSquares. */
  anchorStrength?: number;
  maxIterations?: number;
}

export interface SolvedItem {
  foodId: string;
  quantityG: number;
  /** `minG === maxG` — a mandatory fixed item, not a solver decision. */
  pinned: boolean;
  atBound: "min" | "max" | null;
}

export interface MacroResidual {
  proteinG: number;
  carbG: number;
  fatG: number;
  /** `null` when no energy target was given. */
  kcal: number | null;
}

export interface MacroSolution {
  items: SolvedItem[];
  /** Computed from the **rounded** quantities — see below. */
  achieved: MacroSet;
  /** `achieved − target`. Positive is over target. */
  residual: MacroResidual;
  feasible: boolean;
  /**
   * Foods pinned against a bound in the direction that would have closed a
   * missed macro. This is the honest answer to "why is protein still 18 g
   * short": not a solver failure, but chicken and whey both at their maximum.
   */
  limiting: SolvedItem[];
  iterations: number;
  converged: boolean;
}

const DEFAULT_ROUND_TO_G = 1;
const DEFAULT_TOLERANCE_G = 2;

const MACRO_ROWS = ["proteinG", "carbG", "fatG"] as const;
type MacroRow = (typeof MACRO_ROWS)[number];

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/**
 * The joint solve that replaces the predecessor's per-macro scaling.
 *
 * Everything the old two-pass fat logic did falls out of this: the fat vehicle
 * is just a food whose column is (0, 0, 1) with a wide bound, mandatory items
 * are foods with `minG === maxG`, and the day-level pooling disappears because
 * all three macros are balanced at once instead of one after another.
 */
export function solveMacros(
  foods: readonly SolverFood[],
  targets: MacroTargets,
  options: SolveOptions = {},
): MacroSolution {
  const {
    weights,
    roundToG = DEFAULT_ROUND_TO_G,
    toleranceG = DEFAULT_TOLERANCE_G,
    anchorStrength,
    maxIterations,
  } = options;

  // Per gram of food, not per 100 g.
  const A = MACRO_ROWS.map((macro) =>
    foods.map((food) => food.per100g[macro] / 100),
  );
  const t = MACRO_ROWS.map((macro) => targets[macro]);
  const w = weights
    ? MACRO_ROWS.map((macro) => weights[macro])
    : undefined;

  const lo = foods.map((food) => Math.min(food.minG, food.maxG));
  const hi = foods.map((food) => Math.max(food.minG, food.maxG));
  const reference = foods.map((food, j) => clamp(food.quantityG, lo[j]!, hi[j]!));

  const raw = solveBoundedLeastSquares({
    A,
    t,
    lo,
    hi,
    weights: w,
    reference,
    initial: reference,
    regularisation: anchorStrength,
    maxIterations,
  });

  // Round first, then measure. MACRO-RECONCILIATION.md's most portable lesson
  // is that a computed quantity needs exactly one source of truth and the view
  // must read it — so the totals below are the totals of the numbers the user
  // will actually be shown, not of the pre-rounding floats.
  //
  // Rounding to the grid also has to break its own tie. Rounding moves the
  // anchor, and along the flat directions an underdetermined meal is full of the
  // optimum follows the anchor almost one-for-one — so plain rounding makes
  // merely reopening a solved plan drift a portion by a gram, then another. When
  // the plan's own number is within half a step of the computed optimum it is
  // therefore preferred: that is never worse than rounding, since both land
  // within half a step of the same value, and "125 g of broccoli" is the user's
  // decision, not something to shave to 124 for no gain.
  // How near counts as near is measured in grams of macro, not grams of food:
  // a gram of olive oil and a gram of broccoli are not comparable quantities.
  // So the plan's number wins when keeping it costs at most half a gram of any
  // macro, and never moves a food by more than one rounding step either way.
  const half = roundToG / 2;
  const quantities = raw.q.map((value, j) => {
    const grid = Math.round(value / roundToG) * roundToG;
    const asPlanned = Math.round(reference[j]! / roundToG) * roundToG;
    const perGram = Math.max(
      ...MACRO_ROWS.map((macro) => foods[j]!.per100g[macro] / 100),
    );
    const room = perGram > 0 ? Math.min(roundToG, half / perGram) : roundToG;
    const chosen =
      Math.abs(value - asPlanned) <= room + 1e-9 ? asPlanned : grid;
    return clamp(chosen, lo[j]!, hi[j]!);
  });

  const achieved: MacroSet = { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 };
  foods.forEach((food, j) => {
    const factor = quantities[j]! / 100;
    achieved.kcal += food.per100g.kcal * factor;
    achieved.proteinG += food.per100g.proteinG * factor;
    achieved.carbG += food.per100g.carbG * factor;
    achieved.fatG += food.per100g.fatG * factor;
  });

  const items: SolvedItem[] = foods.map((food, j) => {
    const pinned = lo[j]! === hi[j]!;
    const quantity = quantities[j]!;
    return {
      foodId: food.id,
      quantityG: quantity,
      pinned,
      atBound: pinned
        ? null
        : quantity <= lo[j]!
          ? "min"
          : quantity >= hi[j]!
            ? "max"
            : null,
    };
  });

  const residual: MacroResidual = {
    proteinG: achieved.proteinG - targets.proteinG,
    carbG: achieved.carbG - targets.carbG,
    fatG: achieved.fatG - targets.fatG,
    kcal: targets.kcal === undefined ? null : achieved.kcal - targets.kcal,
  };

  const missed = MACRO_ROWS.filter(
    (macro) => Math.abs(residual[macro]) > toleranceG,
  );

  const limiting = items.filter((item, j) => {
    if (item.pinned || item.atBound === null) return false;
    return missed.some((macro: MacroRow) => {
      const contribution = foods[j]!.per100g[macro];
      if (contribution <= 0) return false;
      // Short of target and already at the maximum, or over target and already
      // at the minimum — either way this food cannot move the macro further.
      return residual[macro] < 0
        ? item.atBound === "max"
        : item.atBound === "min";
    });
  });

  return {
    items,
    achieved,
    residual,
    feasible: missed.length === 0,
    limiting,
    iterations: raw.iterations,
    converged: raw.converged,
  };
}
