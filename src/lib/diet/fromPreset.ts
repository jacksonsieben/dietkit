import type { PresetItemRow, PresetMealRow, PresetRow } from "@/lib/db/presets";
import type { FoodSearchResult } from "@/lib/db/foods";
import type {
  Diet,
  DietItem,
  DietOption,
  FoodComposition,
  Id,
  IsoTimestamp,
  MacroSet,
  Meal,
  OptionSet,
  SubstitutionGroup,
} from "@/lib/storage/types";

import {
  buildFoodBook,
  compositionFromResult,
  usedTacoFoods,
} from "./composition";
import { sharePercents } from "./distribute";
import { ITEM_LIMITS } from "./items";
import { newPlan } from "./plan";
import { applySolution, solvePlan } from "./solve";

/**
 * A published preset, copied into a plan of the user's own (#114).
 *
 * The copy is the whole design. A preset is a starting shape and never a live
 * link: nothing re-reads it, nothing updates a plan when it changes, and no
 * record produced here carries its slug. What comes out is an ordinary `Diet`
 * and ordinary `SubstitutionGroup`s, indistinguishable from ones typed by hand,
 * because from the moment they are written they are the user's — editing a meal
 * or deleting a group is not "diverging from the preset", it is just editing.
 *
 * What the preset does *not* bring is the one thing it must not: kilocalories.
 * A preset ships shares, foods and bounds. `targets` and `basedOnWeightKg`
 * arrive from the caller, computed from this person's profile and their latest
 * logged weight the way they are for any other new plan (#14, #15, #25), and
 * the copy is solved against them before it is shown. Two people starting from
 * the same preset get different grams, which is the point.
 *
 * Pure. Nothing here fetches, writes, reads a clock or mints an id of its own —
 * `store.ts` does the first two and the caller supplies the rest.
 */

export interface PresetCopyOptions {
  readonly preset: PresetRow;
  /**
   * The compositions the catalogue shipped alongside the preset, which is why
   * the route sends them: a plan has to add up on a device with no signal, and
   * a copy that had to fetch its own grams afterwards would be a plan that
   * arrives unusable on exactly the connection that made someone want it.
   */
  readonly foods: readonly FoodSearchResult[];
  /** The plan's name. Localised, so it arrives from the screen. */
  readonly name: string;
  /** This person's own daily targets. Never the preset's — it has none. */
  readonly targets: MacroSet;
  readonly basedOnWeightKg: number;
  readonly now: IsoTimestamp;
  readonly newId: () => Id;
}

export interface PresetCopy {
  readonly diet: Diet;
  /**
   * The preset's groups as records the user owns (#20), written before the
   * plan: the items point at them by id, and a group that is not there yet is
   * a slot with nothing behind it.
   */
  readonly groups: readonly SubstitutionGroup[];
}

/**
 * Thrown when an option set arrives with no default.
 *
 * The database can refuse a set with *two* defaults — `diet_preset_options`
 * carries a partial unique index — and cannot refuse one with none, so this is
 * the place that has to. `OptionSet.selectedId` is not optional and there is no
 * honest value for it here: picking the first option would be this file
 * choosing somebody's breakfast, and a plan is not the place to guess.
 *
 * Names the set, because the only fix is in the authored preset.
 */
export class PresetWithoutDefault extends Error {
  constructor(readonly setName: string) {
    super(`O conjunto de opções "${setName}" não tem opção padrão.`);
    this.name = "PresetWithoutDefault";
  }
}

export function copyPreset({
  preset,
  foods,
  name,
  targets,
  basedOnWeightKg,
  now,
  newId,
}: PresetCopyOptions): PresetCopy {
  // Every row the payload could resolve, by TACO id. A row TACO withheld the
  // macros of is deliberately absent rather than zeroed — `compositionFromResult`
  // says why — and the item that points at it lands in the plan as the
  // unresolved row the plan screen already knows how to show.
  const known = new Map<number, FoodComposition>();
  for (const result of foods) {
    const composition = compositionFromResult(result);
    if (composition) known.set(composition.tacoId, composition);
  }

  const quote = (ids: Iterable<number>): FoodComposition[] =>
    [...new Set(ids)].flatMap((id) => {
      const composition = known.get(id);
      return composition === undefined ? [] : [composition];
    });

  const groups: SubstitutionGroup[] = preset.groups.map((group) => {
    const tacoFoods = quote(group.foodIds);

    return {
      id: newId(),
      name: group.name,
      foods: group.foodIds.map((tacoId) => ({
        source: "taco" as const,
        tacoId,
      })),
      ...(tacoFoods.length === 0 ? {} : { tacoFoods }),
      createdAt: now,
      updatedAt: now,
    };
  });

  // Slug in, uuid out. The slug is how the preset says "this row draws from
  // that list"; it is meaningless on the device and nothing keeps it.
  const groupIds = new Map<string, Id>(
    preset.groups.map((group, index) => [group.slug, groups[index]!.id]),
  );

  const meals = preset.meals.map((meal) => copyMeal(meal, groupIds, newId));

  // Walks the unselected options too, on `usedTacoFoods`' terms: they are by
  // definition the foods the plan is not using, so their numbers are nowhere
  // else on the device and switching option would otherwise need a network.
  const tacoFoods = usedTacoFoods(meals, [...known.values()]);

  /**
   * Solved here rather than by the screen, so that what is written is already
   * a plan sized for this person (#114). The grams the preset authored are a
   * starting point for the optimiser and not the portions anybody eats: they
   * were written against no particular body, and leaving them in the store
   * would mean a plan that is wrong until the user happens to press
   * *Recalcular*. Mandatory rows do not move -- `minG === maxG` is a column
   * the solver cannot touch -- which is how the teaspoon of oil stays a
   * teaspoon of oil (#19).
   */
  const solved = applySolution(
    meals,
    solvePlan(targets, meals, buildFoodBook(tacoFoods)),
  );

  const diet: Diet = {
    ...newPlan({ id: newId(), name }, solved, targets, basedOnWeightKg, now),
    ...(tacoFoods.length === 0 ? {} : { tacoFoods }),
  };

  return { diet, groups };
}

