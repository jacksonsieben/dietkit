import { relations, sql } from "drizzle-orm";
import {
  boolean,
  integer,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { exercises } from "./exercises.ts";
import { foods } from "./foods.ts";

/**
 * Starting templates. A preset is a skeleton the client copies into a local diet
 * and then owns — the server hands out the shape and never learns what became of
 * it.
 *
 * Modelled relationally rather than as one JSONB blob for exactly one reason:
 * the foreign key. A preset item points at `foods.id`, so a template referring
 * to food 9999 fails at seed time instead of rendering an empty meal in front of
 * a user. The same key is what makes it structurally impossible for a preset to
 * reference a custom food — custom foods are personal data and live on the
 * device, where no server-side key can reach them.
 *
 * Since #112 the tables say the two things a local diet can say and they could
 * not. A **group** is a preset-level record with its members listed by
 * `foods.id`, so `"frutas"` stopped being a word an item hoped a client would
 * understand. An **option set** is a meal-level decision with named options,
 * one of them the default; its rows are `diet_preset_items` like any other, so
 * the breakfast that offers four carbohydrates ships all four instead of the
 * one that fitted a flat list (#111).
 */

/** Grams, to the tenth. Portions, not measurements — hence `numeric(8,1)`. */
function grams(column: string) {
  return numeric(column, { precision: 8, scale: 1, mode: "number" });
}

export const dietPresets = pgTable("diet_presets", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  position: integer("position").notNull().default(0),
});

export const dietPresetGroups = pgTable(
  "diet_preset_groups",
  {
    id: serial("id").primaryKey(),
    presetSlug: text("preset_slug")
      .notNull()
      .references(() => dietPresets.slug, { onDelete: "cascade" }),
    /** Stable handle inside the preset — how the authored file names it. */
    slug: text("slug").notNull(),
    /** What the swap control says: "Frutas", "Carboidrato do almoço". */
    name: text("name").notNull(),
  },
  (table) => [
    unique("diet_preset_groups_preset_slug_key").on(
      table.presetSlug,
      table.slug,
    ),
  ],
);

export const dietPresetGroupFoods = pgTable(
  "diet_preset_group_foods",
  {
    groupId: integer("group_id")
      .notNull()
      .references(() => dietPresetGroups.id, { onDelete: "cascade" }),
    /** Reference data only, for the same reason a preset item is. */
    foodId: integer("food_id")
      .notNull()
      .references(() => foods.id),
    /** The order the alternatives are offered in. */
    position: integer("position").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.foodId] }),
    unique("diet_preset_group_foods_group_position_key").on(
      table.groupId,
      table.position,
    ),
  ],
);

export const dietPresetMeals = pgTable(
  "diet_preset_meals",
  {
    id: serial("id").primaryKey(),
    presetSlug: text("preset_slug")
      .notNull()
      .references(() => dietPresets.slug, { onDelete: "cascade" }),
    /** Meal count is the preset's, never hardcoded to four (#18). */
    position: integer("position").notNull(),
    name: text("name").notNull(),
    /**
     * The fraction of the day this meal is meant to carry, as `Meal.share`
     * means it locally (#18): a fraction of one, and the preset's meals add to
     * one.
     *
     * Added in #113, because the first preset that was actually written could
     * not be written without it. A preset whose meals have no shares is a
     * preset that copies into a diet where breakfast and dinner are the same
     * meal, which is true of no plan anyone eats — and the alternative, an
     * even split derived from the meal count, is a number the app invents and
     * then presents as the plan's.
     *
     * `numeric(5,4)` rather than a percentage: the fraction is what the local
     * model stores, and converting at a boundary is where a decimal point goes
     * missing.
     */
    share: numeric("share", {
      precision: 5,
      scale: 4,
      mode: "number",
    }).notNull(),
  },
  (table) => [
    unique("diet_preset_meals_preset_position_key").on(
      table.presetSlug,
      table.position,
    ),
  ],
);

