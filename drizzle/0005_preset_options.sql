CREATE TABLE "diet_preset_group_foods" (
	"group_id" integer NOT NULL,
	"food_id" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "diet_preset_group_foods_group_id_food_id_pk" PRIMARY KEY("group_id","food_id"),
	CONSTRAINT "diet_preset_group_foods_group_position_key" UNIQUE("group_id","position")
);
--> statement-breakpoint
CREATE TABLE "diet_preset_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"preset_slug" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "diet_preset_groups_preset_slug_key" UNIQUE("preset_slug","slug")
);
--> statement-breakpoint
CREATE TABLE "diet_preset_option_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"meal_id" integer NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "diet_preset_option_sets_meal_position_key" UNIQUE("meal_id","position")
);
--> statement-breakpoint
CREATE TABLE "diet_preset_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"set_id" integer NOT NULL,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	CONSTRAINT "diet_preset_options_set_position_key" UNIQUE("set_id","position")
);
--> statement-breakpoint
ALTER TABLE "diet_preset_items" DROP CONSTRAINT "diet_preset_items_meal_position_key";--> statement-breakpoint
ALTER TABLE "diet_preset_items" ADD COLUMN "option_id" integer;--> statement-breakpoint
ALTER TABLE "diet_preset_items" ADD COLUMN "group_id" integer;--> statement-breakpoint
ALTER TABLE "diet_preset_group_foods" ADD CONSTRAINT "diet_preset_group_foods_group_id_diet_preset_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."diet_preset_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_preset_group_foods" ADD CONSTRAINT "diet_preset_group_foods_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_preset_groups" ADD CONSTRAINT "diet_preset_groups_preset_slug_diet_presets_slug_fk" FOREIGN KEY ("preset_slug") REFERENCES "public"."diet_presets"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_preset_option_sets" ADD CONSTRAINT "diet_preset_option_sets_meal_id_diet_preset_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."diet_preset_meals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_preset_options" ADD CONSTRAINT "diet_preset_options_set_id_diet_preset_option_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."diet_preset_option_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "diet_preset_options_default_key" ON "diet_preset_options" USING btree ("set_id") WHERE "is_default";--> statement-breakpoint
ALTER TABLE "diet_preset_items" ADD CONSTRAINT "diet_preset_items_option_id_diet_preset_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."diet_preset_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_preset_items" ADD CONSTRAINT "diet_preset_items_group_id_diet_preset_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."diet_preset_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diet_preset_items" ADD CONSTRAINT "diet_preset_items_container_position_key" UNIQUE NULLS NOT DISTINCT("meal_id","option_id","position");--> statement-breakpoint
ALTER TABLE "diet_preset_items" DROP COLUMN "substitution_group";
