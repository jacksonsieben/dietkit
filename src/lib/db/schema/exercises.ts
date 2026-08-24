import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
} from "drizzle-orm/pg-core";

/**
 * The exercise catalog: names and how to group them, nothing about anybody's
 * training.
 *
 * Training itself is V2 (docs/SCOPE.md § V2) and this table ships empty. It
 * exists now because the reference/personal boundary is easier to hold than to
 * retrofit — when the training log arrives, the catalog is already on the server
 * side of the line and the sets, reps and loads have nowhere to go but the
 * device.
 */

/** Slugs, not labels: the pt-BR names live in `messages/` (§ D5). */
export const muscleGroup = pgEnum("muscle_group", [
  "peito",
  "costas",
  "ombros",
  "biceps",
  "triceps",
  "antebraco",
  "abdomen",
  "gluteos",
  "quadriceps",
  "posterior-de-coxa",
  "panturrilhas",
  "corpo-inteiro",
]);

export const equipment = pgEnum("equipment", [
  "barra",
  "halteres",
  "maquina",
  "cabo",
  "peso-corporal",
  "kettlebell",
  "elastico",
  "outro",
]);

export const exercises = pgTable(
  "exercises",
  {
    slug: text("slug").primaryKey(),
    /** Verbatim pt-BR name — `Supino reto com barra`. */
    name: text("name").notNull(),
    primaryMuscle: muscleGroup("primary_muscle").notNull(),
    equipment: equipment("equipment").notNull(),
    position: integer("position").notNull().default(0),
    /**
     * Done one side at a time — a búlgaro, a rosca concentrada (#79).
     *
     * A fact about the movement, so it belongs beside the equipment rather
     * than in whatever prescribes it. Nothing on the server reads it yet; it
     * is here because the bundled copy of this catalog in
     * `src/lib/training/catalog.ts` grew it, and the two copies describing the
     * same exercise differently is the drift `exercises.test.ts` exists to
     * catch.
     */
    unilateral: boolean("unilateral").notNull().default(false),
  },
  (table) => [index("exercises_primary_muscle_idx").on(table.primaryMuscle)],
);

export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
