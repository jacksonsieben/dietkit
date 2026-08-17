CREATE TYPE "public"."equipment" AS ENUM('barra', 'halteres', 'maquina', 'cabo', 'peso-corporal', 'kettlebell', 'elastico', 'outro');--> statement-breakpoint
CREATE TYPE "public"."muscle_group" AS ENUM('peito', 'costas', 'ombros', 'biceps', 'triceps', 'antebraco', 'abdomen', 'gluteos', 'quadriceps', 'posterior-de-coxa', 'panturrilhas', 'corpo-inteiro');--> statement-breakpoint
CREATE TABLE "exercises" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"primary_muscle" "muscle_group" NOT NULL,
	"equipment" "equipment" NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_groups" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" integer PRIMARY KEY NOT NULL,
	"group_slug" text NOT NULL,
	"description" text NOT NULL,
	"search_text" text NOT NULL,
	"moisture_percent" numeric(10, 3),
	"energy_kcal" numeric(10, 3),
	"energy_kj" numeric(10, 3),
	"protein_g" numeric(10, 3),
	"fat_g" numeric(10, 3),
	"cholesterol_mg" numeric(10, 3),
	"carb_g" numeric(10, 3),
	"fiber_g" numeric(10, 3),
	"ash_g" numeric(10, 3),
	"calcium_mg" numeric(10, 3),
	"magnesium_mg" numeric(10, 3),
	"manganese_mg" numeric(10, 3),
	"phosphorus_mg" numeric(10, 3),
	"iron_mg" numeric(10, 3),
	"sodium_mg" numeric(10, 3),
	"potassium_mg" numeric(10, 3),
	"copper_mg" numeric(10, 3),
	"zinc_mg" numeric(10, 3),
	"retinol_mcg" numeric(10, 3),
	"retinol_equivalent_mcg" numeric(10, 3),
	"retinol_activity_equivalent_mcg" numeric(10, 3),
	"thiamine_mg" numeric(10, 3),
	"riboflavin_mg" numeric(10, 3),
	"pyridoxine_mg" numeric(10, 3),
	"niacin_mg" numeric(10, 3),
	"vitamin_c_mg" numeric(10, 3),
	"sentinels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dataset_version_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diet_preset_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"meal_id" integer NOT NULL,
	"position" integer NOT NULL,
	"food_id" integer NOT NULL,
	"quantity_g" numeric(8, 1) NOT NULL,
	"mandatory" boolean DEFAULT false NOT NULL,
	"min_g" numeric(8, 1) NOT NULL,
	"max_g" numeric(8, 1) NOT NULL,
	"substitution_group" text,
	CONSTRAINT "diet_preset_items_meal_position_key" UNIQUE("meal_id","position")
);
--> statement-breakpoint
CREATE TABLE "diet_preset_meals" (
	"id" serial PRIMARY KEY NOT NULL,
	"preset_slug" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "diet_preset_meals_preset_position_key" UNIQUE("preset_slug","position")
);
--> statement-breakpoint
CREATE TABLE "diet_presets" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_preset_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"preset_slug" text NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "training_preset_days_preset_position_key" UNIQUE("preset_slug","position")
);
--> statement-breakpoint
CREATE TABLE "training_preset_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_id" integer NOT NULL,
	"position" integer NOT NULL,
	"exercise_slug" text NOT NULL,
	"sets" integer NOT NULL,
	"rep_min" integer NOT NULL,
	"rep_max" integer NOT NULL,
	"rest_seconds" integer,
	CONSTRAINT "training_preset_items_day_position_key" UNIQUE("day_id","position")
);
--> statement-breakpoint
CREATE TABLE "training_presets" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dataset_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"dataset" text NOT NULL,
	"edition" text NOT NULL,
	"sha256" text NOT NULL,
	"file_bytes" integer NOT NULL,
	"row_count" integer NOT NULL,
	"source_url" text NOT NULL,
	"citation" text NOT NULL,
	"retrieved_at" date NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_versions_dataset_sha256_key" UNIQUE("dataset","sha256")
);
--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_group_slug_food_groups_slug_fk" FOREIGN KEY ("group_slug") REFERENCES "public"."food_groups"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_preset_items" ADD CONSTRAINT "diet_preset_items_meal_id_diet_preset_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."diet_preset_meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_preset_items" ADD CONSTRAINT "diet_preset_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_preset_meals" ADD CONSTRAINT "diet_preset_meals_preset_slug_diet_presets_slug_fk" FOREIGN KEY ("preset_slug") REFERENCES "public"."diet_presets"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_preset_days" ADD CONSTRAINT "training_preset_days_preset_slug_training_presets_slug_fk" FOREIGN KEY ("preset_slug") REFERENCES "public"."training_presets"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_preset_items" ADD CONSTRAINT "training_preset_items_day_id_training_preset_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."training_preset_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_preset_items" ADD CONSTRAINT "training_preset_items_exercise_slug_exercises_slug_fk" FOREIGN KEY ("exercise_slug") REFERENCES "public"."exercises"("slug") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercises_primary_muscle_idx" ON "exercises" USING btree ("primary_muscle");--> statement-breakpoint
CREATE INDEX "foods_group_slug_idx" ON "foods" USING btree ("group_slug");