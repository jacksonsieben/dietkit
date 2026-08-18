import { parseDecimal } from "@/lib/profile/validation";
import type { CustomFood, Id, IsoTimestamp, MacroSet } from "@/lib/storage/types";

/**
 * The food TACO does not have (#17).
 *
 * TACO is a survey of Brazilian foods as they are eaten, not a product
 * catalogue: it has no whey protein, no supermarket bread, no brand of yoghurt.
 * Without somewhere to put those, the builder can express a diet nobody
 * actually eats. So this is not an escape hatch bolted on the side — it is the
 * second half of the food list, and it is stored on the device with everything
 * else personal, because "the brand of protein I buy" is a fact about a person.
 *
 * Pure, and separate from the form for the reason `validateProfileForm` is:
 * the same rules have to run again on import (#26), where there is no form and
 * a hand-edited JSON file can carry a food of 900 g protein per 100 g.
 */

/**
 * Bounds that reject typos, not foods.
 *
 * `macroG` is per 100 g and so its ceiling is 100 by definition — pure oil is
 * 100 g of fat per 100 g, and nothing can be more than all of itself. That one
 * bound catches the single most likely mistake on this form: typing a label's
 * *energy* into a macro box, where 350 lands two digits past anything possible.
 */
export const CUSTOM_FOOD_LIMITS = {
  nameLength: { min: 2, max: 80 },
  brandLength: { min: 0, max: 40 },
  macroG: { min: 0, max: 100 },
  servingG: { min: 1, max: 2000 },
} as const;

/**
 * How far past 100 g the three macros may sum before it is called a mistake.
 *
 * A label rounds each figure on its own, so 0,5 + 0,4 + 99,9 is a real olive
 * oil and not a bad reading. The tolerance is one gram: enough to absorb three
 * roundings, far too little to absorb a number in the wrong box.
 */
export const MACRO_SUM_TOLERANCE_G = 1;

/**
 * Atwater's factors: 4 kcal per gram of protein and of carbohydrate, 9 per gram
 * of fat.
 *
 * Derived rather than asked for, which is a deliberate difference from TACO.
 * TACO's energy column is *measured*, so we quote it; a user typing in a
 * package label has no measurement to give us, and a typed energy that
 * disagrees with the typed macros is a food that reconciles against itself. The
 * screen shows the result of this so nobody has to wonder where it came from.
 *
 * It will sometimes disagree with the number printed on the package, by a few
 * kcal: labels in Brazil may account for fibre and polyols, which these three
 * factors do not. That is a disagreement worth having in the open rather than
 * an inconsistency worth hiding — and the plan is built from the macros anyway
 * (`solveMacros` never reads kcal).
 */
export function deriveKcal(proteinG: number, carbG: number, fatG: number): number {
  return Math.round(4 * proteinG + 4 * carbG + 9 * fatG);
}

export const CUSTOM_FOOD_FIELDS = [
  "name",
  "brand",
  "proteinG",
  "carbG",
  "fatG",
  "servingG",
] as const;

export type CustomFoodField = (typeof CUSTOM_FOOD_FIELDS)[number];

export const CUSTOM_FOOD_ERROR_CODES = [
  "required",
  "notANumber",
  "nameLength",
  "brandLength",
  "macroRange",
  "macroSum",
  "servingRange",
] as const;

export type CustomFoodErrorCode = (typeof CUSTOM_FOOD_ERROR_CODES)[number];

/** Every field is a string, because that is what an input element holds. */
export interface CustomFoodFormValues {
  name: string;
  brand: string;
  proteinG: string;
  carbG: string;
  fatG: string;
  servingG: string;
}

export const EMPTY_CUSTOM_FOOD_FORM: CustomFoodFormValues = {
  name: "",
  brand: "",
  proteinG: "",
  carbG: "",
  fatG: "",
  servingG: "",
};

export interface CustomFoodInput {
  name: string;
  brand?: string;
  per100g: MacroSet;
  servingG?: number;
}

export type CustomFoodErrors = Partial<
  Record<CustomFoodField, CustomFoodErrorCode>
>;

export type CustomFoodValidation =
  | { ok: true; value: CustomFoodInput }
  | { ok: false; errors: CustomFoodErrors };

type Checked<T> = { value: T } | { error: CustomFoodErrorCode };

function checkMacro(raw: string): Checked<number> {
  if (raw.trim() === "") return { error: "required" };

  const value = parseDecimal(raw);
  if (value === undefined) return { error: "notANumber" };
  if (value < CUSTOM_FOOD_LIMITS.macroG.min) return { error: "macroRange" };
  if (value > CUSTOM_FOOD_LIMITS.macroG.max) return { error: "macroRange" };

  return { value };
}

