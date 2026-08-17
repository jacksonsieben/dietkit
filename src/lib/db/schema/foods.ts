import { relations } from "drizzle-orm";
import { index, integer, jsonb, numeric, pgTable, text } from "drizzle-orm/pg-core";

import type { NutrientSentinels } from "../nutrients.ts";
import { datasetVersions } from "./provenance.ts";

/**
 * TACO's fifteen food categories, as headings in the printed table.
 *
 * A separate table rather than a `pgEnum` because the category name is
 * published text that gets rendered ("Cereais e derivados"), and adding a
 * category should be an insert, not a migration.
 */
export const foodGroups = pgTable("food_groups", {
  /** Kebab-case, accent-folded: `cereais-e-derivados`. Stable across renames. */
  slug: text("slug").primaryKey(),
  /** Verbatim from the publication, accents and all. */
  name: text("name").notNull(),
  /** The order TACO prints them in, so the UI can match the book. */
  position: integer("position").notNull(),
});

/**
 * A per-100-g composition column.
 *
 * `numeric`, not `double precision`: TACO publishes exact decimals and DietKit
 * promises never to recalculate them (docs/TACO-LICENSING.md), so binary
 * floating point — where 70,1 can come back as 70.09999999999999 — is the wrong
 * container for a value we claim is a quotation. `mode: "number"` keeps the
 * TypeScript side ergonomic; the storage stays exact.
 *
 * Nullable, because a cell may hold `NA`, `Tr`, or nothing at all. Which one it
 * held is in `foods.sentinels` — see src/lib/db/nutrients.ts.
 */
function composition(column: string) {
  return numeric(column, { precision: 10, scale: 3, mode: "number" });
}

/**
 * The TACO food table, one row per published food, values per 100 g of edible
 * portion.
 *
 * Column order follows the publication: moisture through magnesium is the first
 * page spread, manganese through vitamin C the second. Amino acids and fatty
 * acids are separate published tables over a subset of these foods; they are not
 * modelled yet and would arrive as their own tables rather than as 40 more
 * columns here.
 */
export const foods = pgTable(
  "foods",
  {
    /**
     * TACO's own *Número do Alimento* (1–597), not a surrogate key. A food
     * reference is then checkable against the printed table, and the client's
     * `FoodRef` already carries it as `tacoId` (src/lib/storage/types.ts).
     */
    id: integer("id").primaryKey(),
    groupSlug: text("group_slug")
      .notNull()
      .references(() => foodGroups.slug),
    /** *Descrição dos alimentos*, verbatim: `Arroz, integral, cozido`. */
    description: text("description").notNull(),
    /**
     * The description folded to lowercase without accents, for search that
     * finds "feijao" and "Feijão" alike (#31). Derived for indexing, which is
     * why it sits beside the published text rather than replacing it.
     */
    searchText: text("search_text").notNull(),

    // First page spread.
    moisturePercent: composition("moisture_percent"),
    energyKcal: composition("energy_kcal"),
    energyKj: composition("energy_kj"),
    proteinG: composition("protein_g"),
    fatG: composition("fat_g"),
    cholesterolMg: composition("cholesterol_mg"),
    carbG: composition("carb_g"),
    fiberG: composition("fiber_g"),
    ashG: composition("ash_g"),
    calciumMg: composition("calcium_mg"),
    magnesiumMg: composition("magnesium_mg"),

    // Second page spread.
    manganeseMg: composition("manganese_mg"),
    phosphorusMg: composition("phosphorus_mg"),
    ironMg: composition("iron_mg"),
    sodiumMg: composition("sodium_mg"),
    potassiumMg: composition("potassium_mg"),
    copperMg: composition("copper_mg"),
    zincMg: composition("zinc_mg"),
    retinolMcg: composition("retinol_mcg"),
    retinolEquivalentMcg: composition("retinol_equivalent_mcg"),
    retinolActivityEquivalentMcg: composition(
      "retinol_activity_equivalent_mcg",
    ),
    thiamineMg: composition("thiamine_mg"),
    riboflavinMg: composition("riboflavin_mg"),
    pyridoxineMg: composition("pyridoxine_mg"),
    niacinMg: composition("niacin_mg"),
    vitaminCMg: composition("vitamin_c_mg"),

    /**
     * Which cells held `NA` or `Tr` instead of a number.
     *
     * One JSONB column rather than 26 more discriminator columns. It is sparse —
     * most foods name only a few nutrients — and it keeps the distinction the
     * publication draws: a trace is not a zero, and *não aplicável* is not a
     * measurement of nothing.
     */
    sentinels: jsonb("sentinels")
      .$type<NutrientSentinels>()
      .notNull()
      .default({}),

    /** The ingest that last wrote this row. */
    datasetVersionId: integer("dataset_version_id")
      .notNull()
      .references(() => datasetVersions.id),
  },
  (table) => [
    // Browsing by category is the one access pattern that filters rather than
    // searches. At 597 rows the search index is #31's decision to make with
    // measurements, not a guess to bake into the first migration.
    index("foods_group_slug_idx").on(table.groupSlug),
  ],
);

export const foodGroupsRelations = relations(foodGroups, ({ many }) => ({
  foods: many(foods),
}));

export const foodsRelations = relations(foods, ({ one }) => ({
  group: one(foodGroups, {
    fields: [foods.groupSlug],
    references: [foodGroups.slug],
  }),
  datasetVersion: one(datasetVersions, {
    fields: [foods.datasetVersionId],
    references: [datasetVersions.id],
  }),
}));

export type FoodGroup = typeof foodGroups.$inferSelect;
export type NewFoodGroup = typeof foodGroups.$inferInsert;
export type Food = typeof foods.$inferSelect;
export type NewFood = typeof foods.$inferInsert;
