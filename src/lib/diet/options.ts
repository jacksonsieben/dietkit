import type {
  DietItem,
  DietOption,
  FoodRef,
  Id,
  Meal,
  OptionSet,
} from "@/lib/storage/types";

/**
 * Meals that offer a choice, where the choice is a set of rows (#111).
 *
 * The predecessor's breakfast was not a food with alternatives, it was four
 * ways of making breakfast: `pão + fruta + doce de leite`, `aveia + fruta +
 * pasta de amendoim`, `tapioca + ovo`, and so on. Substitution groups (#20)
 * cannot express that, and no amount of grouping can: a group swaps one food
 * inside one row, and these differ in which rows exist at all.
 *
 * So a meal carries `optionSets`, each of which is one decision with two or
 * more answers, exactly one of them selected. What the meal *is*, on the day,
 * is `effectiveItems`: its own fixed rows plus the selected option of every
 * set. Everything that adds a meal up goes through that function, which is why
 * it is the first thing in this file — the solver, `/hoje`, the totals and the
 * export must never disagree about what is on the plate.
 *
 * The unselected options are still plan data. They are saved, backed up,
 * synced, and their foods keep a snapshot in `Diet.tacoFoods`, so switching
 * option works on a phone with no signal. They are simply not counted.
 *
 * Pure functions over `readonly Meal[]`, like `meals.ts` and `items.ts`: the
 * rules worth testing here are what happens to a *selection* when the option it
 * points at is deleted, and that should be observable without a browser.
 */

export const OPTION_LIMITS = {
  /**
   * One decision per meal (#H).
   *
   * It was six, and two of them at once is a real thing the predecessor did:
   * a carbohydrate choice and a protein choice inside the same breakfast. What
   * that costs on screen is the word *conjunto* — a meal with two decisions has
   * to name them, and naming the question is the step where a person stops and
   * asks what the app wants from them. At one, the screen can say "versões
   * desta refeição" and nothing needs a name at all.
   *
   * Meals written before this, or imported from a plan someone edited by hand,
   * may hold more; every function here still walks all of them. The ceiling
   * only stops a second one being made.
   */
  sets: { max: 1 },
  /**
   * A set with one option is not a choice, so deleting the second-to-last
   * version folds the survivor back into the meal and the set goes away. The
   * ceiling is how many chips a phone can show before the row stops being
   * readable.
   */
  options: { min: 2, max: 12 },
  /** No minimum: an unnamed version is named after what is in it. */
  nameLength: { max: 40 },
} as const;

export const OPTION_ERROR_CODES = ["nameLength"] as const;

export type OptionErrorCode = (typeof OPTION_ERROR_CODES)[number];

/** Never undefined, so callers can iterate a meal written before #111. */
export function optionSetsOf(meal: Meal): readonly OptionSet[] {
  return meal.optionSets ?? [];
}

/**
 * The foods a version is named after when nobody has named it (#H).
 *
 * Two, in plan order: *Pão + ovo* is a version somebody recognises across a
 * row of chips, and a third food would not make it more recognisable — only
 * longer than the chip. Refs come back rather than names because this module
 * speaks no Portuguese and cannot tell a custom food from a TACO one; the
 * screen holds the book and resolves them.
 *
 * Derived on every render rather than written into `name` when the second food
 * is added: a stored name is a promise to keep it up to date, and a version
 * called "Pão + ovo" whose bread was swapped for tapioca an hour later is worse
 * than no name. The typed name still wins wherever there is one.
 */
export function optionSignature(option: DietOption): readonly FoodRef[] {
  return option.items.slice(0, 2).map((item) => item.food);
}

/**
 * The option that counts, or nothing if the set has none.
 *
 * Falls back to the first option when `selectedId` names one that is not there.
 * That should not happen — every operation below keeps the selection pointing
 * at something — but this data arrives from a JSON import a person can edit by
 * hand, and a set that silently contributes nothing is a meal that is quietly
 * short of a third of its calories. Showing the first option is wrong in a way
 * somebody can see and fix.
 */
export function selectedOption(set: OptionSet): DietOption | undefined {
  return (
    set.options.find((option) => option.id === set.selectedId) ?? set.options[0]
  );
}

