import { parseDecimal } from "@/lib/profile/validation";
import type { DietItem, FoodRef, Id, Meal } from "@/lib/storage/types";

import { addToContainer, containerItems, withContainer } from "./options";

/**
 * What a meal is made of, and how much room the solver has in each item (#19).
 *
 * Structure only — the arithmetic is in `solve.ts` and the solver itself. What
 * lives here is the part the user drives: adding a food, taking one out,
 * pinning it as mandatory, and widening or narrowing the range it may be
 * scaled within.
 *
 * The bounds are the interesting half. A plan is underdetermined — three macro
 * equations against a dozen foods — so what stops the solver prescribing 400 g
 * of olive oil is not the objective, it is `maxG`. Bounds are therefore a
 * first-class thing a person edits, not a hidden constant.
 *
 * Pure functions over `readonly Meal[]`, for `meals.ts`'s reason: the decisions
 * are worth testing without a browser around them.
 *
 * Every one of them addresses a row by id alone, and the row may be a fixed one
 * or sit inside an option of an option set (#111) — `withContainer` finds it
 * either way. The rules that are *about* a list of rows, though, are scoped to
 * the container the row is in: see `canAddItem` and `hasFood`.
 */

export const ITEM_LIMITS = {
  /**
   * Two kilos is past any single portion of anything, and a limit has to exist:
   * these are typed by hand, and an unbounded `maxG` is how a solver ends up
   * with a kilogram of rice because that was the cheapest way to close a gap.
   */
  gramsG: { min: 0, max: 2000 },
  /** More than this in one meal and the list stops being readable. */
  count: { max: 30 },
} as const;

export const ITEM_ERROR_CODES = [
  "required",
  "notANumber",
  "gramsRange",
] as const;

export type ItemErrorCode = (typeof ITEM_ERROR_CODES)[number];

type Checked<T> = { value: T } | { error: ItemErrorCode };

/**
 * What a food looks like the moment it is added, before anyone has thought
 * about it.
 *
 * A hundred grams because that is the unit TACO publishes in, so the numbers
 * on screen are the numbers in the table until the user changes them. The
 * range is wide rather than tight: a new item that arrives already pinned
 * between 90 g and 110 g would make the first solve look broken, and widening
 * a range is a more obvious action than discovering why nothing moved.
 */
export const DEFAULT_ITEM = { quantityG: 100, minG: 0, maxG: 500 } as const;

export function newItem(food: FoodRef, id: Id, servingG?: number): DietItem {
  const quantityG =
    servingG !== undefined && servingG > 0
      ? Math.min(Math.round(servingG), ITEM_LIMITS.gramsG.max)
      : DEFAULT_ITEM.quantityG;

  return {
    id,
    food,
    quantityG,
    mandatory: false,
    minG: DEFAULT_ITEM.minG,
    maxG: Math.min(
      ITEM_LIMITS.gramsG.max,
      Math.max(DEFAULT_ITEM.maxG, quantityG * 2),
    ),
  };
}

/**
 * Whether another row fits in one container: an option if `optionId` is given,
 * otherwise the meal's own fixed rows.
 */
export function canAddItem(meal: Meal, optionId?: Id): boolean {
  return containerItems(meal, optionId).length < ITEM_LIMITS.count.max;
}

/**
 * Whether that container already points at this food — one row per food.
 *
 * Per container, not per meal, and this is the rule #111 had to loosen: the
 * predecessor's breakfast puts `doce de leite` in two different options and
 * milk in all five protein ones. Those are alternatives that will never be on
 * the same plate, so they are not the double-counting this check exists to
 * prevent — while two rows of milk *inside one option* still are.
 */
export function hasFood(meal: Meal, food: FoodRef, optionId?: Id): boolean {
  return containerItems(meal, optionId).some((item) =>
    sameFood(item.food, food),
  );
}

export function sameFood(a: FoodRef, b: FoodRef): boolean {
  if (a.source === "taco" && b.source === "taco") return a.tacoId === b.tacoId;
  if (a.source === "custom" && b.source === "custom") {
    return a.customFoodId === b.customFoodId;
  }
  return false;
}

function withMeal(
  meals: readonly Meal[],
  mealId: Id,
  change: (meal: Meal) => Meal,
): Meal[] {
  return meals.map((meal) => (meal.id === mealId ? change(meal) : meal));
}