export const dietPresetOptionSets = pgTable(
  "diet_preset_option_sets",
  {
    id: serial("id").primaryKey(),
    mealId: integer("meal_id")
      .notNull()
      .references(() => dietPresetMeals.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    /** The question this set asks — "Carboidrato", "Proteína". */
    name: text("name").notNull(),
  },
  (table) => [
    unique("diet_preset_option_sets_meal_position_key").on(
      table.mealId,
      table.position,
    ),
  ],
);

export const dietPresetOptions = pgTable(
  "diet_preset_options",
  {
    id: serial("id").primaryKey(),
    setId: integer("set_id")
      .notNull()
      .references(() => dietPresetOptionSets.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    /** One answer to the set's question — "Aveia", "Pão com ovo". */
    name: text("name").notNull(),
    /** The one the copied diet arrives with selected. */
    isDefault: boolean("is_default").notNull().default(false),
  },
  (table) => [
    unique("diet_preset_options_set_position_key").on(
      table.setId,
      table.position,
    ),
    // At most one default per set, enforced by the database rather than by the
    // seed remembering to. Postgres cannot express the other half — that a set
    // has at least one — without a deferred key pointing back at a row that
    // does not exist yet, so the loader that copies a preset into a diet is
    // where a set with no default has to be refused by name (#113).
    uniqueIndex("diet_preset_options_default_key")
      .on(table.setId)
      .where(sql`"is_default"`),
  ],
);

export const dietPresetItems = pgTable(
  "diet_preset_items",
  {
    id: serial("id").primaryKey(),
    mealId: integer("meal_id")
      .notNull()
      .references(() => dietPresetMeals.id, { onDelete: "cascade" }),
    /**
     * The option this row belongs to, or null when it is one of the meal's
     * fixed rows (#111). Same shape as the local model: a container is either
     * the meal itself or one option inside it, and a row is a row either way —
     * `mandatory`, the bounds and the group reference keep their meaning.
     *
     * `meal_id` stays not-null for a row inside an option, so "every row of
     * this meal" is one query with no union. That the option's set belongs to
     * that same meal is the seed's invariant, not a key's: expressing it would
     * mean carrying the meal down two more tables to close a loop the author
     * never opens.
     */
    optionId: integer("option_id").references(() => dietPresetOptions.id, {
      onDelete: "cascade",
    }),
    position: integer("position").notNull(),
    /** Reference data only — a preset cannot point at a user's custom food. */
    foodId: integer("food_id")
      .notNull()
      .references(() => foods.id),
    quantityG: grams("quantity_g").notNull(),
    /** Credited against the meal target before the solve (P2). */
    mandatory: boolean("mandatory").notNull().default(false),
    /** The bounds the joint solver optimises within (#6, #19). */
    minG: grams("min_g").notNull(),
    maxG: grams("max_g").notNull(),
    /**
     * The group this slot draws from, if it is a slot rather than a fixed food
     * (#20). A key, not the free-text label it replaced: a preset that said
     * `"frutas"` had nowhere to say *which* fruits, so the word was a promise
     * to a client that had no way to keep it.
     */
    groupId: integer("group_id").references(() => dietPresetGroups.id),
  },
  (table) => [
    // Position is per container, so the fixed rows and each option number from
    // one. `nulls not distinct` is what makes that true of the fixed rows:
    // with Postgres's default, two rows at (meal, null, 1) are two different
    // keys and the constraint quietly stops applying to the commonest case.
    unique("diet_preset_items_container_position_key")
      .on(table.mealId, table.optionId, table.position)
      .nullsNotDistinct(),
  ],
);

export const trainingPresets = pgTable("training_presets", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  position: integer("position").notNull().default(0),
});

export const trainingPresetDays = pgTable(
  "training_preset_days",
  {
    id: serial("id").primaryKey(),
    presetSlug: text("preset_slug")
      .notNull()
      .references(() => trainingPresets.slug, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
  },
  (table) => [
    unique("training_preset_days_preset_position_key").on(
      table.presetSlug,
      table.position,
    ),
  ],
);

export const trainingPresetItems = pgTable(
  "training_preset_items",
  {
    id: serial("id").primaryKey(),
    dayId: integer("day_id")
      .notNull()
      .references(() => trainingPresetDays.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    exerciseSlug: text("exercise_slug")
      .notNull()
      .references(() => exercises.slug),
    sets: integer("sets").notNull(),
    /**
     * A prescribed range, not a performed one. What the user actually lifted is
     * personal data and belongs in IndexedDB (§ D1) — there is deliberately no
     * column for a load in kilograms anywhere in this database.
     */
    repMin: integer("rep_min").notNull(),
    repMax: integer("rep_max").notNull(),
    restSeconds: integer("rest_seconds"),
  },
  (table) => [
    unique("training_preset_items_day_position_key").on(
      table.dayId,
      table.position,
    ),
  ],
);

export const dietPresetsRelations = relations(dietPresets, ({ many }) => ({
  meals: many(dietPresetMeals),
  groups: many(dietPresetGroups),
}));

export const dietPresetGroupsRelations = relations(
  dietPresetGroups,
  ({ one, many }) => ({
    preset: one(dietPresets, {
      fields: [dietPresetGroups.presetSlug],
      references: [dietPresets.slug],
    }),
    foods: many(dietPresetGroupFoods),
    items: many(dietPresetItems),
  }),
);

export const dietPresetGroupFoodsRelations = relations(
  dietPresetGroupFoods,
  ({ one }) => ({
    group: one(dietPresetGroups, {
      fields: [dietPresetGroupFoods.groupId],
      references: [dietPresetGroups.id],
    }),
    food: one(foods, {
      fields: [dietPresetGroupFoods.foodId],
      references: [foods.id],
    }),
  }),
);

export const dietPresetMealsRelations = relations(
  dietPresetMeals,
  ({ one, many }) => ({
    preset: one(dietPresets, {
      fields: [dietPresetMeals.presetSlug],
      references: [dietPresets.slug],
    }),
    items: many(dietPresetItems),
    optionSets: many(dietPresetOptionSets),
  }),
);

export const dietPresetOptionSetsRelations = relations(
  dietPresetOptionSets,
  ({ one, many }) => ({
    meal: one(dietPresetMeals, {
      fields: [dietPresetOptionSets.mealId],
      references: [dietPresetMeals.id],
    }),
    options: many(dietPresetOptions),
  }),
);

export const dietPresetOptionsRelations = relations(
  dietPresetOptions,
  ({ one, many }) => ({
    set: one(dietPresetOptionSets, {
      fields: [dietPresetOptions.setId],
      references: [dietPresetOptionSets.id],
    }),
    items: many(dietPresetItems),
  }),
);

export const dietPresetItemsRelations = relations(
  dietPresetItems,
  ({ one }) => ({
    meal: one(dietPresetMeals, {
      fields: [dietPresetItems.mealId],
      references: [dietPresetMeals.id],
    }),
    option: one(dietPresetOptions, {
      fields: [dietPresetItems.optionId],
      references: [dietPresetOptions.id],
    }),
    food: one(foods, {
      fields: [dietPresetItems.foodId],
      references: [foods.id],
    }),
    group: one(dietPresetGroups, {
      fields: [dietPresetItems.groupId],
      references: [dietPresetGroups.id],
    }),
  }),
);

export const trainingPresetsRelations = relations(
  trainingPresets,
  ({ many }) => ({
    days: many(trainingPresetDays),
  }),
);

export const trainingPresetDaysRelations = relations(
  trainingPresetDays,
  ({ one, many }) => ({
    preset: one(trainingPresets, {
      fields: [trainingPresetDays.presetSlug],
      references: [trainingPresets.slug],
    }),
    items: many(trainingPresetItems),
  }),
);

export const trainingPresetItemsRelations = relations(
  trainingPresetItems,
  ({ one }) => ({
    day: one(trainingPresetDays, {
      fields: [trainingPresetItems.dayId],
      references: [trainingPresetDays.id],
    }),
    exercise: one(exercises, {
      fields: [trainingPresetItems.exerciseSlug],
      references: [exercises.slug],
    }),
  }),
);

export type DietPreset = typeof dietPresets.$inferSelect;
export type NewDietPreset = typeof dietPresets.$inferInsert;
export type DietPresetMeal = typeof dietPresetMeals.$inferSelect;
export type NewDietPresetMeal = typeof dietPresetMeals.$inferInsert;
export type DietPresetItem = typeof dietPresetItems.$inferSelect;
export type NewDietPresetItem = typeof dietPresetItems.$inferInsert;
export type DietPresetGroup = typeof dietPresetGroups.$inferSelect;
export type NewDietPresetGroup = typeof dietPresetGroups.$inferInsert;
export type DietPresetGroupFood = typeof dietPresetGroupFoods.$inferSelect;
export type NewDietPresetGroupFood = typeof dietPresetGroupFoods.$inferInsert;
export type DietPresetOptionSet = typeof dietPresetOptionSets.$inferSelect;
export type NewDietPresetOptionSet = typeof dietPresetOptionSets.$inferInsert;
export type DietPresetOption = typeof dietPresetOptions.$inferSelect;
export type NewDietPresetOption = typeof dietPresetOptions.$inferInsert;
export type TrainingPreset = typeof trainingPresets.$inferSelect;
export type NewTrainingPreset = typeof trainingPresets.$inferInsert;
export type TrainingPresetDay = typeof trainingPresetDays.$inferSelect;
export type NewTrainingPresetDay = typeof trainingPresetDays.$inferInsert;
export type TrainingPresetItem = typeof trainingPresetItems.$inferSelect;
export type NewTrainingPresetItem = typeof trainingPresetItems.$inferInsert;
