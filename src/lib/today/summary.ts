import { buildFoodBook } from "@/lib/diet/composition";
import { groupCompositions } from "@/lib/diet/groups";
import { loadPlan } from "@/lib/diet/plan";
import { reconcile, type Reconciliation } from "@/lib/diet/reconcile";
import { planTotals, solvePlan } from "@/lib/diet/solve";
import { loadGoal } from "@/lib/energy/goal";
import { planMacros } from "@/lib/energy/macros";
import { loadEnergySummary } from "@/lib/energy/summary";
import type { Repository } from "@/lib/storage";
import type { FoodRef, Id, IsoDate, MacroSet } from "@/lib/storage/types";
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

/**
 * One food on today's plate, named and weighed.
 *
 * The `name` is the resolved one rather than a key, because the whole point of
 * carrying these up to the screen is that a person reads them: "what am I
 * eating today" is answered by the words *arroz* and *ovo*, and until now they
 * appeared nowhere outside the editor. `food` comes along so the screen can
 * gloss the grams as a portion (#D) — that lookup is drawn from the ref every
 * time rather than stored beside the grams.
 */
export interface TodayFood {
  readonly name: string;
  readonly food: FoodRef;
  readonly quantityG: number;
}

export interface TodayMeal {
  readonly id: Id;
  readonly name: string;
  /** What the solve actually put on this plate, in energy. */
  readonly kcal: number;
  /**
   * What this meal is *meant* to carry — its share of the day.
   *
   * Carried alongside rather than instead, because a meal with nothing in it
   * reads `0 kcal` otherwise, which is arithmetic nobody needed: the useful
   * fact about an empty lunch is that there are 923 kcal to put in it.
   */
  readonly targetKcal: number;
  /**
   * Today's meal, and only today's: the meal's own rows plus the selected
   * version of each choice, which is what `solvePlan` was handed (#111). A food
   * whose row no longer resolves is absent here rather than listed at zero —
   * the editor is where a broken row gets named and fixed.
   */
  readonly foods: readonly TodayFood[];
}

export interface TodayReady {
  status: "ready";
  targets: MacroSet;
  weight: WeightNow;
  /** Present only once a plan exists; the plan's own numbers against `targets`. */
  plan?: {
    name: string;
    /** In the plan's own order, empty meals included — they are the ones to fill. */
    meals: readonly TodayMeal[];
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
      // Read off the solve rather than off the stored plan: the grams on this
      // screen are the ones today's targets produce, not the ones that were
      // saved with the diet, and those are the same numbers `achieved` below
      // adds up.
      meals: solved.map((meal) => ({
        id: meal.meal.id,
        name: meal.meal.name,
        kcal: meal.achieved.kcal,
        targetKcal: meal.targets.kcal,
        foods: meal.items.map((entry) => ({
          name: entry.food.name,
          food: entry.item.food,
          quantityG: entry.quantityG,
        })),
      })),
      achieved,
      reconciliation: reconcile(targets, achieved),
    },
  };
}
