import { parseIsoDate } from "@/lib/energy/age";
import { PROFILE_LIMITS, parseDecimal } from "@/lib/profile/validation";
import type { IsoDate } from "@/lib/storage/types";

/**
 * What the weight log will accept, and why it says no (#23).
 *
 * Pure and separate from the screen, like `profile/validation.ts` and for the
 * same two reasons: the rules are the interesting part, and they have to run
 * again where there is no form — an imported snapshot (#26) or a plan brought
 * over from the old app (#22) can carry a weight of 0 as easily as a thumb can.
 */

export const WEIGHT_LIMITS = {
  /**
   * The profile's range, not a second copy of it. The same body is being
   * described, and two ranges that mean "a plausible human weight" is how one
   * of them gets widened and the other quietly keeps rejecting.
   */
  weightKg: PROFILE_LIMITS.weightKg,
  /**
   * A floor on the date, because there is no ceiling below "today" that would
   * catch a mistyped year. Backfilling is the point of this screen, so the past
   * is deliberately open — but a weigh-in from 1026 is a keyboard, not a memory.
   */
  earliestDate: "1900-01-01",
  /**
   * A note is a reminder — "depois do treino", "de manhã, em jejum" — not a
   * diary. The cap keeps the log readable as a list, which is the only way it
   * is ever displayed.
   */
  noteChars: 140,
} as const;

export const WEIGHT_FIELDS = ["date", "weightKg", "note"] as const;

export type WeightField = (typeof WEIGHT_FIELDS)[number];

export const WEIGHT_ERROR_CODES = [
  "required",
  "notANumber",
  "weightRange",
  "notADate",
  "future",
  "ancientDate",
  "noteTooLong",
] as const;

export type WeightErrorCode = (typeof WEIGHT_ERROR_CODES)[number];

/** Every field is a string, because that is what an input element holds. */
export interface WeightFormValues {
  date: string;
  weightKg: string;
  note: string;
}

export interface WeightFormInput {
  date: IsoDate;
  weightKg: number;
  /** Absent rather than empty: a blank box is not a note that says nothing. */
  note?: string;
}

export type WeightErrors = Partial<Record<WeightField, WeightErrorCode>>;

export type WeightValidation =
  | { ok: true; value: WeightFormInput }
  | { ok: false; errors: WeightErrors };

type Checked<T> = { value: T } | { error: WeightErrorCode };

function checkWeight(raw: string): Checked<number> {
  if (raw.trim() === "") return { error: "required" };

  const value = parseDecimal(raw);
  if (value === undefined) return { error: "notANumber" };
  if (
    value < WEIGHT_LIMITS.weightKg.min ||
    value > WEIGHT_LIMITS.weightKg.max
  ) {
    return { error: "weightRange" };
  }

  return { value };
}

/**
 * The date the measurement belongs to.
 *
 * A past date is not an error — filling in the days you forgot is what
 * "backfillable" means, and a log that only accepts today is a log that loses
 * every week you were away from the app. The future is a different matter: it
 * is a weight nobody has stood on a scale for, and the only way one gets typed
 * is by accident.
 */
function checkDate(raw: string, today: IsoDate): Checked<IsoDate> {
  const trimmed = raw.trim();
  if (trimmed === "") return { error: "required" };

  try {
    parseIsoDate(trimmed);
  } catch {
    return { error: "notADate" };
  }

  // Lexicographic comparison is date comparison for `YYYY-MM-DD` — the reason
  // `IsoDate` is a string in the first place (src/lib/storage/types.ts).
  if (trimmed > today) return { error: "future" };
  if (trimmed < WEIGHT_LIMITS.earliestDate) return { error: "ancientDate" };

  return { value: trimmed };
}

function checkNote(raw: string): Checked<string | undefined> {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: undefined };
  if (trimmed.length > WEIGHT_LIMITS.noteChars) {
    return { error: "noteTooLong" };
  }

  return { value: trimmed };
}

/**
 * Validates the whole entry at once, so every problem is reported in one pass
 * rather than one per attempt.
 *
 * `today` is a parameter rather than a call to `todayIsoDate()`: this
 * function's entire job is deciding which days are allowed, and one that read
 * the clock itself could only ever be tested on the day the suite ran.
 */
export function validateWeightForm(
  values: WeightFormValues,
  today: IsoDate,
): WeightValidation {
  const date = checkDate(values.date, today);
  const weight = checkWeight(values.weightKg);
  const note = checkNote(values.note);

  if ("value" in date && "value" in weight && "value" in note) {
    return {
      ok: true,
      value: { date: date.value, weightKg: weight.value, note: note.value },
    };
  }

  const errors: WeightErrors = {};
  if ("error" in date) errors.date = date.error;
  if ("error" in weight) errors.weightKg = weight.error;
  if ("error" in note) errors.note = note.error;

  return { ok: false, errors };
}
