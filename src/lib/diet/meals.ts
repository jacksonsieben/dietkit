import { parseDecimal } from "@/lib/profile/validation";
import type { Id, Meal } from "@/lib/storage/types";

/**
 * The shape of a day: how many meals there are, what they are called, what
 * order they come in, and how much of the day each one carries (#18).
 *
 * The predecessor hardcoded four meals and split the targets evenly between
 * them, which is two separate assumptions about how a person eats. Neither
 * survives contact with a real plan: some people eat twice, some eat six times,
 * and almost nobody eats a quarter of their day at breakfast. So the count is a
 * list the user edits and the split is a number per meal.
 *
 * Everything here is a pure function over `readonly Meal[]` returning a new
 * array — no ids minted, no clock read, no store touched — because the part
 * worth testing is what happens to the *other* meals' shares when one is added,
 * removed or changed, and that should be observable without a browser.
 */

export const MEAL_LIMITS = {
  /**
   * A floor of one because a plan with no meals is not a plan, and a ceiling
   * because the screen draws a row per meal and the shares are typed by hand:
   * past a dozen, editing one of them is worse than useless. The ceiling is a
   * limit of this UI, not a claim about nutrition.
   */
  count: { min: 1, max: 12 },
  nameLength: { min: 1, max: 40 },
  /** Shares are typed as percentages, which is the only place they are not fractions. */
  sharePercent: { min: 0, max: 100 },
} as const;

export const MEAL_ERROR_CODES = [
  "required",
  "notANumber",
  "nameLength",
  "shareRange",
] as const;

export type MealErrorCode = (typeof MEAL_ERROR_CODES)[number];

/**
 * Shares that add up to one, whatever came in.
 *
 * Called at the top of every operation below rather than trusted from the
 * store, and the reason is `Meal.share`'s: this data comes off a device and
 * through a JSON import a user can edit by hand. Shares that add to 0,8 would
 * otherwise mean a day of meals that quietly feeds four fifths of the target —
 * a plan that is wrong by a fifth and looks entirely normal on screen.
 *
 * All-zero (or garbage) shares fall back to an even split rather than to
 * NaN: even is a starting point someone can then argue with, which is more
 * than can be said for a table of dashes.
 */
export function normalizeShares(meals: readonly Meal[]): Meal[] {
  const usable = meals.map((meal) =>
    Number.isFinite(meal.share) && meal.share > 0 ? meal.share : 0,
  );
  const total = usable.reduce((sum, share) => sum + share, 0);

  if (total <= 0) return evenShares(meals);

  return meals.map((meal, index) => ({
    ...meal,
    share: usable[index] / total,
  }));
}

/** Every meal carrying the same fraction — the split the predecessor forced. */
export function evenShares(meals: readonly Meal[]): Meal[] {
  if (meals.length === 0) return [];
  return meals.map((meal) => ({ ...meal, share: 1 / meals.length }));
}

/** Whether another row would fit, so a button can be disabled rather than lie. */
export function canAddMeal(meals: readonly Meal[]): boolean {
  return meals.length < MEAL_LIMITS.count.max;
}

export function canRemoveMeal(meals: readonly Meal[]): boolean {
  return meals.length > MEAL_LIMITS.count.min;
}

/**
 * Appends a meal, which necessarily takes room from the ones already there.
 *
 * The newcomer gets the average share and the rest are scaled down in
 * proportion, so a plan someone has already tuned — a big lunch, a small
 * afternoon snack — keeps its shape instead of being flattened by the arrival
 * of a sixth meal. The alternative, giving the new row 0%, reads as a bug: an
 * added meal that is allotted nothing looks like an add that did not work.
 */
export function addMeal(meals: readonly Meal[], meal: Meal): Meal[] {
  if (!canAddMeal(meals)) return [...meals];

  const room = meals.length / (meals.length + 1);
  const existing = normalizeShares(meals).map((current) => ({
    ...current,
    share: current.share * room,
  }));

  return [...existing, { ...meal, share: 1 - room }];
}

/**
 * Drops a meal and hands its share back to the survivors, in proportion.
 *
 * Refuses to empty the plan — the button is disabled at one meal, and this is
 * the same rule stated where it can be tested rather than only in the markup.
 */
export function removeMeal(meals: readonly Meal[], id: Id): Meal[] {
  if (!canRemoveMeal(meals)) return [...meals];

  const kept = meals.filter((meal) => meal.id !== id);
  if (kept.length === meals.length) return [...meals];

  // Normalising *is* the redistribution: the remaining shares still hold their
  // ratios to one another, and dividing by their new total is exactly "share
  // out what the deleted meal was carrying".
  return normalizeShares(kept);
}

