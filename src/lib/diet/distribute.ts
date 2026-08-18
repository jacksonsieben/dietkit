import { macroEnergy } from "@/lib/energy/macros";
import type { MacroSet, Meal } from "@/lib/storage/types";

import { normalizeShares } from "./meals";

/**
 * The day's targets, split across whatever meals exist (#18).
 *
 * Kept apart from `meals.ts` because it answers a different question: that file
 * decides what the meals *are*, this one decides what each of them is worth.
 * The split is arithmetic with one non-obvious requirement — the parts have to
 * add back up to the whole — and that requirement is the entire content of this
 * module.
 */

export interface MealTargets {
  meal: Meal;
  /** The normalised share, so the row can print the percentage it was actually given. */
  share: number;
  targets: MacroSet;
}

/**
 * Splits `targets` across `meals` in their shares, in whole grams that sum to
 * the daily grams exactly.
 *
 * Rounding each meal independently is the obvious implementation and it is
 * wrong in a way users find immediately: five meals at 20% of 187 g of protein
 * round to 37 g each, the column adds to 185, and someone who eats the plan as
 * written is 2 g short of the number printed at the top of the same screen.
 * Two grams is nothing nutritionally and everything for trust — an app that
 * cannot make its own table add up is an app you start checking by hand.
 *
 * So the grams are apportioned rather than rounded: everyone gets their floor,
 * and the leftover whole grams go to the meals with the largest fractions left
 * over. It is Hamilton's method, borrowed from dividing seats between states,
 * and it is used here for the same property — the parts total the whole by
 * construction, not by luck.
 *
 * Kilocalories are then computed from each meal's own grams rather than
 * apportioned separately, which keeps every row internally consistent (4/4/9 on
 * the numbers beside it) and, because `MacroSet.kcal` upstream is itself what
 * the rounded grams are worth, makes the kcal column total the day's target
 * exactly as well.
 */
export function distributeTargets(
  targets: MacroSet,
  meals: readonly Meal[],
): MealTargets[] {
  if (meals.length === 0) return [];

  const normalized = normalizeShares(meals);
  const shares = normalized.map((meal) => meal.share);

  const proteinG = apportion(targets.proteinG, shares);
  const carbG = apportion(targets.carbG, shares);
  const fatG = apportion(targets.fatG, shares);

  return normalized.map((meal, index) => {
    const macros = {
      proteinG: proteinG[index],
      carbG: carbG[index],
      fatG: fatG[index],
    };

    return {
      meal,
      share: meal.share,
      targets: { ...macros, kcal: macroEnergy(macros) },
    };
  });
}

/**
 * The shares as whole percentages that add to exactly 100.
 *
 * The same apportionment as the grams, for the same reason and one more: three
 * even meals are 33,333…% each, and a column reading "33 · 33 · 33" under a
 * heading that says the day is fully allotted is the app failing at the one
 * sum a reader will check in their head. Rounded to whole numbers because the
 * percentage is also what the user types back in, and a box that has to be
 * filled with 33,3 to mean a third is a box that invites the same argument
 * every time.
 */
export function sharePercents(meals: readonly Meal[]): number[] {
  if (meals.length === 0) return [];

  return apportion(
    100,
    normalizeShares(meals).map((meal) => meal.share),
  );
}

/**
 * `total` whole units divided in `shares`, losing nothing.
 *
 * The remainder loop is bounded by the number of shares because that is the
 * arithmetic — with every meal taking its floor, at most one unit per meal can
 * be left over — but it is written as a `min` rather than assumed, since
 * `total` arrives from a store this module does not own.
 */
function apportion(total: number, shares: readonly number[]): number[] {
  const pool = Math.max(0, Math.round(total));
  const exact = shares.map((share) => pool * share);
  const given = exact.map(Math.floor);

  const left = Math.min(
    shares.length,
    Math.max(0, pool - given.reduce((sum, value) => sum + value, 0)),
  );

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    // Ties go to the earlier meal: an arbitrary rule, but a stable one, so the
    // same plan never renders two different tables.
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (let taken = 0; taken < left; taken += 1) {
    given[byRemainder[taken].index] += 1;
  }

  return given;
}
