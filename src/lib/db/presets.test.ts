import { beforeAll, describe, expect, it } from "vitest";

import { writePresets } from "../../../scripts/diet/write.ts";
import {
  DIET_PRESETS,
  DIET_PRESET_COUNT,
  PRESET_FOODS,
  type DietPresetSource,
  type PresetItem,
} from "@/lib/diet/presets";

import {
  createReferenceDatabase,
  type ReferenceDatabase,
} from "./pglite.fixture";
import {
  dietPresetCatalog,
  type PresetItemRow,
  type PresetRow,
} from "./presets";
import { datasetVersions, foodGroups, foods } from "./schema";

/**
 * The catalogue route's query, against the preset the project actually ships
 * (#114).
 *
 * Seeded by `writePresets` rather than by hand: the seed is the only writer of
 * these six tables, and a reader tested against a fixture somebody wrote to
 * match it is a reader tested against an assumption. What this asks is the one
 * question worth asking — does a preset survive the round trip through Postgres
 * and come back as the thing that was authored — and it can only be asked with
 * the real writer at the other end.
 *
 * The foods are fabricated, and deliberately so. The FK and the seed's own
 * check need rows at those ids; nothing here is about what NEPA measured, and
 * pulling in data/taco-4ed.json would make this test fail the day a number in
 * it changes.
 */

const SOURCE = { sha256: "d".repeat(64), fileBytes: 1_234 };

/** A row per food the presets name, with no measurements worth the name. */
async function seedFoods(reference: ReferenceDatabase): Promise<void> {
  const [version] = await reference.db
    .insert(datasetVersions)
    .values({
      dataset: "taco",
      edition: "4",
      sha256: "e".repeat(64),
      fileBytes: 1,
      rowCount: PRESET_FOODS.length,
      sourceUrl: "https://example.invalid/taco",
      citation: "citation",
      retrievedAt: "2011-01-01",
    })
    .returning({ id: datasetVersions.id });

  await reference.db
    .insert(foodGroups)
    .values({ slug: "diversos", name: "Diversos", position: 0 });

  await reference.db.insert(foods).values(
    PRESET_FOODS.map((food) => ({
      id: food.id,
      groupSlug: "diversos",
      description: food.taco,
      searchText: food.taco.toLowerCase(),
      energyKcal: 100,
      proteinG: 10,
      carbG: 10,
      fatG: 1,
      fiberG: null,
      sentinels: {},
      datasetVersionId: version!.id,
    })),
  );
}

/** The authored file in the shape the route publishes, to compare against. */
function expected(preset: DietPresetSource): PresetRow {
  const item = (source: PresetItem): PresetItemRow => ({
    foodId: source.food.id,
    quantityG: source.quantityG,
    mandatory: source.mandatory,
    minG: source.minG,
    maxG: source.maxG,
    groupSlug: source.group ?? null,
  });

  return {
    slug: preset.slug,
    name: preset.name,
    description: preset.description,
    groups: preset.groups.map((group) => ({
      slug: group.slug,
      name: group.name,
      foodIds: group.foods.map((food) => food.id),
    })),
    meals: preset.meals.map((meal) => ({
      name: meal.name,
      share: meal.share,
      items: meal.items.map(item),
      optionSets: meal.optionSets.map((set) => ({
        name: set.name,
        options: set.options.map((option) => ({
          name: option.name,
          isDefault: option.isDefault === true,
          items: option.items.map(item),
        })),
      })),
    })),
  };
}

let reference: ReferenceDatabase;

beforeAll(async () => {
  reference = await createReferenceDatabase();
  await seedFoods(reference);
  await writePresets(reference.db, SOURCE);
}, 60_000);

describe("the published preset catalogue", () => {
  it("hands back every authored preset, unchanged", async () => {
    // Deep equality against the file rather than a spot check of a name and a
    // share: the whole point of the route is that what the author wrote is what
    // a device copies, and every field dropped on the way -- a bound, a
    // `mandatory`, a group a slot draws from -- is a plan that solves to
    // something nobody wrote.
    const { presets } = await dietPresetCatalog(reference.db);

    expect(presets).toHaveLength(DIET_PRESET_COUNT);
    expect(presets).toEqual(DIET_PRESETS.map(expected));
  });

  it("ships the composition of every food the presets name", async () => {
    // The reason `Diet.tacoFoods` exists: the copy has to solve on a device
    // that may never reach this route again. A preset delivered without its
    // compositions is a plan the client can render and cannot solve.
    const { presets, foods: composed } = await dietPresetCatalog(reference.db);
    const named = new Set<number>();

    for (const preset of presets) {
      for (const group of preset.groups) {
        for (const id of group.foodIds) named.add(id);
      }
      for (const meal of preset.meals) {
        for (const item of meal.items) named.add(item.foodId);
        for (const set of meal.optionSets) {
          for (const option of set.options) {
            for (const item of option.items) named.add(item.foodId);
          }
        }
      }
    }

    expect(named.size).toBeGreaterThan(0);
    expect(new Set(composed.map((food) => food.id))).toEqual(named);
    // Once each, however many slots point at it: the members of "Frutas" are
    // in a group and in the meals that draw from it.
    expect(composed).toHaveLength(named.size);
  });

  it("gives every option set exactly one default", async () => {
    // Postgres enforces "at most one" with a partial unique index and cannot
    // express "at least one" (schema/presets.ts). This is the other half, and
    // it is checked here rather than at the copy because a set arriving with no
    // default is a seeding fault, not something a device can do anything about.
    const { presets } = await dietPresetCatalog(reference.db);
    const sets = presets.flatMap((preset) =>
      preset.meals.flatMap((meal) => meal.optionSets),
    );

    expect(sets.length).toBeGreaterThan(0);
    for (const set of sets) {
      const defaults = set.options.filter((option) => option.isDefault);
      expect(
        defaults,
        `"${set.name}" has ${defaults.length} defaults`,
      ).toHaveLength(1);
    }
  });

  it("publishes no id this database owns", async () => {
    // The copy is detached the moment it is made (#114): nothing in a local
    // diet may point back at a preset row. A `mealId` or an `optionId` reaching
    // the client is how a copy quietly acquires a back-reference, and a serial
    // that is stable across seeds is exactly the sort of thing somebody stores
    // "just in case". Only `foodId` survives, because a TACO id is published
    // reference data and is what a composition is looked up by.
    const { presets } = await dietPresetCatalog(reference.db);
    const keys = new Set<string>();

    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === "object") {
        for (const [key, nested] of Object.entries(value)) {
          keys.add(key);
          walk(nested);
        }
      }
    };

    walk(presets);

    expect([...keys].filter((key) => /ids?$/i.test(key)).sort()).toEqual([
      "foodId",
      "foodIds",
    ]);
  });

  it("answers an unseeded database with an empty catalogue", async () => {
    // What a fresh preview branch is, and what the route's `count === 0` cache
    // header is for: a shorter-lived "nothing yet" that expires on its own
    // rather than being served for a day after the seed runs.
    const empty = await createReferenceDatabase();

    expect(await dietPresetCatalog(empty.db)).toEqual({
      presets: [],
      foods: [],
    });
  }, 60_000);
});