/** Appends a row to the meal's fixed list, or to one option of one set. */
export function addItem(
  meals: readonly Meal[],
  mealId: Id,
  item: DietItem,
  optionId?: Id,
): Meal[] {
  return withMeal(meals, mealId, (meal) =>
    !canAddItem(meal, optionId) || hasFood(meal, item.food, optionId)
      ? meal
      : addToContainer(meal, optionId, item),
  );
}

export function removeItem(
  meals: readonly Meal[],
  mealId: Id,
  itemId: Id,
): Meal[] {
  return withMeal(meals, mealId, (meal) =>
    withContainer(meal, itemId, (items) =>
      items.filter((item) => item.id !== itemId),
    ),
  );
}

/**
 * The same slot, filled with a different food (#20).
 *
 * The bounds do not move. `minG`, `maxG` and `mandatory` say how much room this
 * position in the meal has — that is a fact about the meal, not about whatever
 * is currently in the slot — so after the swap the render-time solve sizes the
 * new food against the same room and the macro targets still hold. That is the
 * whole mechanism: nothing here does arithmetic.
 *
 * Refuses a food the same container already holds in another row, for
 * `addItem`'s reason: one row per food, or the solver sizes the same food twice
 * and the screen shows two portions of it.
 */
export function swapFood(
  meals: readonly Meal[],
  mealId: Id,
  itemId: Id,
  food: FoodRef,
): Meal[] {
  return withMeal(meals, mealId, (meal) =>
    withContainer(meal, itemId, (items) => {
      const clash = items.some(
        (item) => item.id !== itemId && sameFood(item.food, food),
      );
      if (clash) return [...items];

      return items.map((item) =>
        item.id === itemId ? { ...item, food } : item,
      );
    }),
  );
}

/**
 * Which group this slot draws from, or none.
 *
 * Not part of `ItemChanges` because it is not a field of the food's sizing: it
 * decides what the swap control offers, and it is cleared by passing
 * `undefined` rather than by writing one.
 */
export function setItemGroup(
  meals: readonly Meal[],
  mealId: Id,
  itemId: Id,
  substitutionGroupId: Id | undefined,
): Meal[] {
  return withMeal(meals, mealId, (meal) =>
    withContainer(meal, itemId, (items) =>
      items.map((item) => {
        if (item.id !== itemId) return item;
        if (substitutionGroupId === undefined) {
          const { substitutionGroupId: _dropped, ...rest } = item;
          return rest;
        }
        return { ...item, substitutionGroupId };
      }),
    ),
  );
}

/**
 * The fields of an item a screen may set.
 *
 * Narrower than `Partial<DietItem>` on purpose: `id` and `food` are what the
 * item *is*, and an update that could change either would be a different food
 * wearing the same row's quantity.
 */
export type ItemChanges = Partial<
  Pick<DietItem, "quantityG" | "minG" | "maxG" | "mandatory">
>;

/**
 * A field of one item, replaced.
 *
 * Bounds are kept consistent here rather than at the call sites: raising `minG`
 * past `maxG` pushes `maxG` up with it instead of producing a range no quantity
 * can satisfy. The solver would survive that — it sorts its own bounds — but
 * the user would be looking at a row that says min 200, max 150 and a portion
 * that ignores both.
 */
export function updateItem(
  meals: readonly Meal[],
  mealId: Id,
  itemId: Id,
  changes: ItemChanges,
): Meal[] {
  return withMeal(meals, mealId, (meal) =>
    withContainer(meal, itemId, (items) =>
      items.map((item) =>
        item.id === itemId ? reconcile({ ...item, ...changes }, changes) : item,
      ),
    ),
  );
}

function reconcile(item: DietItem, changes: ItemChanges): DietItem {
  // Whichever bound was just typed is the one that stays put; the other yields.
  if (changes.minG !== undefined && item.minG > item.maxG) {
    return { ...item, maxG: item.minG };
  }
  if (changes.maxG !== undefined && item.maxG < item.minG) {
    return { ...item, minG: item.maxG };
  }
  return item;
}

/**
 * A quantity in grams, as typed.
 *
 * Accepts a comma, like every other number in this app, and refuses the empty
 * box rather than reading it as zero — "0" and "" are different statements and
 * only one of them was made on purpose.
 */
export function checkGrams(raw: string): Checked<number> {
  if (raw.trim() === "") return { error: "required" };

  const value = parseDecimal(raw);
  if (value === undefined) return { error: "notANumber" };

  if (value < ITEM_LIMITS.gramsG.min || value > ITEM_LIMITS.gramsG.max) {
    return { error: "gramsRange" };
  }

  return { value: Math.round(value) };
}