function checkName(raw: string): Checked<string> {
  const trimmed = raw.trim();
  if (trimmed === "") return { error: "required" };
  if (
    trimmed.length < CUSTOM_FOOD_LIMITS.nameLength.min ||
    trimmed.length > CUSTOM_FOOD_LIMITS.nameLength.max
  ) {
    return { error: "nameLength" };
  }

  return { value: trimmed };
}

/** Optional. An empty box is an answer here, not an omission. */
function checkBrand(raw: string): Checked<string | undefined> {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: undefined };
  if (trimmed.length > CUSTOM_FOOD_LIMITS.brandLength.max) {
    return { error: "brandLength" };
  }

  return { value: trimmed };
}

function checkServing(raw: string): Checked<number | undefined> {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: undefined };

  const value = parseDecimal(trimmed);
  if (value === undefined) return { error: "notANumber" };
  if (
    value < CUSTOM_FOOD_LIMITS.servingG.min ||
    value > CUSTOM_FOOD_LIMITS.servingG.max
  ) {
    return { error: "servingRange" };
  }

  return { value };
}

/**
 * Validates the whole form at once, like every other form here: one pass that
 * says everything that is wrong beats making the user find the next problem
 * each time they fix the last one.
 */
export function validateCustomFoodForm(
  values: CustomFoodFormValues,
): CustomFoodValidation {
  const name = checkName(values.name);
  const brand = checkBrand(values.brand);
  const protein = checkMacro(values.proteinG);
  const carb = checkMacro(values.carbG);
  const fat = checkMacro(values.fatG);
  const serving = checkServing(values.servingG);

  const errors: CustomFoodErrors = {};
  if ("error" in name) errors.name = name.error;
  if ("error" in brand) errors.brand = brand.error;
  if ("error" in protein) errors.proteinG = protein.error;
  if ("error" in carb) errors.carbG = carb.error;
  if ("error" in fat) errors.fatG = fat.error;
  if ("error" in serving) errors.servingG = serving.error;

  if (
    "value" in protein &&
    "value" in carb &&
    "value" in fat &&
    protein.value + carb.value + fat.value >
      CUSTOM_FOOD_LIMITS.macroG.max + MACRO_SUM_TOLERANCE_G
  ) {
    // Every one of them can be in range while the food is still impossible.
    // The complaint goes on all three boxes because the arithmetic cannot say
    // which one is wrong, and pointing at the last one would be a guess.
    //
    // Nothing can be overwritten here — the guard above already required all
    // three to have parsed and passed their own bounds — but `??=` keeps that
    // true if this ever runs on numbers that did not: "350" in the protein box
    // is out of range *and* an impossible sum, and only the first of those
    // tells the user what to do about it.
    errors.proteinG ??= "macroSum";
    errors.carbG ??= "macroSum";
    errors.fatG ??= "macroSum";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  // The `in` narrowing above is per-variable, so the success branch re-tests
  // rather than casting — same shape as `validateProfileForm`.
  if (
    !("value" in name) ||
    !("value" in brand) ||
    !("value" in protein) ||
    !("value" in carb) ||
    !("value" in fat) ||
    !("value" in serving)
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      name: name.value,
      ...(brand.value === undefined ? {} : { brand: brand.value }),
      per100g: {
        kcal: deriveKcal(protein.value, carb.value, fat.value),
        proteinG: protein.value,
        carbG: carb.value,
        fatG: fat.value,
      },
      ...(serving.value === undefined ? {} : { servingG: serving.value }),
    },
  };
}

/** Renders a stored number the way pt-BR writes one. */
function toField(value: number | undefined): string {
  return value === undefined ? "" : String(value).replace(".", ",");
}

export function toCustomFoodForm(food: CustomFood): CustomFoodFormValues {
  return {
    name: food.name,
    brand: food.brand ?? "",
    proteinG: toField(food.per100g.proteinG),
    carbG: toField(food.per100g.carbG),
    fatG: toField(food.per100g.fatG),
    servingG: toField(food.servingG),
  };
}

/**
 * A validated form as a record ready to store.
 *
 * `id` and `createdAt` are parameters rather than generated here: editing a
 * food has to keep both, and a function that minted a new id every time would
 * turn every edit into a duplicate — with the plan that referenced the old id
 * still pointing at the version being replaced.
 */
export function toCustomFood(
  input: CustomFoodInput,
  identity: { id: Id; createdAt: IsoTimestamp },
  now: IsoTimestamp,
): CustomFood {
  return {
    id: identity.id,
    name: input.name,
    ...(input.brand === undefined ? {} : { brand: input.brand }),
    per100g: input.per100g,
    ...(input.servingG === undefined ? {} : { servingG: input.servingG }),
    createdAt: identity.createdAt,
    updatedAt: now,
  };
}
