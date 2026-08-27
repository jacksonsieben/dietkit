import { asc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { foodsByIds, type FoodSearchResult } from "./foods";
import {
  dietPresetGroupFoods,
  dietPresetGroups,
  dietPresetItems,
  dietPresetMeals,
  dietPresetOptionSets,
  dietPresetOptions,
  dietPresets,
} from "./schema";

/**
 * The whole published preset catalogue, in one read (#114).
 *
 * Everything a device needs to copy a preset into a diet and then solve it
 * without asking again: the presets, their meals, option sets, options, items
 * and groups, and the TACO rows those items point at. `Diet.tacoFoods` exists
 * for exactly this — a plan carries the compositions it was built from, so the
 * copy keeps working on a phone that never reaches this route a second time.
 *
 * Takes the database as an argument for `./foods.ts`'s reason: `db()` is
 * `server-only`, and the test hands these functions a real Postgres running the
 * checked-in migrations. Reference data in both directions — the request
 * carries nothing at all, not even a preset to name, and the answer is the same
 * for everybody (docs/DECISIONS.md § D23).
 *
 * The serial ids never leave this file. Meals, sets, options and groups are
 * correlated here and published by position or by slug, because the id belongs
 * to this database and the copy belongs to the device: a diet holding
 * `option_id = 47` would be a diet with a back-reference into a table it is not
 * allowed to depend on, and #114 is explicit that the copy is detached from the
 * moment it is made.
 */

type Database = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

/** One row of a meal or of an option, as the local `DietItem` will hold it. */
export interface PresetItemRow {
  readonly foodId: number;
  readonly quantityG: number;
  /** Credited against the meal target before the solve, not optimised (P2). */
  readonly mandatory: boolean;
  readonly minG: number;
  readonly maxG: number;
  /**
   * The preset's own handle for the group this slot draws from, or null for a
   * fixed food. A slug rather than the serial id, so that what the copy points
   * at is a group the copy also made, named the way the author named it.
   */
  readonly groupSlug: string | null;
}

export interface PresetOptionRow {
  readonly name: string;
  /** The one the copied diet arrives with selected. */
  readonly isDefault: boolean;
  readonly items: readonly PresetItemRow[];
}

export interface PresetOptionSetRow {
  readonly name: string;
  readonly options: readonly PresetOptionRow[];
}

export interface PresetMealRow {
  readonly name: string;
  /** A fraction of one, as `Meal.share` means it locally (#18). */
  readonly share: number;
  /** The meal's fixed rows — the ones belonging to no option. */
  readonly items: readonly PresetItemRow[];
  readonly optionSets: readonly PresetOptionSetRow[];
}

export interface PresetGroupRow {
  readonly slug: string;
  readonly name: string;
  readonly foodIds: readonly number[];
}

export interface PresetRow {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly meals: readonly PresetMealRow[];
  readonly groups: readonly PresetGroupRow[];
}

export interface PresetCatalog {
  readonly presets: readonly PresetRow[];
  /**
   * Every TACO row the presets name, once, in the shape food search already
   * returns — sentinels and all, so a withheld macro reaches the client as the
   * hole it is rather than as a zero (`./nutrients.ts`).
   */
  readonly foods: readonly FoodSearchResult[];
}

export async function dietPresetCatalog(
  database: Database,
): Promise<PresetCatalog> {
  const presets = await database
    .select({
      slug: dietPresets.slug,
      name: dietPresets.name,
      description: dietPresets.description,
    })
    .from(dietPresets)
    .orderBy(asc(dietPresets.position), asc(dietPresets.slug));

  if (presets.length === 0) return { presets: [], foods: [] };

  const [groups, meals, options, items] = await Promise.all([
    groupRows(database),
    mealRows(database),
    optionRows(database),
    itemRows(database),
  ]);

  const slugOfGroup = new Map<number, string>();
  for (const group of groups.values()) {
    for (const row of group) slugOfGroup.set(row.id, row.slug);
  }

  const built = presets.map((preset) => ({
    slug: preset.slug,
    name: preset.name,
    description: preset.description,
    groups: (groups.get(preset.slug) ?? []).map(({ slug, name, foodIds }) => ({
      slug,
      name,
      foodIds,
    })),
    meals: (meals.get(preset.slug) ?? []).map((meal) =>
      buildMeal(meal, options, items, slugOfGroup),
    ),
  }));

  return { presets: built, foods: await compositions(database, built) };
}

interface GroupRow {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly foodIds: number[];
}

/** The groups of every preset, by preset slug, each with its members in order. */
async function groupRows(database: Database): Promise<Map<string, GroupRow[]>> {
  // Left join: a group with no members is a preset bug, not a row to drop.
  // Kept, it reaches the client as an empty swap list, which somebody can see;
  // dropped, it becomes a group the items point at and that is not there.
  const rows = await database
    .select({
      id: dietPresetGroups.id,
      presetSlug: dietPresetGroups.presetSlug,
      slug: dietPresetGroups.slug,
      name: dietPresetGroups.name,
      foodId: dietPresetGroupFoods.foodId,
    })
    .from(dietPresetGroups)
    .leftJoin(
      dietPresetGroupFoods,
      eq(dietPresetGroupFoods.groupId, dietPresetGroups.id),
    )
    .orderBy(asc(dietPresetGroups.id), asc(dietPresetGroupFoods.position));

  const byPreset = new Map<string, GroupRow[]>();
  const byId = new Map<number, GroupRow>();

  for (const row of rows) {
    let group = byId.get(row.id);
    if (group === undefined) {
      group = { id: row.id, slug: row.slug, name: row.name, foodIds: [] };
      byId.set(row.id, group);
      push(byPreset, row.presetSlug, group);
    }
    if (row.foodId !== null) group.foodIds.push(row.foodId);
  }

  return byPreset;
}

interface MealRow {
  readonly id: number;
  readonly name: string;
  readonly share: number;
}

async function mealRows(database: Database): Promise<Map<string, MealRow[]>> {
  const rows = await database
    .select({
      id: dietPresetMeals.id,
      presetSlug: dietPresetMeals.presetSlug,
      name: dietPresetMeals.name,
      share: dietPresetMeals.share,
    })
    .from(dietPresetMeals)
    .orderBy(asc(dietPresetMeals.presetSlug), asc(dietPresetMeals.position));

  const byPreset = new Map<string, MealRow[]>();
  for (const { presetSlug, ...meal } of rows) push(byPreset, presetSlug, meal);
  return byPreset;
}

interface OptionRow {
  readonly id: number;
  readonly setId: number;
  readonly setName: string;
  readonly name: string;
  readonly isDefault: boolean;
}

/** Every option of every set, by meal, in set order and then option order. */
async function optionRows(
  database: Database,
): Promise<Map<number, OptionRow[]>> {
  const rows = await database
    .select({
      id: dietPresetOptions.id,
      setId: dietPresetOptionSets.id,
      mealId: dietPresetOptionSets.mealId,
      setName: dietPresetOptionSets.name,
      name: dietPresetOptions.name,
      isDefault: dietPresetOptions.isDefault,
    })
    .from(dietPresetOptionSets)
    .innerJoin(
      dietPresetOptions,
      eq(dietPresetOptions.setId, dietPresetOptionSets.id),
    )
    .orderBy(
      asc(dietPresetOptionSets.mealId),
      asc(dietPresetOptionSets.position),
      asc(dietPresetOptions.position),
    );

  const byMeal = new Map<number, OptionRow[]>();
  for (const { mealId, ...option } of rows) push(byMeal, mealId, option);
  return byMeal;
}

interface ItemRow {
  readonly optionId: number | null;
  readonly foodId: number;
  readonly quantityG: number;
  readonly mandatory: boolean;
  readonly minG: number;
  readonly maxG: number;
  readonly groupId: number | null;
}

/**
 * Every item of every meal, fixed rows and option rows alike, by meal.
 *
 * One query rather than one per container: `meal_id` is not-null on a row
 * inside an option precisely so that "every row of this meal" needs no union
 * (schema/presets.ts). Position numbers from one *per container*, so the rows
 * of two options interleave here — which costs nothing, because each option
 * takes its own rows out below and their order among themselves is kept.
 */
async function itemRows(database: Database): Promise<Map<number, ItemRow[]>> {
  const rows = await database
    .select({
      mealId: dietPresetItems.mealId,
      optionId: dietPresetItems.optionId,
      foodId: dietPresetItems.foodId,
      quantityG: dietPresetItems.quantityG,
      mandatory: dietPresetItems.mandatory,
      minG: dietPresetItems.minG,
      maxG: dietPresetItems.maxG,
      groupId: dietPresetItems.groupId,
    })
    .from(dietPresetItems)
    .orderBy(asc(dietPresetItems.mealId), asc(dietPresetItems.position));

  const byMeal = new Map<number, ItemRow[]>();
  for (const { mealId, ...item } of rows) push(byMeal, mealId, item);
  return byMeal;
}

function buildMeal(
  meal: MealRow,
  options: Map<number, OptionRow[]>,
  items: Map<number, ItemRow[]>,
  slugOfGroup: Map<number, string>,
): PresetMealRow {
  const rows = items.get(meal.id) ?? [];
  const rowsOf = (optionId: number | null) =>
    rows
      .filter((row) => row.optionId === optionId)
      .map((row) => published(row, slugOfGroup));

  const sets: { name: string; options: PresetOptionRow[] }[] = [];
  let currentSetId: number | undefined;

  for (const option of options.get(meal.id) ?? []) {
    if (option.setId !== currentSetId) {
      currentSetId = option.setId;
      sets.push({ name: option.setName, options: [] });
    }

    sets.at(-1)!.options.push({
      name: option.name,
      isDefault: option.isDefault,
      items: rowsOf(option.id),
    });
  }

  return {
    name: meal.name,
    share: meal.share,
    items: rowsOf(null),
    optionSets: sets,
  };
}

/** The row as it is published: no ids, the group named rather than numbered. */
function published(
  row: ItemRow,
  slugOfGroup: Map<number, string>,
): PresetItemRow {
  return {
    foodId: row.foodId,
    quantityG: row.quantityG,
    mandatory: row.mandatory,
    minG: row.minG,
    maxG: row.maxG,
    // A group the map cannot answer for would be a group belonging to another
    // preset, which the seed cannot write: the slot becomes a fixed food rather
    // than a slot pointing at nothing.
    groupSlug:
      row.groupId === null ? null : (slugOfGroup.get(row.groupId) ?? null),
  };
}

/** Every food the catalogue names, asked for once. */
async function compositions(
  database: Database,
  presets: readonly PresetRow[],
): Promise<readonly FoodSearchResult[]> {
  const ids = new Set<number>();

  for (const preset of presets) {
    for (const group of preset.groups) {
      for (const id of group.foodIds) ids.add(id);
    }
    for (const meal of preset.meals) {
      for (const item of meal.items) ids.add(item.foodId);
      for (const set of meal.optionSets) {
        for (const option of set.options) {
          for (const item of option.items) ids.add(item.foodId);
        }
      }
    }
  }

  return foodsByIds(database, [...ids]);
}

function push<TKey, TValue>(
  map: Map<TKey, TValue[]>,
  key: TKey,
  value: TValue,
): void {
  const existing = map.get(key);
  if (existing === undefined) map.set(key, [value]);
  else existing.push(value);
}
