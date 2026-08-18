import { ageYearsOn, parseIsoDate } from "@/lib/energy/age";
import type { IsoDate, Sex } from "@/lib/storage/types";

/**
 * What the profile form will accept, and why it says no.
 *
 * Pure, and separate from the component, for two reasons. The rules are the
 * interesting part and a DOM is a poor place to test them; and the same rules
 * have to run again on import (#26), where there is no form at all — a restored
 * snapshot from an older version can carry a height of 0 just as easily as a
 * mistyped one can.
 */

/**
 * Bounds, not medical judgement.
 *
 * These reject typos — a height entered in metres, a weight with a missing
 * digit — and nothing more. They are deliberately wider than any population
 * this app expects: the tallest adult on record was 272 cm, and refusing a
 * real person's real body to keep a range tidy would be the worse error. The
 * equation's own cohort (19–78) is documented in `MIFFLIN_VALIDITY` and is
 * explicitly *not* enforced anywhere, for the same reason.
 */
export const PROFILE_LIMITS = {
  weightKg: { min: 20, max: 400 },
  heightCm: { min: 100, max: 250 },
  /** The range `Profile.activityFactor` documents, and #14's override bound. */
  activityFactor: { min: 1, max: 2.5 },
  ageYears: { min: 0, max: 120 },
} as const;

export const PROFILE_FIELDS = [
  "weightKg",
  "heightCm",
  "birthDate",
  "sex",
  "activityFactor",
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];

/**
 * One code per way a field can be wrong, named specifically enough that the
 * message can be too. "Out of range" is three different sentences depending on
 * which field asked, and a shared code would have pushed that branch into the
 * component.
 *
 * An array rather than a bare union so the catalogue can be checked against it
 * at test time — a code with no message renders its own key path at a user.
 */
export const PROFILE_ERROR_CODES = [
  "required",
  "notANumber",
  "weightRange",
  "heightRange",
  "activityRange",
  "notADate",
  "future",
  "implausibleAge",
  "invalidSex",
] as const;

export type ProfileErrorCode = (typeof PROFILE_ERROR_CODES)[number];

/** Every field is a string, because that is what an input element holds. */
export interface ProfileFormValues {
  weightKg: string;
  heightCm: string;
  birthDate: string;
  sex: string;
  activityFactor: string;
}

export interface ProfileFormInput {
  weightKg: number;
  heightCm: number;
  birthDate: IsoDate;
  sex: Sex;
  activityFactor: number;
}

export type ProfileErrors = Partial<Record<ProfileField, ProfileErrorCode>>;

export type ProfileValidation =
  | { ok: true; value: ProfileFormInput }
  | { ok: false; errors: ProfileErrors };

const DECIMAL = /^-?\d+(?:[.,]\d+)?$/;

const SEXES: readonly Sex[] = ["male", "female"];

/** `{value}` on success, `{error}` on failure — narrowable with `in`. */
type Checked<T> = { value: T } | { error: ProfileErrorCode };

/**
 * Reads a number the way a Brazilian keyboard produces one.
 *
 * `70,5` and `70.5` are the same weight. The comma is what pt-BR actually
 * writes, and `<input type="number">` will not carry it: the HTML value
 * sanitisation algorithm only recognises the dot, so a comma leaves `.value`
 * as the empty string and the user watches their input vanish with no message.
 * That is why the form's numeric fields are `type="text"` with
 * `inputMode="decimal"` and are parsed here instead.
 *
 * A thousands separator is not accepted, and does not need to be — no field on
 * this form has four digits.
 */
export function parseDecimal(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!DECIMAL.test(trimmed)) return undefined;

  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

interface Bounds {
  readonly min: number;
  readonly max: number;
}

function checkNumber(
  raw: string,
  bounds: Bounds,
  outOfRange: ProfileErrorCode,
): Checked<number> {
  if (raw.trim() === "") return { error: "required" };

  const value = parseDecimal(raw);
  if (value === undefined) return { error: "notANumber" };
  if (value < bounds.min || value > bounds.max) return { error: outOfRange };

  return { value };
}

function checkBirthDate(raw: string, today: IsoDate): Checked<IsoDate> {
  const trimmed = raw.trim();
  if (trimmed === "") return { error: "required" };

  try {
    parseIsoDate(trimmed);
  } catch {
    return { error: "notADate" };
  }

  // Lexicographic comparison is date comparison for `YYYY-MM-DD`, which is the
  // whole reason the format is stored rather than an epoch number. Checked
  // before the age, because `ageYearsOn` throws on a future date and a thrown
  // error is not something to render next to a field.
  if (trimmed > today) return { error: "future" };
  if (ageYearsOn(trimmed, today) > PROFILE_LIMITS.ageYears.max) {
    return { error: "implausibleAge" };
  }

  return { value: trimmed };
}

function checkSex(raw: string): Checked<Sex> {
  const trimmed = raw.trim();
  if (trimmed === "") return { error: "required" };

  const match = SEXES.find((sex) => sex === trimmed);
  return match ? { value: match } : { error: "invalidSex" };
}

/**
 * Validates the whole form at once.
 *
 * Every field is checked even after one has already failed, so the user is
 * told everything that is wrong in one pass rather than discovering the next
 * problem each time they fix the last one.
 *
 * `today` is a parameter rather than a call to `todayIsoDate()`: the caller
 * already knows what day it is, and a function that reads the clock cannot be
 * tested against a birthday.
 */
export function validateProfileForm(
  values: ProfileFormValues,
  today: IsoDate,
): ProfileValidation {
  const weight = checkNumber(values.weightKg, PROFILE_LIMITS.weightKg, "weightRange");
  const height = checkNumber(values.heightCm, PROFILE_LIMITS.heightCm, "heightRange");
  const activity = checkNumber(
    values.activityFactor,
    PROFILE_LIMITS.activityFactor,
    "activityRange",
  );
  const birthDate = checkBirthDate(values.birthDate, today);
  const sex = checkSex(values.sex);

  // Written as one narrowing condition rather than an `errors` emptiness check
  // so that the success branch needs no casts: TypeScript knows each of these
  // holds a value only because the `in` test on that specific variable said so.
  if (
    "value" in weight &&
    "value" in height &&
    "value" in birthDate &&
    "value" in sex &&
    "value" in activity
  ) {
    return {
      ok: true,
      value: {
        weightKg: weight.value,
        heightCm: height.value,
        birthDate: birthDate.value,
        sex: sex.value,
        activityFactor: activity.value,
      },
    };
  }

  const errors: ProfileErrors = {};
  if ("error" in weight) errors.weightKg = weight.error;
  if ("error" in height) errors.heightCm = height.error;
  if ("error" in birthDate) errors.birthDate = birthDate.error;
  if ("error" in sex) errors.sex = sex.error;
  if ("error" in activity) errors.activityFactor = activity.error;

  return { ok: false, errors };
}
