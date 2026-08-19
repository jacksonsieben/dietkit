import type { Diet, MacroSet } from "@/lib/storage/types";

/**
 * Bringing a saved plan up to date with the body it was written for (#25).
 *
 * The loop the app is for is calculate → build → track → rebuild, and this is
 * the last arrow. Someone who logs a weight every week is, six weeks later,
 * eating a plan divided from a number they no longer weigh — and the plan has
 * no way to say so, because the targets it stores are the ones its meals were
 * apportioned from and rightly do not move on their own.
 *
 * So the drift is *shown* rather than applied. `savePlan` explains why targets
 * are stored on the diet instead of recomputed on open: a plan whose numbers
 * silently followed the scale would be a set of meals that no longer add up to
 * anything, with nothing on screen to say when it changed or why. That argument
 * is only worth making if the alternative exists, and this module is the
 * alternative — the difference, named, and one action to take it.
 *
 * Pure functions over records, so what counts as drift and what a rebuild does
 * to a plan are testable without a store or a screen.
 */

/**
 * How far the scale has to move before the plan mentions it.
 *
 * Bodyweight swings by a kilogram between a Tuesday and a Wednesday on water
 * alone, and a banner that appears every single visit is one nobody reads by
 * the third week — which would cost exactly the users this feature is for. Half
 * a kilogram is under the smallest change that moves a target enough to notice
 * (roughly 10 kcal and 1 g of protein at these coefficients) and above the
 * noise of a scale read before breakfast versus after.
 */
export const REBASE_THRESHOLD_KG = 0.5;

export interface WeightDrift {
  /** What the plan was built from. */
  fromKg: number;
  /** The most recent logged weight. */
  toKg: number;
  /** Signed, `toKg - fromKg`: the sign is the whole point of showing it. */
  deltaKg: number;
}

/**
 * The gap between the plan's weight and today's, when there is one worth saying.
 *
 * `undefined` covers three different "nothing to report" cases on purpose,
 * because the caller does the same thing in all three — says nothing:
 *
 *  - a plan with no `basedOnWeightKg`, which is one written before that was
 *    recorded (or imported from the predecessor). There is no honest comparison
 *    to make, and inventing one by assuming today's weight would claim the plan
 *    is current when nobody knows whether it is.
 *  - a difference under `REBASE_THRESHOLD_KG`.
 *  - exactly equal, the ordinary case for a plan built this morning.
 */
export function weightDrift(
  plan: Diet,
  latestWeightKg: number,
): WeightDrift | undefined {
  const fromKg = plan.basedOnWeightKg;
  if (fromKg === undefined) return undefined;

  const deltaKg = latestWeightKg - fromKg;
  if (Math.abs(deltaKg) < REBASE_THRESHOLD_KG) return undefined;

  return { fromKg, toKg: latestWeightKg, deltaKg };
}

/**
 * The plan, re-aimed at the targets today's body asks for.
 *
 * The meals are untouched — names, order, shares, foods and their bounds are
 * the user's work and none of it depends on the weight. What changes is the
 * total the shares are taken of, which is why a rebuild is one action rather
 * than a rebuild: the portions follow from the targets through
 * `distributeTargets` and the solver, so re-aiming the top of the chain
 * re-sizes every meal underneath it without asking anything again.
 *
 * `updatedAt` is deliberately not set here. This returns the plan the screen
 * should show, not the plan the store should hold; nothing is written until the
 * user saves, and `savePlan` stamps the time at the moment it writes. A rebuild
 * someone looked at and backed out of should leave no trace.
 */
export function rebasePlan(
  plan: Diet,
  targets: MacroSet,
  weightKg: number,
): Diet {
  return { ...plan, targets, basedOnWeightKg: weightKg };
}

/**
 * Whether a plan is one this screen built, as opposed to one it inherited.
 *
 * Used to decide whether the weight a plan was based on can be shown at all —
 * see the `undefined` case in `weightDrift`. Split out so the two screens that
 * ask cannot answer it differently.
 */
export function planKnowsItsWeight(
  plan: Diet,
): plan is Diet & { basedOnWeightKg: number } {
  return plan.basedOnWeightKg !== undefined;
}
