import type { Sex } from "@/lib/storage/types";

/**
 * Basal metabolic rate, Mifflin-St Jeor.
 *
 *     BMR = 10·weight(kg) + 6.25·height(cm) − 5·age + s
 *     s = +5 for men, −161 for women
 *
 * Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. *A new
 * predictive equation for resting energy expenditure in healthy individuals.*
 * Am J Clin Nutr. 1990;51(2):241-247.
 *
 * The predecessor to this project shipped with the sex constant wrong, and
 * nobody noticed for a long time — which is the failure mode worth designing
 * against here, because a BMR that is 166 kcal off is not obviously wrong. It
 * looks like a number. Everything downstream (TDEE in #14, macro grams in #15)
 * multiplies it, so the error survives all the way to a plate of food.
 *
 * So the constants are named rather than inlined, and `bmr.test.ts` pins them
 * three ways: against the reference case, against the published equation term by
 * term, and against the 166 kcal gap between the sexes that no single-sided typo
 * can fake.
 */

/** Kilocalories per kilogram of body mass. */
const WEIGHT_COEFFICIENT = 10;

/** Kilocalories per centimetre of height. */
const HEIGHT_COEFFICIENT = 6.25;

/** Kilocalories subtracted per year of age. */
const AGE_COEFFICIENT = 5;

/**
 * The sex constant `s`. The asymmetry is real, not a typo: the equation was
 * fitted to men and women separately and these are the two intercepts that came
 * out. It is exactly the shape of constant that gets "tidied" into something
 * symmetrical by someone sure it must be a mistake.
 */
export const SEX_CONSTANT: Record<Sex, number> = {
  male: 5,
  female: -161,
};

export interface BmrInput {
  weightKg: number;
  heightCm: number;
  /** Completed years — see `ageYearsOn` in ./age.ts. */
  ageYears: number;
  sex: Sex;
}

/**
 * The cohort the equation was fitted to: 498 healthy adults, ages 19–78, both
 * normal-weight and obese.
 *
 * Not enforced. Outside this range the equation still returns a number, and
 * refusing to would be a worse answer than returning an estimate the health
 * disclaimer already frames as an estimate (#10, § D10). Recorded so that the
 * UI can say who it fits, and so nobody later mistakes these bounds for
 * validation limits.
 */
export const MIFFLIN_VALIDITY = { minAgeYears: 19, maxAgeYears: 78 } as const;

/**
 * Resting energy expenditure in kcal/day, unrounded.
 *
 * Unrounded on purpose: this feeds a multiplication (#14) and then a division
 * into grams (#15), and rounding at each step is how a target ends up several
 * grams of carbohydrate away from the energy it claims to be. Round once, at
 * display.
 *
 * Throws on input that cannot describe a person. The form validates what a user
 * types (#12), so anything nonsensical reaching here is a bug in our code, and a
 * `NaN` propagating silently into a diet plan is precisely the class of failure
 * this module exists to make loud.
 */
export function basalMetabolicRate({
  weightKg,
  heightCm,
  ageYears,
  sex,
}: BmrInput): number {
  assertPositive("weightKg", weightKg);
  assertPositive("heightCm", heightCm);

  if (!Number.isFinite(ageYears) || ageYears < 0) {
    throw new RangeError(`ageYears must be a non-negative number, got ${ageYears}`);
  }

  // TypeScript guarantees this at the call site, but the value can arrive from
  // IndexedDB — written by an older version of the app, or hand-edited in
  // devtools — where nothing checked it. An unknown key would index to
  // `undefined` and turn the whole sum into NaN.
  if (!(sex in SEX_CONSTANT)) {
    throw new RangeError(`Unknown sex ${JSON.stringify(sex)}`);
  }

  return (
    WEIGHT_COEFFICIENT * weightKg +
    HEIGHT_COEFFICIENT * heightCm -
    AGE_COEFFICIENT * ageYears +
    SEX_CONSTANT[sex]
  );
}

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number, got ${value}`);
  }
}
