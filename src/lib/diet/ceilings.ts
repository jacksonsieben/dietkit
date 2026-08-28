import { ceilingForFood } from "@/lib/foods/portions";
import type { DietItem, Meal } from "@/lib/storage/types";

import { DEFAULT_ITEM } from "./items";
import { allItems, mapMealItems } from "./options";

/**
 * Bringing a saved plan down to the bounds a new row would get today (#D).
 *
 * `newItem` asks `ceilingFor` how much of a *kind* of food belongs in a meal,
 * so a row added this week cannot grow to 500 g of olive oil. A row added last
 * month can: it was written when 500 g was the only answer, and the ceilings
 * are a table in this app rather than anything stored, so nothing on a device
 * changed when they arrived.
 *
 * The gap is *shown* rather than closed, which is `rebase.ts`'s argument in a
 * second place: a bound is the user's instrument — it is the one number that
 * decides what the solver may do — and an app that quietly narrowed it on open
 * would be re-solving someone's plan while they read it. So this counts, the
 * screen offers, and `tightenCeilings` runs when a button is pressed.
 *
 * Pure functions over meals, for `rebase.ts`'s reason: what counts as loose,
 * and what tightening does to a row, are worth testing without a screen.
 */

/**
 * Whether this row is one nobody has had an opinion about.
 *
 * The flat 500 g is the fingerprint of "added and left alone": every other way
 * a `maxG` gets its value is somebody's decision — the user typing one on the
 * row, a stated serving raising the roof over it, an import pinning a row to
 * its own quantity — and a decision is not something to overwrite because a
 * table in this app grew an opinion afterwards.
 *
 * `minG` guards the arithmetic rather than the intent: a row someone floored at
 * 300 g cannot take a 200 g ceiling without inverting its own range, and the
 * honest answer there is to leave it and let them see it.
 */
function isLoose(item: DietItem): boolean {
  if (item.mandatory) return false;
  if (item.maxG !== DEFAULT_ITEM.maxG) return false;

  const ceiling = ceilingForFood(item.food);
  return ceiling !== undefined && ceiling < item.maxG && item.minG <= ceiling;
}

/**
 * How many rows across the plan are still at the flat default.
 *
 * A count rather than a list, because the offer is one action over the whole
 * plan — a per-row prompt would be the "too many buttons" this screen is trying
 * to shed, and the rows themselves already show their bounds.
 *
 * `allItems` rather than `effectiveItems`: a row parked in an option nobody
 * selected is still a row that will solve one day, and leaving it behind would
 * make the count go up again the next time the choice is switched.
 */
export function looseCeilings(meals: readonly Meal[]): number {
  return meals.reduce(
    (total, meal) => total + allItems(meal).filter(isLoose).length,
    0,
  );
}

/**
 * The plan with those rows brought down to their group's ceiling.
 *
 * Only `maxG` moves. The quantities are left where they are because they are
 * not the user's either — the screen re-solves on every render and the save
 * writes what the solve produced (`applySolution`), so a row whose roof just
 * came down to 60 g is drawn at 60 g or less before anything is written, by the
 * same path that would have drawn it had the row been added today.
 *
 * Nothing is saved here, exactly as in `rebasePlan`: this returns the plan the
 * screen should show, and a tightening someone looked at and backed out of
 * should leave no trace.
 */
export function tightenCeilings(meals: readonly Meal[]): Meal[] {
  return meals.map((meal) =>
    mapMealItems(meal, (items) =>
      items.map((item) =>
        isLoose(item)
          ? { ...item, maxG: ceilingForFood(item.food) ?? item.maxG }
          : item,
      ),
    ),
  );
}
