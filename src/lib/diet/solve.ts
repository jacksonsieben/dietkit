import type {
  MacroResidual,
  MacroSolution,
  SolveOptions,
} from "@/lib/solver/macroSolver";
import { solveMacros } from "@/lib/solver/macroSolver";
import type { DietItem, Id, MacroSet, Meal } from "@/lib/storage/types";

import type { FoodBook, ResolvedFood } from "./composition";
import { resolveItems, toSolverFoods } from "./composition";
import { distributeTargets } from "./distribute";
import { effectiveItems, mapMealItems } from "./options";

/**
 * The day's targets, solved into portions (#19).
 *
 * This is the file the predecessor did not have. Its plan was built one macro
 * at a time — protein scaled first, then carbohydrate against what was left,
 * then a second pass that treated one food as "the fat vehicle" and stretched
 * it to close the gap (docs/MACRO-RECONCILIATION.md § 1). Every stage made the
 * previous one wrong, so the day's totals were reconciled afterwards by pooling
 * the error across meals, and a target that could not be met came back as a
 * plan that quietly missed it.
 *
 * Here the three macros are one system with one answer. `solveMacros` does the
 * arithmetic; what this module adds is the plan-shaped part around it: which
 * targets each meal is solved against (`distributeTargets`, #18), which foods
 * the items resolve to (`composition.ts`), and how the answer comes back —
 * including, deliberately, when there isn't one.
 *
 * Three consequences worth stating, because they are the issue's acceptance
 * criteria and none of them is code in this file:
 *
 * - **Mandatory items are credited, not scaled.** They arrive as
 *   `minG === maxG`, a column the solver cannot move, so it contributes a
 *   constant to `A·q` and the free foods are sized against the remainder. The
 *   old "subtract it from the target first" pass is the same arithmetic with a
 *   step that could be skipped.
 * - **Infeasible is a result, not a silent miss.** `feasible` and `residual`
 *   come back from every solve and `limiting` names the foods holding the
 *   macro where it is. A meal of lean chicken cannot reach 40 g of fat and the
 *   honest answer is to say so.
 * - **There is no fat vehicle.** Oil is a food whose column is roughly
 *   (0, 0, 1) with a wide `maxG`. Nothing here knows its name.
 *
 * A meal is solved as `effectiveItems` says it is: its fixed rows plus the
 * selected option of each set (#111). The options nobody picked are not zero
 * and not missing — they are not part of today's meal at all, and a solver
 * that saw them would size four breakfasts and hit the target with none of
 * them.
 *
 * Pure, and per-meal: no day-level pooling, because there is no per-meal error
 * left to pool.
 */

export interface SolvedItem {
  readonly item: DietItem;
  readonly food: ResolvedFood;
  /** Grams, whole, after the solve. */
  readonly quantityG: number;
  /** Mandatory: fixed by the user, not chosen here. */
  readonly pinned: boolean;
  readonly atBound: "min" | "max" | null;
  /**
   * At a bound in the direction that would have closed a macro still missed —
   * the answer to "why is protein short", which is never "the solver failed".
   */
  readonly limiting: boolean;
  /** What this portion is worth, so a row can print its own contribution. */
  readonly macros: MacroSet;
}

export interface SolvedMeal {
  readonly meal: Meal;
  /** The normalised share, straight from `distributeTargets`. */
  readonly share: number;
  readonly targets: MacroSet;
  readonly items: SolvedItem[];
  /**
   * Items whose food could not be resolved — see `Resolution.missing`. Left out
   * of the solve entirely rather than counted as zero, and surfaced so the
   * screen can say which row is the problem.
   */
  readonly missing: DietItem[];
  readonly achieved: MacroSet;
  readonly residual: MacroResidual;
  /**
   * Every macro within tolerance *and* nothing unresolved. A meal with a
   * missing food may well hit its numbers using the foods that are left, and
   * calling that solved would be the silent mis-solve the issue rules out.
   */
  readonly feasible: boolean;
}

