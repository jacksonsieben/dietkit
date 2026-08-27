import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createReferenceDatabase,
  type ReferenceDatabase,
} from "../../src/lib/db/pglite.fixture.ts";
import { NUTRIENT_KEYS } from "../../src/lib/db/nutrients.ts";
import {
  datasetVersions,
  dietPresetGroupFoods,
  dietPresetGroups,
  dietPresetItems,
  dietPresetMeals,
  dietPresetOptionSets,
  dietPresetOptions,
  dietPresets,
  foodGroups,
  foods,
} from "../../src/lib/db/schema/index.ts";
import {
  DIET_PRESETS,
  DIET_PRESET_COUNT,
  PRESET_FOODS,
} from "../../src/lib/diet/presets.ts";
import { DATA_FILE, type TacoDataset } from "../taco/dataset.ts";
import { writePresets } from "./write.ts";

/**
 * The diet preset seed, run against a real Postgres (#113).
 *
 * `seed.test.ts` for the splits does this for training; the diet presets need
 * it more, because their tree is six tables deep and half of what the seed
 * promises is a shape only the database can refuse: one default per set, a
 * position unique per container with nulls not distinct, and a food id that
 * exists. None of that is testable against a mock's opinion of Postgres.
 *
 * The foods come from data/taco-4ed.json, the same fixture `foods.test.ts`
 * uses, and only the rows the presets name — a preset's dependency on the TACO
 * seed having run is a fact of this seed, and one of the tests below is
 * precisely that it says so out loud instead of dying on a constraint name.
 */
const SOURCE = { sha256: "c".repeat(64), fileBytes: 4_321 };

const dataset = JSON.parse(readFileSync(DATA_FILE, "utf8")) as TacoDataset;

/** The TACO rows the presets point at, and nothing else. */
async function seedFoods(reference: ReferenceDatabase): Promise<void> {
  // Without an explicit id, so the serial's sequence advances: TACO's own
  // provenance row is written the same way, and a fixture that pins id 1 hands
  // the next insert a duplicate key.
  const [version] = await reference.db
    .insert(datasetVersions)
    .values({
      dataset: dataset.dataset,
      edition: dataset.edition,
      sha256: dataset.sha256,
      fileBytes: dataset.fileBytes,
      rowCount: PRESET_FOODS.length,
      sourceUrl: dataset.sourceUrl,
      citation: "citation",
      retrievedAt: dataset.retrievedAt,
    })
    .returning({ id: datasetVersions.id });

  await reference.db.insert(foodGroups).values([...dataset.groups]);

  await reference.db.insert(foods).values(
    PRESET_FOODS.map((referenced) => {
      const food = dataset.foods.find(
        (candidate) => candidate.id === referenced.id,
      )!;

      return {
        id: food.id,
        groupSlug: food.groupSlug,
        description: food.description,
        searchText: food.searchText,
        ...Object.fromEntries(
          NUTRIENT_KEYS.map((key) => [key, food.values[key] ?? null]),
        ),
        sentinels: food.sentinels,
        datasetVersionId: version!.id,
      } as typeof foods.$inferInsert;
    }),
  );
}