/**
 * What the meal actually contributes: fixed rows, then each set's selection.
 *
 * The single definition of "on the plate". Order matters only for the screen —
 * the fixed rows first, then the sets in the order they were added — but it is
 * fixed here so the plan, the summary and the export list a meal the same way.
 */
export function effectiveItems(meal: Meal): DietItem[] {
  const chosen = optionSetsOf(meal).flatMap(
    (set) => selectedOption(set)?.items ?? [],
  );

  return [...meal.items, ...chosen];
}

/**
 * Every row the meal holds, selected or not.
 *
 * For the two jobs that are about the plan rather than about today: keeping a
 * TACO snapshot of foods the device may need offline, and counting rows against
 * a limit. Nothing that computes a macro may use this.
 */
export function allItems(meal: Meal): DietItem[] {
  const everything = optionSetsOf(meal).flatMap((set) =>
    set.options.flatMap((option) => option.items),
  );

  return [...meal.items, ...everything];
}

/**
 * Whether a plan holds no food at all.
 *
 * The question the screen asks before offering somewhere to start from, and it
 * is asked here rather than there because the answer needs `allItems`, which
 * the planner is forbidden to touch: everything on that screen is priced, and a
 * row priced from the unselected options would print a portion the solver never
 * chose. Counting is the one job `allItems` exists for, so the count happens on
 * this side of the line and the screen receives a yes or a no.
 *
 * `allItems` rather than `effectiveItems` for the same reason the limit uses
 * it: a food parked in an option nobody selected is still someone's evening's
 * work, and a plan holding one is not blank.
 */
export function isBlankPlan(meals: readonly Meal[]): boolean {
  return meals.every((meal) => allItems(meal).length === 0);
}

/**
 * The rows of one container: an option if `optionId` is given, else the meal's
 * own fixed rows.
 *
 * "Container" is the word for the thing an item belongs to, and it is the scope
 * of every rule about items — the row limit, and one-row-per-food. Both are
 * per-container on purpose: `doce de leite` appears in two different breakfast
 * options and milk in all five protein options, and a meal-wide uniqueness
 * check would refuse to let the second one be written.
 */
export function containerItems(meal: Meal, optionId?: Id): readonly DietItem[] {
  if (optionId === undefined) return meal.items;

  for (const set of optionSetsOf(meal)) {
    const option = set.options.find((candidate) => candidate.id === optionId);
    if (option) return option.items;
  }

  return [];
}

/**
 * The rows that share a container with `itemId`, itself included.
 *
 * What "the other rows in this list" means once a meal has options: the rows a
 * swap could clash with, and nothing else. An empty list if no container holds
 * the id.
 */
export function siblingItems(meal: Meal, itemId: Id): readonly DietItem[] {
  if (meal.items.some((item) => item.id === itemId)) return meal.items;

  for (const set of optionSetsOf(meal)) {
    for (const option of set.options) {
      if (option.items.some((item) => item.id === itemId)) return option.items;
    }
  }

  return [];
}

/**
 * Applies a change to whichever container holds `itemId`, and only that one.
 *
 * This is what lets `items.ts` keep its signatures. Item ids are UUIDs and
 * unique across the plan, so "the item with this id" is an unambiguous address
 * whether the row is fixed or sits inside the third option of the second set,
 * and a screen that edits a row does not have to know which.
 */
export function withContainer(
  meal: Meal,
  itemId: Id,
  change: (items: readonly DietItem[]) => DietItem[],
): Meal {
  if (meal.items.some((item) => item.id === itemId)) {
    return { ...meal, items: change(meal.items) };
  }

  const sets = meal.optionSets;
  if (!sets) return meal;

  return {
    ...meal,
    optionSets: sets.map((set) => ({
      ...set,
      options: set.options.map((option) =>
        option.items.some((item) => item.id === itemId)
          ? { ...option, items: change(option.items) }
          : option,
      ),
    })),
  };
}

/**
 * Rewrites every row in the meal, wherever it lives.
 *
 * For the operations that are about rows rather than about today: writing
 * solved quantities back, rebasing on a new weight. The change is handed each
 * container's list separately so it can still reason about neighbours, and a
 * row it does not recognise must come back untouched — which is how the
 * unselected options survive a solve that never looked at them.
 */
