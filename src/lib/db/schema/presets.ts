import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  unique,
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
  },
  (table) => [
    unique("diet_preset_meals_preset_position_key").on(
      table.presetSlug,
      table.position,
    ),
  ],
);

export const dietPresetItems = pgTable(
  "diet_preset_items",
  {
    id: serial("id").primaryKey(),
    mealId: integer("meal_id")
      .notNull()
      .references(() => dietPresetMeals.id, { onDelete: "cascade" }),
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
    /** Items sharing a group are interchangeable — the fruit swap (#20). */
    substitutionGroup: text("substitution_group"),
  },
  (table) => [
    unique("diet_preset_items_meal_position_key").on(
      table.mealId,
      table.position,
    ),
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
}));

export const dietPresetMealsRelations = relations(
  dietPresetMeals,
  ({ one, many }) => ({
    preset: one(dietPresets, {
      fields: [dietPresetMeals.presetSlug],
      references: [dietPresets.slug],
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
    food: one(foods, {
      fields: [dietPresetItems.foodId],
      references: [foods.id],
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
export type TrainingPreset = typeof trainingPresets.$inferSelect;
export type NewTrainingPreset = typeof trainingPresets.$inferInsert;
export type TrainingPresetDay = typeof trainingPresetDays.$inferSelect;
export type NewTrainingPresetDay = typeof trainingPresetDays.$inferInsert;
export type TrainingPresetItem = typeof trainingPresetItems.$inferSelect;
export type NewTrainingPresetItem = typeof trainingPresetItems.$inferInsert;