describe("the diet preset seed", () => {
  let reference: ReferenceDatabase;

  beforeEach(async () => {
    reference = await createReferenceDatabase();
    await seedFoods(reference);
  }, 60_000);

  it("writes every preset, meal, set, option, group and item", async () => {
    const written = await writePresets(reference.db, SOURCE);

    expect(written.presetCount).toBe(DIET_PRESET_COUNT);
    expect(await reference.db.select().from(dietPresets)).toHaveLength(
      DIET_PRESET_COUNT,
    );
    expect(await reference.db.select().from(dietPresetMeals)).toHaveLength(
      written.mealCount,
    );
    expect(await reference.db.select().from(dietPresetOptions)).toHaveLength(
      written.optionCount,
    );
    expect(await reference.db.select().from(dietPresetGroups)).toHaveLength(
      written.groupCount,
    );
    expect(await reference.db.select().from(dietPresetItems)).toHaveLength(
      written.itemCount,
    );
  });

  it("records where the presets came from, as their own dataset", async () => {
    const written = await writePresets(reference.db, SOURCE);

    const [version] = await reference.db
      .select()
      .from(datasetVersions)
      .where(eq(datasetVersions.dataset, "dietkit-diet-presets"));

    expect(version).toMatchObject({
      sha256: SOURCE.sha256,
      fileBytes: SOURCE.fileBytes,
      rowCount: written.itemCount,
    });
    // Beside TACO's row rather than replacing it: the composition is theirs and
    // the arrangement is ours, and both are pinned to their own hash.
    expect(version!.citation).toContain("DIETKIT");
  });

  it("leaves the second run looking exactly like the first", async () => {
    const first = await writePresets(reference.db, SOURCE);
    const second = await writePresets(reference.db, SOURCE);

    // The meals and their trees are rewritten, so their ids move; what must not
    // move is how many there are. A missing delete shows up here as double.
    expect(second.versionId).toBe(first.versionId);
    expect(await reference.db.select().from(datasetVersions)).toHaveLength(2);
    expect(await reference.db.select().from(dietPresetMeals)).toHaveLength(
      first.mealCount,
    );
    expect(await reference.db.select().from(dietPresetItems)).toHaveLength(
      first.itemCount,
    );
    expect(await reference.db.select().from(dietPresetGroupFoods)).toHaveLength(
      DIET_PRESETS.reduce(
        (total, preset) =>
          total +
          preset.groups.reduce((foods, group) => foods + group.foods.length, 0),
        0,
      ),
    );
    expect(second.removed).toEqual([]);
  });

  it("keeps each meal's share as the fraction the file wrote", async () => {
    await writePresets(reference.db, SOURCE);

    const meals = await reference.db
      .select()
      .from(dietPresetMeals)
      .where(eq(dietPresetMeals.presetSlug, DIET_PRESETS[0]!.slug))
      .orderBy(dietPresetMeals.position);

    expect(meals.map((meal) => meal.name)).toEqual(
      DIET_PRESETS[0]!.meals.map((meal) => meal.name),
    );
    // Through `numeric(5,4)` and back as a number, not a string and not a
    // percentage: the local model reads this straight into `Meal.share` (#18).
    expect(meals.map((meal) => meal.share)).toEqual(
      DIET_PRESETS[0]!.meals.map((meal) => meal.share),
    );
    expect(meals.reduce((total, meal) => total + meal.share, 0)).toBeCloseTo(
      1,
      2,
    );
  });

  it("hangs every slot on the group it draws from", async () => {
    await writePresets(reference.db, SOURCE);

    const [group] = await reference.db
      .select()
      .from(dietPresetGroups)
      .where(eq(dietPresetGroups.slug, "frutas"));

    const members = await reference.db
      .select({ foodId: dietPresetGroupFoods.foodId })
      .from(dietPresetGroupFoods)
      .where(eq(dietPresetGroupFoods.groupId, group!.id))
      .orderBy(dietPresetGroupFoods.position);

    const authored = DIET_PRESETS[0]!.groups.find(
      (candidate) => candidate.slug === "frutas",
    )!;

    expect(members.map((member) => member.foodId)).toEqual(
      authored.foods.map((food) => food.id),
    );

    // And the slots point at it — a `group_id` left null is the free-text
    // "frutas" the group table was added to end (#112).
    const slots = await reference.db
      .select()
      .from(dietPresetItems)
      .where(eq(dietPresetItems.groupId, group!.id));

    expect(slots.length).toBeGreaterThan(0);
  });

  it("gives every option set exactly one default", async () => {
    await writePresets(reference.db, SOURCE);

    const sets = await reference.db.select().from(dietPresetOptionSets);
    const options = await reference.db.select().from(dietPresetOptions);

    expect(sets.length).toBeGreaterThan(0);
    for (const set of sets) {
      const mine = options.filter((option) => option.setId === set.id);

      expect(mine.length).toBeGreaterThanOrEqual(2);
      expect(mine.filter((option) => option.isDefault)).toHaveLength(1);
    }
  });

  it("numbers the fixed rows of a meal from one, alongside its options", async () => {
    await writePresets(reference.db, SOURCE);

    const [meal] = await reference.db
      .select()
      .from(dietPresetMeals)
      .where(eq(dietPresetMeals.name, "Almoço"));

    const fixed = await reference.db
      .select()
      .from(dietPresetItems)
      .where(eq(dietPresetItems.mealId, meal!.id));

    const authored = DIET_PRESETS[0]!.meals.find(
      (candidate) => candidate.name === "Almoço",
    )!;

    expect(
      fixed.filter((item) => item.optionId === null).map((item) => item.foodId),
    ).toEqual(authored.items.map((item) => item.food.id));

    // The teaspoon of oil, as the solver reads a pinned row: min === max.
    const mandatory = fixed.filter((item) => item.mandatory);
    expect(mandatory).toHaveLength(1);
    expect(mandatory[0]!.minG).toBe(mandatory[0]!.maxG);
  });

  it("sweeps out a preset the file no longer has, tree included", async () => {
    // Written straight into the table, because that is the case the sweep is
    // for: a preset seeded by an older build of this file.
    await reference.pg.exec(
      `insert into diet_presets (slug, name, description, position)
       values ('dieta-antiga', 'Dieta antiga', 'De um build anterior', 0);
       insert into diet_preset_meals (preset_slug, position, name, share)
       values ('dieta-antiga', 0, 'Café', 1.0)`,
    );

    const written = await writePresets(reference.db, SOURCE);

    expect(written.removed).toEqual(["dieta-antiga"]);
    expect(await reference.db.select().from(dietPresets)).toHaveLength(
      DIET_PRESET_COUNT,
    );
    const meals = await reference.db.select().from(dietPresetMeals);
    expect(meals.every((meal) => meal.presetSlug !== "dieta-antiga")).toBe(
      true,
    );
  });

  it("says which food is missing instead of dying on a constraint", async () => {
    const [missing] = PRESET_FOODS;
    await reference.pg.exec(`delete from foods where id = ${missing!.id}`);

    await expect(writePresets(reference.db, SOURCE)).rejects.toThrow(
      new RegExp(`não existem na tabela foods: ${missing!.id}\\b`),
    );

    // And nothing was written on the way to finding out — the check runs before
    // the provenance row, so a failed seed leaves no version claiming rows that
    // are not there.
    expect(
      await reference.db
        .select()
        .from(datasetVersions)
        .where(eq(datasetVersions.dataset, "dietkit-diet-presets")),
    ).toHaveLength(0);
  });

  it("will not write a preset into a database with no TACO at all", async () => {
    await reference.pg.exec(`delete from foods`);

    await expect(writePresets(reference.db, SOURCE)).rejects.toThrow(
      /npm run db:seed/,
    );
  });
});

/**
 * The script, started the way npm starts it.
 *
 * Everything above imports write.ts, which vitest resolves with a bundler's
 * rules. `npm run db:seed:diet` is plain `node`, which has no such rules, and
 * the difference is not theoretical: splits.ts once shipped importing
 * "./catalog", every test and the typecheck passed, and the seed died on
 * ERR_MODULE_NOT_FOUND the first time it was pointed at a real database.
 *
 * Getting as far as the missing-connection message means every import in the
 * graph resolved under Node. That is the whole assertion.
 */
describe("the seed script", () => {
  it("loads under plain node, the way npm run db:seed:diet does", async () => {
    const script = fileURLToPath(new URL("./seed.ts", import.meta.url));
    const env = { ...process.env };
    delete env.DATABASE_URL;
    delete env.DATABASE_URL_UNPOOLED;

    const failure = await promisify(execFile)(process.execPath, [script], {
      env,
    }).catch((error: { stderr: string }) => error);

    expect(failure.stderr).toContain("DATABASE_URL_UNPOOLED is not set");
  }, 30_000);
});