export function mapMealItems(
  meal: Meal,
  change: (items: readonly DietItem[]) => DietItem[],
): Meal {
  const items = change(meal.items);
  const sets = meal.optionSets;

  if (sets === undefined) return { ...meal, items };

  return {
    ...meal,
    items,
    optionSets: sets.map((set) => ({
      ...set,
      options: set.options.map((option) => ({
        ...option,
        items: change(option.items),
      })),
    })),
  };
}

/** Appends a row to one container. Says nothing about whether it should be. */
export function addToContainer(
  meal: Meal,
  optionId: Id | undefined,
  item: DietItem,
): Meal {
  if (optionId === undefined) return { ...meal, items: [...meal.items, item] };

  return withOption(meal, optionId, (option) => ({
    ...option,
    items: [...option.items, item],
  }));
}

function withOption(
  meal: Meal,
  optionId: Id,
  change: (option: DietOption) => DietOption,
): Meal {
  const sets = meal.optionSets;
  if (!sets) return meal;

  return {
    ...meal,
    optionSets: sets.map((set) => ({
      ...set,
      options: set.options.map((option) =>
        option.id === optionId ? change(option) : option,
      ),
    })),
  };
}

function withMeal(
  meals: readonly Meal[],
  mealId: Id,
  change: (meal: Meal) => Meal,
): Meal[] {
  return meals.map((meal) => (meal.id === mealId ? change(meal) : meal));
}

function withSet(
  meals: readonly Meal[],
  mealId: Id,
  setId: Id,
  change: (set: OptionSet) => OptionSet,
): Meal[] {
  return withMeal(meals, mealId, (meal) => ({
    ...meal,
    optionSets: optionSetsOf(meal).map((set) =>
      set.id === setId ? change(set) : set,
    ),
  }));
}

export function canAddSet(meal: Meal): boolean {
  return optionSetsOf(meal).length < OPTION_LIMITS.sets.max;
}

export function canAddOption(set: OptionSet): boolean {
  return set.options.length < OPTION_LIMITS.options.max;
}

/**
 * Whether deleting this version would leave a choice behind.
 *
 * False at two, where deleting one does not shorten the list — it ends the
 * question. The screen uses this to say which of the two things the same button
 * is about to do, and `removeOption` does the folding either way.
 */
export function endsTheChoice(set: OptionSet): boolean {
  return set.options.length <= OPTION_LIMITS.options.min;
}

/**
 * Turns the meal someone has already built into its own first version (#H).
 *
 * The old entry point made an empty set with two empty options, which asked a
 * person to understand the idea before they had anything to apply it to. This
 * one is only offered on a meal that already has food: what it does is say
 * "what you have is version A", and open an empty B beside it. The meal's fixed
 * rows move wholesale — after this the meal itself holds nothing, and what is
 * on the plate is whichever version is selected.
 *
 * Ids come from the caller for `mealsFromNames`' reason: this module reads no
 * clock and generates no randomness. Names do not come at all — both versions
 * start unnamed and are read from their contents.
 */
export function startOptions(
  meals: readonly Meal[],
  mealId: Id,
  ids: { set: Id; first: Id; second: Id },
): Meal[] {
  return withMeal(meals, mealId, (meal) => {
    if (!canAddSet(meal)) return meal;

    const options: DietOption[] = [
      { id: ids.first, name: "", items: meal.items },
      { id: ids.second, name: "", items: [] },
    ];

    return {
      ...meal,
      items: [],
      optionSets: [
        ...optionSetsOf(meal),
        { id: ids.set, name: "", selectedId: ids.first, options },
      ],
    };
  });
}

/**
 * Back to a meal with no `optionSets` key at all, rather than an empty array.
 *
 * So that removing the last set leaves exactly the record a meal that never had
 * one has. Otherwise two plans that are the same plan compare, hash and sync as
 * different ones.
 */
function dropSets(meal: Meal): Meal {
  const { optionSets: _dropped, ...rest } = meal;
  return rest;
}

export function addOption(
  meals: readonly Meal[],
  mealId: Id,
  setId: Id,
  option: DietOption,
): Meal[] {
  return withSet(meals, mealId, setId, (set) =>
    canAddOption(set) ? { ...set, options: [...set.options, option] } : set,
  );
}

