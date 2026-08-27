/**
 * The diet presets, written into a Postgres.
 *
 * Separate from seed.ts for the reason scripts/training/write.ts is: seed.ts is
 * a script — importing it runs it — and this is the code whose only production
 * run is against the database it would be worst to get wrong. Taking the
 * connection as an argument is what lets `seed.test.ts` run these exact upserts
 * against PGlite.
 *
 * One write, and one order inside it. Groups are deleted and rebuilt before the
 * meals that point at them, and the meals go first of all so their items —
 * which hold the only references a group has — are gone by the time the group
 * rows are. Everything runs inside seed.ts's single transaction (#74).
 */

import {
  getTableColumns,
  inArray,
  notInArray,
  sql,
  type ExtractTablesWithRelations,
} from "drizzle-orm";
import type {
  PgDatabase,
  PgQueryResultHKT,
  PgTable,
} from "drizzle-orm/pg-core";

import {
  datasetVersions,
  dietPresetGroupFoods,
  dietPresetGroups,
  dietPresetItems,
  dietPresetMeals,
  dietPresetOptionSets,
  dietPresetOptions,
  dietPresets,
  foods,
} from "../../src/lib/db/schema/index.ts";
import {
  DIET_PRESETS,
  DIET_PRESET_CATALOG,
  DIET_PRESET_CATALOG_CITATION,
  type DietPresetSource,
  type PresetItem,
} from "../../src/lib/diet/presets.ts";

/** Comfortably inside Postgres' parameter limit at a handful of columns a row. */
const CHUNK = 100;

/** Any Postgres drizzle can talk to: Neon over a socket, or PGlite in a test. */
type AnyDatabase<TSchema extends Record<string, unknown>> = PgDatabase<
  PgQueryResultHKT,
  TSchema,
  ExtractTablesWithRelations<TSchema>
>;

interface Dataset {
  readonly dataset: string;
  readonly edition: string;
  readonly authoredOn: string;
  readonly url: string;
}

/** The file the rows came from, hashed. */
export interface DatasetSource {
  readonly sha256: string;
  readonly fileBytes: number;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/** `SET col = excluded.col` for every column but the key. */
function updateAllExcept(
  table: PgTable,
  key: string,
): Record<string, ReturnType<typeof sql.raw>> {
  return Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([name]) => name !== key)
      .map(([name, column]) => [name, sql.raw(`excluded."${column.name}"`)]),
  );
}

async function writeVersion<TSchema extends Record<string, unknown>>(
  db: AnyDatabase<TSchema>,
  dataset: Dataset,
  citation: string,
  source: DatasetSource,
  rowCount: number,
): Promise<number> {
  const values = {
    dataset: dataset.dataset,
    edition: dataset.edition,
    sha256: source.sha256,
    fileBytes: source.fileBytes,
    rowCount,
    sourceUrl: dataset.url,
    citation,
    retrievedAt: dataset.authoredOn,
  };

  const [version] = await db
    .insert(datasetVersions)
    .values(values)
    .onConflictDoUpdate({
      target: [datasetVersions.dataset, datasetVersions.sha256],
      set: {
        edition: values.edition,
        fileBytes: values.fileBytes,
        rowCount: values.rowCount,
        sourceUrl: values.sourceUrl,
        citation: values.citation,
        retrievedAt: values.retrievedAt,
        ingestedAt: sql`now()`,
      },
    })
    .returning({ id: datasetVersions.id });

  return version!.id;
}

