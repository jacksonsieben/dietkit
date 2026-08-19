import { ATWATER } from "@/lib/energy/macros";
import { DEFAULT_TOLERANCE_G } from "@/lib/solver/macroSolver";
import type { MacroSet } from "@/lib/storage/types";

import type { SolvedMeal } from "./solve";

/**
 * Target against actual, per macro, for the day and for each meal (#21).
 *
 * The predecessor printed a summary computed one way and a plan computed
 * another, so the table and the total under it disagreed — and the user was
 * left to work out which of the two numbers was the plan
 * (docs/MACRO-RECONCILIATION.md § 5). The lesson recorded there is that a
 * computed quantity must have exactly one source of truth and the view must
 * read it, so nothing in this app recomputes totals: this module takes the
 * `SolvedMeal`s the screen is already rendering and subtracts.
 *
 * Two decisions make that claim literal rather than approximate.
 *
 * **It rounds before it subtracts.** The screen prints whole grams, and a delta
 * computed from unrounded values will eventually print "180 · 181 · 0", which
 * is the same contradiction in miniature. So the rounding happens here, once,
 * and `delta` is exactly the difference between the two numbers on the row.
 *
 * **The day is the sum of the meals, not the goal it came from.** They are
 * equal by construction — `distributeTargets` apportions rather than rounds —
 * but summing the rows means the panel cannot print a total the table does not
 * contain, even if that apportionment is ever changed.
 */

/** kcal last: it is a consequence of the three above it, not a fourth dial. */
export const RECONCILE_MACROS = [
  "proteinG",
  "carbG",
  "fatG",
  "kcal",
] as const;

export type ReconcileMacro = (typeof RECONCILE_MACROS)[number];

/**
 * How far a macro may sit from its target and still count as met.
 *
 * The gram band is the solver's own tolerance, imported rather than repeated:
 * a panel that called a meal off-target while the solver called it solved would
 * be a third opinion on a question that already has an answer.
 *
 * The kcal band is that same band expressed in energy — what 2 g of slack in
 * each of the three macros is worth at 4/4/9. Energy is never solved for
 * directly (see `MacroTargets.kcal`), so holding it to a couple of kilocalories
 * would flag every plan the solver is content with.
 */
export const TOLERANCE = {
  gramsG: DEFAULT_TOLERANCE_G,
  kcal:
    DEFAULT_TOLERANCE_G *
    (ATWATER.proteinKcalPerG + ATWATER.carbKcalPerG + ATWATER.fatKcalPerG),
} as const;

export type MacroState = "on" | "under" | "over";

export interface MacroLine {
  readonly macro: ReconcileMacro;
  /** Whole units, as printed. */
  readonly target: number;
  readonly actual: number;
  /** `actual − target`: positive is over. Whole, and equal to the subtraction. */
  readonly delta: number;
  readonly state: MacroState;
}

export interface Reconciliation {
  readonly lines: readonly MacroLine[];
  /** Every macro within tolerance — the one thing the screen says in colour. */
  readonly onTarget: boolean;
}

function toleranceFor(macro: ReconcileMacro): number {
  return macro === "kcal" ? TOLERANCE.kcal : TOLERANCE.gramsG;
}

function line(macro: ReconcileMacro, targets: MacroSet, actual: MacroSet): MacroLine {
  const to = Math.round(targets[macro]);
  const at = Math.round(actual[macro]);
  const delta = at - to;

  return {
    macro,
    target: to,
    actual: at,
    delta,
    state:
      Math.abs(delta) <= toleranceFor(macro) ? "on" : delta < 0 ? "under" : "over",
  };
}

export function reconcile(targets: MacroSet, actual: MacroSet): Reconciliation {
  const lines = RECONCILE_MACROS.map((macro) => line(macro, targets, actual));
  return { lines, onTarget: lines.every((entry) => entry.state === "on") };
}

/** What this meal was asked for, against what its foods come to. */
export function reconcileMeal(solved: SolvedMeal): Reconciliation {
  return reconcile(solved.targets, solved.achieved);
}

/**
 * The day, summed from the meals on screen.
 *
 * Both columns come from the same array, so the panel is arithmetic over the
 * rendered rows rather than a second opinion about them.
 */
export function reconcileDay(solved: readonly SolvedMeal[]): Reconciliation {
  return reconcile(total(solved, "targets"), total(solved, "achieved"));
}

function total(
  solved: readonly SolvedMeal[],
  field: "targets" | "achieved",
): MacroSet {
  return solved.reduce<MacroSet>(
    (sum, meal) => ({
      kcal: sum.kcal + meal[field].kcal,
      proteinG: sum.proteinG + meal[field].proteinG,
      carbG: sum.carbG + meal[field].carbG,
      fatG: sum.fatG + meal[field].fatG,
    }),
    { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 },
  );
}