/**
 * Deletes one version — and, if that leaves only one, unwraps it (#H).
 *
 * Refusing was the old answer, with a sentence under a disabled button
 * explaining that a choice needs two answers. True, and useless: the person
 * deleting the second-to-last version is not asking to break the rule, they are
 * saying they no longer want a choice here. So the survivor's rows become the
 * meal's own rows and the set disappears, which is exactly what the meal looked
 * like before `startOptions` was ever pressed.
 *
 * That is a promotion, and the old code refused to promote — it would "silently
 * make a choice permanent". It is not silent any more: the screen names the
 * version it is about to delete and says the other one becomes the meal.
 *
 * When more than two remain, the selection lands on the first survivor rather
 * than on nothing: a set whose `selectedId` points at a deleted option is a
 * meal that contributes no food and looks fine.
 */
export function removeOption(
  meals: readonly Meal[],
  mealId: Id,
  setId: Id,
  optionId: Id,
): Meal[] {
  return withMeal(meals, mealId, (meal) => {
    const sets = optionSetsOf(meal);
    const set = sets.find((candidate) => candidate.id === setId);
    if (set === undefined) return meal;

    const options = set.options.filter((option) => option.id !== optionId);
    if (options.length === set.options.length) return meal;

    if (options.length < OPTION_LIMITS.options.min) {
      const kept = sets.filter((candidate) => candidate.id !== setId);
      const unwrapped: Meal = {
        ...meal,
        items: [...meal.items, ...(options[0]?.items ?? [])],
        optionSets: kept,
      };

      return kept.length === 0 ? dropSets(unwrapped) : unwrapped;
    }

    return {
      ...meal,
      optionSets: sets.map((candidate) =>
        candidate.id === setId
          ? {
              ...set,
              options,
              selectedId:
                set.selectedId === optionId ? options[0].id : set.selectedId,
            }
          : candidate,
      ),
    };
  });
}

export function renameOption(
  meals: readonly Meal[],
  mealId: Id,
  setId: Id,
  optionId: Id,
  name: string,
): Meal[] {
  return withSet(meals, mealId, setId, (set) => ({
    ...set,
    options: set.options.map((option) =>
      option.id === optionId ? { ...option, name } : option,
    ),
  }));
}

/**
 * The one write that changes what the person is eating today.
 *
 * Refuses an id the set does not hold, rather than storing it and falling back
 * at read time: a selection nobody can see is a bug that survives a save.
 */
export function selectOption(
  meals: readonly Meal[],
  mealId: Id,
  setId: Id,
  optionId: Id,
): Meal[] {
  return withSet(meals, mealId, setId, (set) =>
    set.options.some((option) => option.id === optionId)
      ? { ...set, selectedId: optionId }
      : set,
  );
}

type Checked<T> = { value: T } | { error: OptionErrorCode };

/**
 * Trimmed before it is judged, like every other name in this app.
 *
 * An empty name is a value here and not an error (#H). A version is named after
 * the food in it unless somebody says otherwise, so an empty box is the normal
 * state and the only thing left to be wrong is a name longer than the chip.
 */
export function checkOptionName(raw: string): Checked<string> {
  const name = raw.trim();

  if (name.length > OPTION_LIMITS.nameLength.max)
    return { error: "nameLength" };

  return { value: name };
}

/**
 * The first thing wrong with a meal's version names, if anything is.
 *
 * One code rather than a map of them: unlike the meal list, where every row has
 * a name box that can be wrong on its own, only one version is open for
 * renaming at a time and the screen prints the reason under that box.
 */
export function checkMealOptions(meal: Meal): OptionErrorCode | undefined {
  for (const set of optionSetsOf(meal)) {
    const name = checkOptionName(set.name);
    if ("error" in name) return name.error;

    for (const option of set.options) {
      const optionName = checkOptionName(option.name);
      if ("error" in optionName) return optionName.error;
    }
  }

  return undefined;
}

/**
 * Set and option names as they will be stored: trimmed, like every other name
 * in this app.
 *
 * On save rather than on every keystroke, because trimming as someone types
 * eats the space they are about to put a second word after.
 */
export function trimOptionNames(meal: Meal): Meal {
  const sets = optionSetsOf(meal);
  if (sets.length === 0) return meal;

  return {
    ...meal,
    optionSets: sets.map((set) => ({
      ...set,
      name: set.name.trim(),
      options: set.options.map((option) => ({
        ...option,
        name: option.name.trim(),
      })),
    })),
  };
}