/** What `grams` of a food is worth. */
export function macrosFor(per100g: MacroSet, grams: number): MacroSet {
  const factor = grams / 100;
  return {
    kcal: per100g.kcal * factor,
    proteinG: per100g.proteinG * factor,
    carbG: per100g.carbG * factor,
    fatG: per100g.fatG * factor,
  };
}

/**
 * Every meal in the plan, solved against its share of the day.
 *
 * Per meal rather than one big system over the whole day, and that is a
 * modelling choice rather than a performance one: a joint solve would happily
 * pay for a missed breakfast at dinner, which is arithmetically tidy and not
 * how anyone eats. Each meal is asked to be the meal it was given.
 */
export function solvePlan(
  targets: MacroSet,
  meals: readonly Meal[],
  book: FoodBook,
  options?: SolveOptions,
): SolvedMeal[] {
  return distributeTargets(targets, meals).map((share) =>
    solveMeal(share.meal, share.targets, book, share.share, options),
  );
}

function solveMeal(
  meal: Meal,
  targets: MacroSet,
  book: FoodBook,
  share: number,
  options?: SolveOptions,
): SolvedMeal {
  const { known, missing } = resolveItems(effectiveItems(meal), book);

  const solution: MacroSolution = solveMacros(
    toSolverFoods(known),
    {
      proteinG: targets.proteinG,
      carbG: targets.carbG,
      fatG: targets.fatG,
      kcal: targets.kcal,
    },
    options,
  );

  const limiting = new Set(solution.limiting.map((item) => item.foodId));

  const items = known.map(({ item, food }, index): SolvedItem => {
    const solved = solution.items[index]!;
    return {
      item,
      food,
      quantityG: solved.quantityG,
      pinned: solved.pinned,
      atBound: solved.atBound,
      limiting: limiting.has(solved.foodId),
      macros: macrosFor(food.per100g, solved.quantityG),
    };
  });

  return {
    meal,
    share,
    targets,
    items,
    missing,
    achieved: solution.achieved,
    residual: solution.residual,
    feasible: solution.feasible && missing.length === 0,
  };
}

/**
 * The solved quantities written back onto the meals.
 *
 * Separate from the solve, and called on save rather than on every keystroke,
 * because a solve is a *proposal* until the user keeps it. Items the solve did
 * not cover — an unresolved food, or a row in an option nobody selected — keep
 * the quantity they had: the plan should come back the way it was left, not
 * edited by a food that failed to load.
 */
export function applySolution(
  meals: readonly Meal[],
  solved: readonly SolvedMeal[],
): Meal[] {
  const byMeal = new Map<Id, Map<Id, number>>(
    solved.map((entry) => [
      entry.meal.id,
      new Map(entry.items.map((item) => [item.item.id, item.quantityG])),
    ]),
  );

  return meals.map((meal) => {
    const quantities = byMeal.get(meal.id);
    if (quantities === undefined) return meal;

    return mapMealItems(meal, (items) =>
      items.map((item) => {
        const quantityG = quantities.get(item.id);
        return quantityG === undefined ? item : { ...item, quantityG };
      }),
    );
  });
}

/**
 * What the whole plan comes to, from the numbers the meals were actually given.
 *
 * Summed from the solved meals rather than compared against the daily target
 * directly, so the figure under the table is the table's own total. A day that
 * prints a total its rows do not add up to is the failure
 * docs/MACRO-RECONCILIATION.md § 3 is about.
 */
export function planTotals(solved: readonly SolvedMeal[]): MacroSet {
  return solved.reduce<MacroSet>(
    (total, meal) => ({
      kcal: total.kcal + meal.achieved.kcal,
      proteinG: total.proteinG + meal.achieved.proteinG,
      carbG: total.carbG + meal.achieved.carbG,
      fatG: total.fatG + meal.achieved.fatG,
    }),
    { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 },
  );
}