function copyMeal(
  meal: PresetMealRow,
  groupIds: ReadonlyMap<string, Id>,
  newId: () => Id,
): Meal {
  const optionSets: OptionSet[] = meal.optionSets.map((set) => {
    const options: DietOption[] = set.options.map((option) => ({
      id: newId(),
      name: option.name,
      items: option.items.map((item) => copyItem(item, groupIds, newId)),
    }));

    const chosen = set.options.findIndex((option) => option.isDefault);
    if (chosen === -1) throw new PresetWithoutDefault(set.name);

    return {
      id: newId(),
      name: set.name,
      options,
      selectedId: options[chosen]!.id,
    };
  });

  return {
    id: newId(),
    name: meal.name,
    share: meal.share,
    items: meal.items.map((item) => copyItem(item, groupIds, newId)),
    ...(optionSets.length === 0 ? {} : { optionSets }),
  };
}

/**
 * One preset row as a `DietItem`.
 *
 * The bounds are the preset's, because they are the part of it worth having:
 * "between 80 g and 200 g of rice" is the author saying what the meal can
 * absorb, and it is what the solver optimises within (#19). They are held to
 * `ITEM_LIMITS.gramsG` anyway — these numbers arrive over a network, and an
 * unbounded `maxG` is exactly how a solve ends up with a kilogram of rice.
 */
function copyItem(
  row: PresetItemRow,
  groupIds: ReadonlyMap<string, Id>,
  newId: () => Id,
): DietItem {
  const groupId =
    row.groupSlug === null ? undefined : groupIds.get(row.groupSlug);

  return {
    id: newId(),
    food: { source: "taco", tacoId: row.foodId },
    quantityG: grams(row.quantityG),
    mandatory: row.mandatory,
    minG: grams(row.minG),
    maxG: grams(row.maxG),
    ...(groupId === undefined ? {} : { substitutionGroupId: groupId }),
  };
}

function grams(value: number): number {
  const { min, max } = ITEM_LIMITS.gramsG;
  return Math.min(max, Math.max(min, value));
}

/**
 * What a preset looks like, in the four numbers somebody choosing between two
 * of them actually needs (#114).
 *
 * A name and a paragraph are not enough to choose with: the difference between
 * these presets is how the day is cut up, how much of it is a decision left to
 * the reader, and how many foods it asks somebody to keep in the house. All
 * four are counted from the preset itself rather than written by hand beside
 * it, so a preset edited in `src/lib/diet/presets.ts` cannot end up described
 * as something it stopped being.
 */
export interface PresetShape {
  /** Each meal with its slice of the day, as whole percents adding to 100. */
  readonly meals: readonly {
    readonly name: string;
    readonly percent: number;
  }[];
  /** Option sets: the places the preset offers a choice rather than a food. */
  readonly choices: number;
  /** Substitution groups: the places it offers a swap. */
  readonly swaps: number;
  /** Distinct foods it can reach, unselected options and swaps included. */
  readonly foods: number;
}

export function presetShape(preset: PresetRow): PresetShape {
  // Through `sharePercents` rather than `Math.round(share * 100)`, so that four
  // meals of a seventh each still print as 100 and not as 99: the apportioning
  // is already written and already tested (`./distribute.ts`). It reads meals
  // for their shares alone, which is why a row with no items satisfies it.
  const percents = sharePercents(
    preset.meals.map((meal) => ({
      id: "",
      name: meal.name,
      share: meal.share,
      items: [],
    })),
  );

  const foods = new Set<number>();
  for (const group of preset.groups) {
    for (const id of group.foodIds) foods.add(id);
  }
  for (const meal of preset.meals) {
    for (const item of meal.items) foods.add(item.foodId);
    for (const set of meal.optionSets) {
      for (const option of set.options) {
        for (const item of option.items) foods.add(item.foodId);
      }
    }
  }

  return {
    meals: preset.meals.map((meal, index) => ({
      name: meal.name,
      percent: percents[index] ?? 0,
    })),
    choices: preset.meals.reduce(
      (total, meal) => total + meal.optionSets.length,
      0,
    ),
    swaps: preset.groups.length,
    foods: foods.size,
  };
}
