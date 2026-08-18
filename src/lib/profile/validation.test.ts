import { describe, expect, it } from "vitest";

import {
  PROFILE_LIMITS,
  type ProfileFormValues,
  parseDecimal,
  validateProfileForm,
} from "./validation";

const TODAY = "2026-08-18";

const VALID: ProfileFormValues = {
  weightKg: "82,4",
  heightCm: "178",
  birthDate: "1995-03-14",
  sex: "male",
  activityFactor: "1,55",
};

/** The errors of a failed validation, or a clear failure if it passed. */
function errorsOf(values: Partial<ProfileFormValues>) {
  const result = validateProfileForm({ ...VALID, ...values }, TODAY);
  if (result.ok) throw new Error("expected the form to be rejected");
  return result.errors;
}

describe("parseDecimal", () => {
  it("reads a comma as the decimal separator", () => {
    // The one that matters: pt-BR writes 70,5 and `type="number"` drops it.
    expect(parseDecimal("70,5")).toBe(70.5);
  });

  it("reads a dot as the decimal separator too", () => {
    // Plenty of phone keyboards only offer the dot.
    expect(parseDecimal("70.5")).toBe(70.5);
  });

  it.each(["82", " 82 ", "82,0", "0,5"])("accepts %s", (raw) => {
    expect(parseDecimal(raw)).toBeTypeOf("number");
  });

  it.each([
    ["", "empty"],
    ["oitenta", "words"],
    ["70,5,3", "two separators"],
    ["70kg", "a unit"],
    ["1.234,5", "a thousands separator"],
    ["7 0", "an interior space"],
    ["NaN", "the literal NaN"],
    ["Infinity", "the literal Infinity"],
    ["1e3", "exponent notation"],
    [",5", "a bare separator"],
  ])("rejects %s (%s)", (raw) => {
    expect(parseDecimal(raw)).toBeUndefined();
  });
});

describe("validateProfileForm", () => {
  it("accepts a filled-in form and returns numbers, not strings", () => {
    const result = validateProfileForm(VALID, TODAY);

    expect(result).toEqual({
      ok: true,
      value: {
        weightKg: 82.4,
        heightCm: 178,
        birthDate: "1995-03-14",
        sex: "male",
        activityFactor: 1.55,
      },
    });
  });

  it("accepts female as well as male", () => {
    const result = validateProfileForm({ ...VALID, sex: "female" }, TODAY);

    expect(result.ok && result.value.sex).toBe("female");
  });

  it("reports every bad field at once, not just the first", () => {
    // Fixing one problem and being shown the next is how a five-field form
    // takes five attempts.
    expect(
      errorsOf({ weightKg: "", heightCm: "1,78", birthDate: "", sex: "", activityFactor: "9" }),
    ).toEqual({
      weightKg: "required",
      heightCm: "heightRange",
      birthDate: "required",
      sex: "required",
      activityFactor: "activityRange",
    });
  });

  describe("nonsense input", () => {
    it("rejects a height entered in metres", () => {
      // The single most likely typo on this form, and 1.78 is a number that
      // passes every check except the range one.
      expect(errorsOf({ heightCm: "1,78" })).toEqual({ heightCm: "heightRange" });
    });

    it.each([
      ["zero weight", { weightKg: "0" }, { weightKg: "weightRange" }],
      ["negative weight", { weightKg: "-70" }, { weightKg: "weightRange" }],
      ["a weight with a missing digit", { weightKg: "8" }, { weightKg: "weightRange" }],
      ["a weight in grams", { weightKg: "82400" }, { weightKg: "weightRange" }],
      ["zero height", { heightCm: "0" }, { heightCm: "heightRange" }],
      ["words for a weight", { weightKg: "oitenta" }, { weightKg: "notANumber" }],
      ["a sedentary factor below 1", { activityFactor: "0,9" }, { activityFactor: "activityRange" }],
      ["a factor above 2.5", { activityFactor: "3" }, { activityFactor: "activityRange" }],
      ["a sex nobody offered", { sex: "other" }, { sex: "invalidSex" }],
    ])("rejects %s", (_label, patch, expected) => {
      expect(errorsOf(patch)).toEqual(expected);
    });

    it.each(["weightKg", "heightCm", "birthDate", "sex", "activityFactor"] as const)(
      "requires %s",
      (field) => {
        expect(errorsOf({ [field]: "   " })).toEqual({ [field]: "required" });
      },
    );
  });

  describe("the limits themselves", () => {
    it("accepts a value sitting exactly on each bound", () => {
      // Inclusive on purpose. An off-by-one here rejects a real person for the
      // sake of a strict inequality nobody chose deliberately.
      for (const [field, bounds] of [
        ["weightKg", PROFILE_LIMITS.weightKg],
        ["heightCm", PROFILE_LIMITS.heightCm],
        ["activityFactor", PROFILE_LIMITS.activityFactor],
      ] as const) {
        for (const bound of [bounds.min, bounds.max]) {
          const result = validateProfileForm({ ...VALID, [field]: String(bound) }, TODAY);
          expect(result.ok, `${field} rejected its own ${bound} bound`).toBe(true);
        }
      }
    });

    it("keeps the activity range the one #14's override promises", () => {
      expect(PROFILE_LIMITS.activityFactor).toEqual({ min: 1, max: 2.5 });
    });
  });

  describe("birth date", () => {
    it("rejects a date in the future", () => {
      expect(errorsOf({ birthDate: "2026-08-19" })).toEqual({ birthDate: "future" });
    });

    it("accepts today, for someone born this morning", () => {
      // Absurd, and still not the form's business to refuse. The equation
      // answers for a newborn; the health notice is what handles the rest.
      const result = validateProfileForm({ ...VALID, birthDate: TODAY }, TODAY);

      expect(result.ok).toBe(true);
    });

    it("rejects a year that would make someone older than anyone has been", () => {
      expect(errorsOf({ birthDate: "1890-01-01" })).toEqual({
        birthDate: "implausibleAge",
      });
    });

    it("accepts an age of exactly the limit", () => {
      const result = validateProfileForm({ ...VALID, birthDate: "1906-08-18" }, TODAY);

      expect(result.ok).toBe(true);
    });

    it.each(["14/03/1995", "1995-3-14", "1995-02-30", "ontem"])(
      "rejects %s rather than throwing",
      (birthDate) => {
        // `parseIsoDate` throws by design. A thrown error is not something the
        // form can render beside a field, so it is caught and named here.
        expect(() => errorsOf({ birthDate })).not.toThrow();
        expect(errorsOf({ birthDate })).toEqual({ birthDate: "notADate" });
      },
    );

    it("does not let a future date reach the age calculation", () => {
      // `ageYearsOn` throws on a future birth date. Order matters: the future
      // check has to come first or the form crashes instead of complaining.
      expect(() => errorsOf({ birthDate: "2030-01-01" })).not.toThrow();
    });
  });

  it("is not fooled by a young age at the boundary of a birthday", () => {
    // 18 tomorrow, so still 17 today — the form accepts both, but the value it
    // passes on has to be the birth date, not a snapshot of the age.
    const result = validateProfileForm({ ...VALID, birthDate: "2008-08-19" }, TODAY);

    expect(result.ok && result.value.birthDate).toBe("2008-08-19");
  });
});
