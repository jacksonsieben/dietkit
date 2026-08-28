import type { Diet, MacroSet } from "@/lib/storage/types";

/**
 * Bringing a saved plan up to date with the numbers it was written for (#25,
 * #126).
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

/** The plan's targets against the ones today's profile and goal produce. */
export interface TargetDrift {
  /** What the meals were apportioned from. */
  from: MacroSet;
  /** What the same profile, weight and goal come to now. */
  to: MacroSet;
}

/**
 * Everything about a plan that has gone stale, or `undefined` when none of it
 * has.
 *
 * `weightDrift` was the whole of this for as long as the weight was the only
 * thing a plan could fall behind. It is not: the goal is four numbers a user
 * can change on `/energia` at any time, and changing one of them re-aims every
 * target without touching the scale. #126 is what that looked like in
 * production — the plan screen reporting 26 g of fat missing and the home
 * screen reporting 4 g too many, about the same food on the same day, with no
 * banner on either because the weight had not moved.
 *
 * So the question this asks is the general one: are the targets this plan was
 * apportioned from still the targets this body and this goal produce. The
 * weight gap comes along when there is one, because it is the *reason* in the
 * ordinary case and a sentence about grams would bury it.
 *
 * Both fields are optional and at least one is always present — a plan that has
 * not drifted returns `undefined` rather than an object of absences, so the
 * caller's test is the presence of a banner rather than the truth of a flag.
 */
export interface PlanDrift {
  /** Present when the scale moved far enough to say so. */
  weight?: WeightDrift;
  /** Present when the targets no longer match. */
  targets?: TargetDrift;
}

export function planDrift(
  plan: Diet,
  current: { targets: MacroSet; weightKg: number },
): PlanDrift | undefined {
  const weight = weightDrift(plan, current.weightKg);
  // Whole grams on both sides — `planMacros` rounds before it returns, and
  // these targets came from it — so an exact comparison is the comparison a
  // reader would make off the screen, with no tolerance to explain.
  const targets = sameTargets(plan.targets, current.targets)
    ? undefined
    : { from: plan.targets, to: current.targets };

  if (weight === undefined && targets === undefined) return undefined;
  return { ...(weight && { weight }), ...(targets && { targets }) };
}

function sameTargets(a: MacroSet, b: MacroSet): boolean {
  return (
    a.proteinG === b.proteinG &&
    a.carbG === b.carbG &&
    a.fatG === b.fatG &&
    a.kcal === b.kcal
  );
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