/** Every food id the file names, once. */
function referencedFoodIds(presets: readonly DietPresetSource[]): number[] {
  const ids = new Set<number>();
  for (const preset of presets) {
    for (const group of preset.groups) {
      for (const food of group.foods) ids.add(food.id);
    }
    for (const meal of preset.meals) {
      for (const item of meal.items) ids.add(item.food.id);
      for (const set of meal.optionSets) {
        for (const option of set.options) {
          for (const item of option.items) ids.add(item.food.id);
        }
      }
    }
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * Refuse to write a preset naming a food this database does not have.
 *
 * The foreign key would refuse it too, one row at a time and by constraint
 * name. This says which ids are missing and, right after it, that the foods
 * table is probably unseeded — which is what has actually gone wrong nine times
 * out of ten, and is not a thing
 * `diet_preset_items_food_id_foods_id_fk` manages to say.
 */
async function assertFoodsExist<TSchema extends Record<string, unknown>>(
  db: AnyDatabase<TSchema>,
  presets: readonly DietPresetSource[],
): Promise<void> {
  const ids = referencedFoodIds(presets);
  if (ids.length === 0) return;

  const present = new Set(
    (
      await db
        .select({ id: foods.id })
        .from(foods)
        .where(inArray(foods.id, ids))
    ).map((food) => food.id),
  );

  const missing = ids.filter((id) => !present.has(id));
  if (missing.length === 0) return;

  throw new Error(
    `Os modelos de dieta citam ${missing.length} alimento(s) que não existem ` +
      `na tabela foods: ${missing.join(", ")}. ` +
      "Rode `npm run db:seed` (TACO) antes deste seed, ou corrija o id em " +
      "src/lib/diet/presets.ts.",
  );
}

export interface PresetWrite {
  readonly versionId: number;
  readonly presetCount: number;
  readonly groupCount: number;
  readonly mealCount: number;
  readonly optionCount: number;
  readonly itemCount: number;
  readonly removed: string[];
}

/** How many rows the file is worth, for the provenance row's `row_count`. */
function countItems(preset: DietPresetSource): number {
  return preset.meals.reduce(
    (total, meal) =>
      total +
      meal.items.length +
      meal.optionSets.reduce(
        (sets, set) =>
          sets +
          set.options.reduce(
            (options, option) => options + option.items.length,
            0,
          ),
        0,
      ),
    0,
  );
}

/**
 * src/lib/diet/presets.ts, as the six-table preset tree.
 *
 * Presets and their groups are upserted and rewritten respectively; meals,
 * option sets, options and items are deleted and reinserted. Same reasoning as
 * the splits: their identity is a serial id nothing else points at — a device
 * copies a preset and then owns the copy, keyed by nothing of ours (§ D1) — so
 * there is no identity to preserve, and a rewrite cannot leave an item stranded
 * at a position its option no longer has.
 *
 * The preset row itself is upserted, because its slug *is* the handle: it is
 * what a copied diet records as where it came from.
 */
export async function writePresets<TSchema extends Record<string, unknown>>(
  db: AnyDatabase<TSchema>,
  source: DatasetSource,
): Promise<PresetWrite> {
  await assertFoodsExist(db, DIET_PRESETS);

  const slugs = DIET_PRESETS.map((preset) => preset.slug);
  const itemCount = DIET_PRESETS.reduce(
    (total, preset) => total + countItems(preset),
    0,
  );

  const versionId = await writeVersion(
    db,
    DIET_PRESET_CATALOG,
    DIET_PRESET_CATALOG_CITATION,
    source,
    itemCount,
  );

  // A preset dropped from the file goes, and takes its groups, meals, sets,
  // options and items with it through the cascades.
  const removed = await db
    .delete(dietPresets)
    .where(notInArray(dietPresets.slug, slugs))
    .returning({ slug: dietPresets.slug });

  await db
    .insert(dietPresets)
    .values(
      DIET_PRESETS.map((preset, position) => ({
        slug: preset.slug,
        name: preset.name,
        description: preset.description,
        position,
      })),
    )
    .onConflictDoUpdate({
      target: dietPresets.slug,
      set: updateAllExcept(dietPresets, "slug"),
    });

  // Meals first: an item is the only row that references a group, and it goes
  // with its meal. Deleting the groups first would hit that key instead.
  await db
    .delete(dietPresetMeals)
    .where(inArray(dietPresetMeals.presetSlug, slugs));
  await db
    .delete(dietPresetGroups)
    .where(inArray(dietPresetGroups.presetSlug, slugs));

  let groupCount = 0;
  let mealCount = 0;
  let optionCount = 0;

  for (const preset of DIET_PRESETS) {
    const groupIds = await writeGroups(db, preset);
    groupCount += groupIds.size;
    optionCount += await writeMeals(db, preset, groupIds);
    mealCount += preset.meals.length;
  }

  return {
    versionId,
    presetCount: DIET_PRESETS.length,
    groupCount,
    mealCount,
    optionCount,
    itemCount,
    removed: removed.map((preset) => preset.slug),
  };
}

/** The preset's groups, keyed by the slug an item refers to them by. */
async function writeGroups<TSchema extends Record<string, unknown>>(
  db: AnyDatabase<TSchema>,
  preset: DietPresetSource,
): Promise<Map<string, number>> {
  if (preset.groups.length === 0) return new Map();

  const rows = await db
    .insert(dietPresetGroups)
    .values(
      preset.groups.map((group) => ({
        presetSlug: preset.slug,
        slug: group.slug,
        name: group.name,
      })),
    )
    .returning({ id: dietPresetGroups.id });

  const members = preset.groups.flatMap((group, index) =>
    group.foods.map((food, position) => ({
      groupId: rows[index]!.id,
      foodId: food.id,
      position,
    })),
  );

  for (const batch of chunk(members, CHUNK)) {
    await db.insert(dietPresetGroupFoods).values(batch);
  }

  return new Map(
    preset.groups.map((group, index) => [group.slug, rows[index]!.id]),
  );
}

/** One item row, in the shape the table wants it. */
function itemRow(
  item: PresetItem,
  mealId: number,
  optionId: number | null,
  position: number,
  groupIds: Map<string, number>,
): typeof dietPresetItems.$inferInsert {
  const groupId =
    item.group === undefined ? null : (groupIds.get(item.group) ?? null);

  // A slot naming a group the preset does not have would otherwise be written
  // as a plain food, which is the failure the group table exists to end: the
  // row would look right and the swap control would have nothing to offer.
  if (item.group !== undefined && groupId === null) {
    throw new Error(
      `Item aponta para o grupo "${item.group}", que este modelo não define.`,
    );
  }

  return {
    mealId,
    optionId,
    position,
    foodId: item.food.id,
    quantityG: item.quantityG,
    mandatory: item.mandatory,
    minG: item.minG,
    maxG: item.maxG,
    groupId,
  };
}

/** The preset's meals, their option sets, their options and every item. */
async function writeMeals<TSchema extends Record<string, unknown>>(
  db: AnyDatabase<TSchema>,
  preset: DietPresetSource,
  groupIds: Map<string, number>,
): Promise<number> {
  if (preset.meals.length === 0) return 0;

  // One statement, so `returning` comes back in the order of the VALUES list —
  // all the correlation a meal in the file needs with its row.
  const meals = await db
    .insert(dietPresetMeals)
    .values(
      preset.meals.map((meal, position) => ({
        presetSlug: preset.slug,
        position,
        name: meal.name,
        share: meal.share,
      })),
    )
    .returning({ id: dietPresetMeals.id });

  const items = preset.meals.flatMap((meal, index) =>
    meal.items.map((item, position) =>
      itemRow(item, meals[index]!.id, null, position, groupIds),
    ),
  );

  let optionCount = 0;

  for (const [index, meal] of preset.meals.entries()) {
    for (const [position, set] of meal.optionSets.entries()) {
      const [row] = await db
        .insert(dietPresetOptionSets)
        .values({ mealId: meals[index]!.id, position, name: set.name })
        .returning({ id: dietPresetOptionSets.id });

      const options = await db
        .insert(dietPresetOptions)
        .values(
          set.options.map((option, optionPosition) => ({
            setId: row!.id,
            position: optionPosition,
            name: option.name,
            isDefault: option.isDefault === true,
          })),
        )
        .returning({ id: dietPresetOptions.id });

      optionCount += options.length;

      items.push(
        ...set.options.flatMap((option, optionIndex) =>
          option.items.map((item, itemPosition) =>
            itemRow(
              item,
              meals[index]!.id,
              options[optionIndex]!.id,
              itemPosition,
              groupIds,
            ),
          ),
        ),
      );
    }
  }

  for (const batch of chunk(items, CHUNK)) {
    await db.insert(dietPresetItems).values(batch);
  }

  return optionCount;
}
