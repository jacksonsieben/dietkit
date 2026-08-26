import { buildFoodBook } from "@/lib/diet/composition";
import { groupCompositions } from "@/lib/diet/groups";
import { effectiveItems } from "@/lib/diet/options";
import { loadPlan } from "@/lib/diet/plan";
import { reconcile, type Reconciliation } from "@/lib/diet/reconcile";
import { planTotals, solvePlan } from "@/lib/diet/solve";
import { loadGoal } from "@/lib/energy/goal";
import { planMacros } from "@/lib/energy/macros";
import { loadEnergySummary } from "@/lib/energy/summary";
import type { Repository } from "@/lib/storage";
import type { IsoDate, MacroSet } from "@/lib/storage/types";
import { trendChange, weightTrend, type TrendChange } from "@/lib/weight/trend";

/**
 * The whole of the home screen, assembled in one read (#61).
 *
 * The screen answers two questions — *what am I eating today* and *is this
 * working* — and both are already computable from records the app holds. What
 * did not exist before was a place where they are answered together, so this
 * module is deliberately an assembly of existing lib functions rather than any
 * new arithmetic: the targets come from `planMacros` exactly as the energy
 * screen derives them, the plan is solved by `solvePlan` exactly as the diet
 * screen solves it, and the trend is `weightTrend` exactly as the weight screen
 * charts it. A home screen that computed its own version of any of those would
 * be the predecessor's bug (docs/MACRO-RECONCILIATION.md § 5) moved to a new
 * address.
 *
 * The states below are ordered by what the user has to do next, and the screen
 * renders exactly one of them. That ordering is the design decision worth a
 * test: the loop is profile -> targets -> plan -> eating -> weigh-in, and the
 * first missing link in that chain is the only thing worth putting on screen.
 */

export interface WeightNow {
  kg: number;
  /** The day it was measured, so a stale reading can say so. */
  on: IsoDate;
  /** How far the *trend* has moved, or `undefined` with too little to compare. */
  change?: TrendChange;
}

export interface TodayReady {
  status: "ready";
  targets: MacroSet;
  weight: WeightNow;
  /** Present only once a plan exists; the plan's own numbers against `targets`. */
  plan?: {
    name: string;
    mealCount: number;
    /** How many meals have at least one food in them. */
    filledMealCount: number;
    achieved: MacroSet;
    reconciliation: Reconciliation;
  };
}

/**
 * `needs` is a first-class answer, not an error — arriving here on a fresh
 * device is the ordinary path, and it is the path the app is worst at today.
 */
export type TodayState =
  { status: "needs"; needs: "profile" | "weight" } | TodayReady;

export async function loadToday(
  repository: Repository,
  today: IsoDate,
): Promise<TodayState> {
  const energy = await loadEnergySummary(repository, today);
  if (energy.status === "missing") {
    return { status: "needs", needs: energy.needs };
  }

  const [goal, entries, diet, customFoods, groups] = await Promise.all([
    loadGoal(repository),
    repository.weight.list(),
    loadPlan(repository),
    repository.customFoods.list(),
    repository.substitutionGroups.list(),
  ]);

  const { targets } = planMacros({
    totalDailyEnergyExpenditure: energy.summary.totalDailyEnergyExpenditure,
    weightKg: energy.summary.weightKg,
    goal,
  });

  const weight: WeightNow = {
    kg: energy.summary.weightKg,
    on: energy.summary.weighedOn,
    change: trendChange(weightTrend(entries)),
  };

  if (!diet) return { status: "ready", targets, weight };

  // Solved against *today's* targets rather than the ones stored on the diet.
  // The stored targets are what the plan was built for; the point of this
  // screen is whether the plan still fits the body, and a weigh-in since the
  // plan was written is exactly the case where those two differ (#25).
  const book = buildFoodBook(
    [...(diet.tacoFoods ?? []), ...groupCompositions(groups)],
    customFoods,
  );
  const solved = solvePlan(targets, diet.meals, book);
  const achieved = planTotals(solved);

  return {
    status: "ready",
    targets,
    weight,
    plan: {
      name: diet.name,
      mealCount: diet.meals.length,
      filledMealCount: diet.meals.filter(
        (meal) => effectiveItems(meal).length > 0,
      ).length,
      achieved,
      reconciliation: reconcile(targets, achieved),
    },
  };
}
