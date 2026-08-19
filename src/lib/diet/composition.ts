import type { FoodSearchResult } from "@/lib/db/foods";
import { numericValue, readCell } from "@/lib/db/nutrients";
import type { SolverFood } from "@/lib/solver/macroSolver";
import type {
  CustomFood,
  DietItem,
  FoodComposition,
  FoodRef,
  MacroSet,
  Meal,
} from "@/lib/storage/types";

/**
 * Turning what a plan *points at* into numbers the solver can use (#19).
 *
 * A `DietItem` holds a reference, never a composition — `{ source: "taco",
 * tacoId: 12 }` — and the solver needs grams per gram. The two halves of the
 * answer come from different places for different reasons, and keeping that
 * straight is most of what this file is:
 *
 * - **TACO rows** are copied into the plan when the food is chosen
 *   (`FoodComposition`), because the published table is on a server this app
 *   is supposed to work without, and because a re-ingest must not silently
 *   re-solve a plan someone already wrote down.
 * - **Custom foods** are read live from the device, because they are the
 *   user's own record and fixing a typo in one is meant to reach the meals
 *   that use it.
 *
 * Pure. Nothing here fetches, and nothing here writes.
 */

/** Unique across both sources — the id spaces overlap at, say, 1. */
export type FoodKey = string;

export function foodKey(ref: FoodRef): FoodKey {
  return ref.source === "taco" ? `taco:${ref.tacoId}` : `custom:${ref.customFoodId}`;
}

export interface ResolvedFood {
  readonly key: FoodKey;
  readonly ref: FoodRef;
  readonly name: string;
  readonly per100g: MacroSet;
}

/** Everything a plan's items can be looked up in, by `foodKey`. */
export type FoodBook = ReadonlyMap<FoodKey, ResolvedFood>;

export function buildFoodBook(
  tacoFoods: readonly FoodComposition[] = [],
  customFoods: readonly CustomFood[] = [],
): FoodBook {
  const book = new Map<FoodKey, ResolvedFood>();

  for (const food of tacoFoods) {
    const ref: FoodRef = { source: "taco", tacoId: food.tacoId };
    book.set(foodKey(ref), {
      key: foodKey(ref),
      ref,
      name: food.name,
      per100g: food.per100g,
    });
  }

  for (const food of customFoods) {
    const ref: FoodRef = { source: "custom", customFoodId: food.id };
    book.set(foodKey(ref), {
      key: foodKey(ref),
      ref,
      name: food.name,
      per100g: food.per100g,
    });
  }

  return book;
}

export interface ResolvedItem {
  readonly item: DietItem;
  readonly food: ResolvedFood;
}

export interface Resolution {
  readonly known: ResolvedItem[];
  /**
   * Items whose food the book cannot answer for: a custom food deleted since,
   * or a TACO row added on a device whose snapshot never made it here.
   *
   * Reported rather than dropped, and rather than defaulted to zero. A food
   * silently worth 0 g of everything would let the solver make up the
   * difference elsewhere and hand back a meal that looks solved, which is the
   * one failure mode this whole issue exists to rule out.
   */
  readonly missing: DietItem[];
}

export function resolveItems(items: readonly DietItem[], book: FoodBook): Resolution {
  const known: ResolvedItem[] = [];
  const missing: DietItem[] = [];

  for (const item of items) {
    const food = book.get(foodKey(item.food));
    if (food === undefined) missing.push(item);
    else known.push({ item, food });
  }

  return { known, missing };
}

/**
 * The solver's view of a meal's items.
 *
 * `mandatory` becomes `minG === maxG`, which is how a fixed item is *credited*
 * rather than scaled: a column that cannot move contributes a constant to
 * `A·q`, so the free foods are sized against what is left of the target. That
 * is exactly the "move it to the right-hand side" the predecessor did by hand
 * in a separate pass (docs/MACRO-RECONCILIATION.md § 1), except that here it
 * falls out of the bounds instead of being a step that can be forgotten.
 */
export function toSolverFoods(resolved: readonly ResolvedItem[]): SolverFood[] {
  return resolved.map(({ item, food }) => ({
    id: item.id,
    per100g: food.per100g,
    minG: item.mandatory ? item.quantityG : item.minG,
    maxG: item.mandatory ? item.quantityG : item.maxG,
    quantityG: item.quantityG,
  }));
}

/** The macro cells a plan cannot be built without — the same four the search filters on. */
const REQUIRED = ["energyKcal", "proteinG", "carbG", "fatG"] as const;

/**
 * A search result, copied into the plan.
 *
 * `undefined` when TACO withheld one of the four macros (`*`, or a cell that
 * was never printed). `numericValue` would return 0 there, and its own comment
 * says why that must not happen here: the measurement is missing rather than
 * small, so a plan balanced on it would be understating a total with nothing on
 * screen to say so. `NA` and `Tr` are different and do pass — both are honest
 * zeroes at the gram precision a diet is written in.
 */
export function compositionFromResult(
  result: FoodSearchResult,
): FoodComposition | undefined {
  for (const key of REQUIRED) {
    const cell = readCell(result, key);
    if (cell.kind === "absent") return undefined;
    if (cell.kind === "sentinel" && cell.sentinel === "*") return undefined;
  }

  return {
    tacoId: result.id,
    name: result.description,
    per100g: {
      kcal: numericValue(result, "energyKcal"),
      proteinG: numericValue(result, "proteinG"),
      carbG: numericValue(result, "carbG"),
      fatG: numericValue(result, "fatG"),
    },
  };
}

/**
 * The snapshots the plan still needs, in the order they were first used.
 *
 * Called on save so that removing the last item that used a food drops its
 * copy too. A plan that accumulates every food ever tried in it is a plan that
 * grows without bound in a store the user cannot see, and the export in #26 is
 * the only backup they have — it should carry the plan, not its history.
 */
export function usedTacoFoods(
  meals: readonly Meal[],
  known: readonly FoodComposition[],
): FoodComposition[] {
  const byId = new Map(known.map((food) => [food.tacoId, food]));
  const used: FoodComposition[] = [];
  const seen = new Set<number>();

  for (const meal of meals) {
    for (const item of meal.items) {
      if (item.food.source !== "taco") continue;
      if (seen.has(item.food.tacoId)) continue;

      const food = byId.get(item.food.tacoId);
      if (food === undefined) continue;

      seen.add(item.food.tacoId);
      used.push(food);
    }
  }

  return used;
}
