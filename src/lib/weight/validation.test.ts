import { describe, expect, it } from "vitest";

import { PROFILE_LIMITS } from "@/lib/profile/validation";

import {
  WEIGHT_LIMITS,
  validateWeightForm,
  type WeightFormValues,
} from "./validation";

const TODAY = "2026-08-19";

function values(edit: Partial<WeightFormValues> = {}): WeightFormValues {
  return { date: TODAY, weightKg: "82,4", note: "", ...edit };
}

describe("validateWeightForm", () => {
  it("accepts a weighing from today", () => {
    const result = validateWeightForm(values(), TODAY);

    expect(result).toEqual({
      ok: true,
      value: { date: TODAY, weightKg: 82.4, note: undefined },
    });
  });

  it("reads the decimal separator pt-BR types", () => {
    // A phone keyboard in Brazil produces a comma, and the field is
    // `type="text"` precisely so the comma survives to be parsed here.
    const result = validateWeightForm(values({ weightKg: "82,4" }), TODAY);

    expect(result).toEqual({ ok: true, value: expect.objectContaining({ weightKg: 82.4 }) });
  });

  it("accepts a day that has already passed", () => {
    // Backfilling is the feature, not a tolerated edge case: the week you were
    // away from the app is exactly what this screen is for.
    const result = validateWeightForm(values({ date: "2025-01-02" }), TODAY);

    expect(result).toEqual({ ok: true, value: expect.objectContaining({ date: "2025-01-02" }) });
  });

  it("refuses a day that has not happened", () => {
    const result = validateWeightForm(values({ date: "2026-08-20" }), TODAY);

    expect(result).toEqual({ ok: false, errors: { date: "future" } });
  });

  it("refuses a year nobody stood on a scale in", () => {
    // What a mistyped year looks like. There is no upper bound below today to
    // catch it, so the floor is the only thing that will.
    const result = validateWeightForm(values({ date: "1026-08-19" }), TODAY);

    expect(result).toEqual({ ok: false, errors: { date: "ancientDate" } });
  });

  it("refuses text that is not a date", () => {
    const result = validateWeightForm(values({ date: "19/08/2026" }), TODAY);

    expect(result).toEqual({ ok: false, errors: { date: "notADate" } });
  });

  it("refuses a day the calendar does not have", () => {
    const result = validateWeightForm(values({ date: "2026-02-30" }), TODAY);

    expect(result).toEqual({ ok: false, errors: { date: "notADate" } });
  });

  it("asks for a date when the box is empty", () => {
    const result = validateWeightForm(values({ date: "  " }), TODAY);

    expect(result).toEqual({ ok: false, errors: { date: "required" } });
  });

  it("asks for a weight when the box is empty", () => {
    const result = validateWeightForm(values({ weightKg: "" }), TODAY);

    expect(result).toEqual({ ok: false, errors: { weightKg: "required" } });
  });

  it("refuses a weight that is not a number", () => {
    const result = validateWeightForm(values({ weightKg: "oitenta" }), TODAY);

    expect(result).toEqual({ ok: false, errors: { weightKg: "notANumber" } });
  });

  it("refuses a weight outside the range a body has", () => {
    for (const raw of ["0", "19,9", "400,1", "-82"]) {
      expect(validateWeightForm(values({ weightKg: raw }), TODAY), raw).toEqual({
        ok: false,
        errors: { weightKg: "weightRange" },
      });
    }
  });

  it("accepts the ends of that range", () => {
    for (const raw of ["20", "400"]) {
      expect(validateWeightForm(values({ weightKg: raw }), TODAY), raw).toMatchObject({
        ok: true,
      });
    }
  });

  it("measures a body against the same range the profile does", () => {
    // Two ranges that both mean "a plausible human weight" is how one of them
    // gets widened and the other keeps rejecting what the first now allows.
    expect(WEIGHT_LIMITS.weightKg).toBe(PROFILE_LIMITS.weightKg);
  });

  it("keeps a note, trimmed", () => {
    const result = validateWeightForm(values({ note: "  em jejum  " }), TODAY);

    expect(result).toEqual({ ok: true, value: expect.objectContaining({ note: "em jejum" }) });
  });

  it("leaves a blank note out rather than storing an empty string", () => {
    // A blank box is not a note that says nothing — the field is optional in
    // `WeightEntry`, and "" would render as an empty line in the log.
    const result = validateWeightForm(values({ note: "   " }), TODAY);

    expect(result).toMatchObject({ ok: true, value: { note: undefined } });
  });

  it("refuses a note longer than the log can show", () => {
    const long = "a".repeat(WEIGHT_LIMITS.noteChars + 1);
    const result = validateWeightForm(values({ note: long }), TODAY);

    expect(result).toEqual({ ok: false, errors: { note: "noteTooLong" } });
  });

  it("accepts a note of exactly the cap", () => {
    const exact = "a".repeat(WEIGHT_LIMITS.noteChars);

    expect(validateWeightForm(values({ note: exact }), TODAY)).toMatchObject({ ok: true });
  });

  it("reports every problem in one pass", () => {
    // Otherwise fixing the date only reveals that the weight was wrong too, one
    // save at a time.
    const result = validateWeightForm(
      { date: "2026-08-20", weightKg: "", note: "n".repeat(500) },
      TODAY,
    );

    expect(result).toEqual({
      ok: false,
      errors: { date: "future", weightKg: "required", note: "noteTooLong" },
    });
  });
});