export function renameMeal(
  meals: readonly Meal[],
  id: Id,
  name: string,
): Meal[] {
  return meals.map((meal) => (meal.id === id ? { ...meal, name } : meal));
}

/**
 * Moves a meal one place up or down the day.
 *
 * Two buttons rather than drag-and-drop, and not to save a dependency: dragging
 * is the interaction that works worst for the people most likely to be
 * reordering a plan on a phone in a kitchen, and it is invisible to a keyboard
 * and to a screen reader unless it is rebuilt with buttons anyway. At the ends
 * of the list this returns the list unchanged, so the caller can render the
 * button as disabled and be describing the truth.
 */
export function moveMeal(
  meals: readonly Meal[],
  id: Id,
  offset: number,
): Meal[] {
  const from = meals.findIndex((meal) => meal.id === id);
  const to = from + offset;

  if (from < 0 || to < 0 || to >= meals.length) return [...meals];

  const moved = [...meals];
  [moved[from], moved[to]] = [moved[to], moved[from]];
  return moved;
}

/**
 * Sets one meal's share and absorbs the difference into the others.
 *
 * This is the operation the issue is really asking for — "adjustable per meal,
 * not forced to be even" — and the interesting half is the word *absorbs*. A
 * screen where each share is edited independently is a screen that spends most
 * of its life not adding up to 100%, leaving the user to do the arithmetic the
 * app exists to do. So the meal being edited gets exactly what was asked for,
 * and the remaining room is divided among the rest in the ratios they already
 * had: pushing lunch up pushes everything else down evenly in relative terms,
 * and nothing else on screen jumps around.
 *
 * When the others are all at zero there are no ratios to preserve, so the room
 * is split evenly among them. With a single meal the answer is always the whole
 * day, whatever was typed.
 */
export function setShare(
  meals: readonly Meal[],
  id: Id,
  share: number,
): Meal[] {
  const wanted = clampShare(share);
  const others = meals.filter((meal) => meal.id !== id);

  if (others.length === 0) {
    return meals.map((meal) => ({ ...meal, share: 1 }));
  }

  const normalized = normalizeShares(meals);
  const rest = normalized
    .filter((meal) => meal.id !== id)
    .reduce((sum, meal) => sum + meal.share, 0);

  const room = 1 - wanted;

  return normalized.map((meal) => {
    if (meal.id === id) return { ...meal, share: wanted };
    return {
      ...meal,
      share: rest > 0 ? (meal.share / rest) * room : room / others.length,
    };
  });
}

function clampShare(share: number): number {
  if (!Number.isFinite(share)) return 0;
  return Math.min(1, Math.max(0, share));
}

/**
 * A starting structure from names the caller supplies.
 *
 * The names come from the message catalogue and the ids from the caller,
 * because this module is not allowed to know Portuguese or to read a clock.
 */
export function mealsFromNames(
  entries: readonly { id: Id; name: string }[],
): Meal[] {
  return evenShares(
    entries.map((entry) => ({ ...entry, share: 0, items: [] })),
  );
}

type Checked<T> = { value: T } | { error: MealErrorCode };

/** Names are trimmed before they are judged, so " " is empty rather than length 1. */
export function checkMealName(raw: string): Checked<string> {
  const name = raw.trim();

  if (name === "") return { error: "required" };
  if (name.length > MEAL_LIMITS.nameLength.max) return { error: "nameLength" };

  return { value: name };
}

/**
 * A typed percentage as a fraction of the day.
 *
 * Zero is allowed on purpose: a meal someone is skipping this week is worth
 * keeping in the plan at 0% rather than deleting and rebuilding, and the
 * fallback in `normalizeShares` covers the degenerate case where every meal
 * ends up there.
 */
export function checkSharePercent(raw: string): Checked<number> {
  if (raw.trim() === "") return { error: "required" };

  // `parseDecimal` rather than `Number`, so "12,5" is a number here for the
  // same reason it is on every other form in this app: it is how the comma is
  // written in the language this ships in.
  const percent = parseDecimal(raw);
  if (percent === undefined) return { error: "notANumber" };
  if (
    percent < MEAL_LIMITS.sharePercent.min ||
    percent > MEAL_LIMITS.sharePercent.max
  ) {
    return { error: "shareRange" };
  }

  return { value: percent / 100 };
}
