import { describe, expect, it } from "vitest";

import { MIFFLIN_VALIDITY, SEX_CONSTANT, basalMetabolicRate } from "./bmr";

/**
 * The issue that asked for this (#13) asked for it because the predecessor
 * shipped the sex constant wrong and nobody noticed for a long time.
 *
 * That is worth taking seriously as a testing problem, because one worked
 * example does not actually catch it: a single reference case is satisfied by
 * any of a family of wrong equations that happen to agree at that point. So each
 * coefficient is pinned separately, by the derivative that isolates it — one
 * more kilogram must be worth exactly ten kilocalories whatever else is true —
 * and the sexes are pinned against each other as well as individually.
 */

/** 180 cm, 104 kg, 25, male. The value the predecessor was checked against. */
const REFERENCE = {
  weightKg: 104,
  heightCm: 180,
  ageYears: 25,
  sex: "male",
} as const;

describe("basalMetabolicRate", () => {
  it("matches the reference case", () => {
    // 10(104) + 6.25(180) − 5(25) + 5
    //  = 1040 + 1125 − 125 + 5
    expect(basalMetabolicRate(REFERENCE)).toBe(2045);
  });

  it("matches the published equation term by term", () => {
    const woman = {
      weightKg: 60,
      heightCm: 165,
      ageYears: 30,
      sex: "female",
    } as const;

    // 10(60) + 6.25(165) − 5(30) − 161
    //  = 600 + 1031.25 − 150 − 161
    expect(basalMetabolicRate(woman)).toBeCloseTo(1320.25, 10);
  });

  describe("each coefficient, isolated", () => {
    it("is worth 10 kcal per kilogram", () => {
      const heavier = { ...REFERENCE, weightKg: REFERENCE.weightKg + 1 };

      expect(basalMetabolicRate(heavier) - basalMetabolicRate(REFERENCE)).toBe(10);
    });

    it("is worth 6.25 kcal per centimetre", () => {
      const taller = { ...REFERENCE, heightCm: REFERENCE.heightCm + 1 };

      expect(basalMetabolicRate(taller) - basalMetabolicRate(REFERENCE)).toBeCloseTo(
        6.25,
        10,
      );
    });

    it("is worth −5 kcal per year of age", () => {
      const older = { ...REFERENCE, ageYears: REFERENCE.ageYears + 1 };

      expect(basalMetabolicRate(older) - basalMetabolicRate(REFERENCE)).toBe(-5);
    });

    it("separates the sexes by exactly 166 kcal", () => {
      // The check the predecessor's bug would not have survived. Pinning +5 and
      // −161 individually leaves the pair open to being "tidied" into something
      // symmetrical; pinning the gap as well means no single edit passes.
      const woman = { ...REFERENCE, sex: "female" } as const;

      expect(basalMetabolicRate(REFERENCE) - basalMetabolicRate(woman)).toBe(166);
      expect(SEX_CONSTANT.male).toBe(5);
      expect(SEX_CONSTANT.female).toBe(-161);
    });
  });

  it("does not round", () => {
    // Downstream this is multiplied by an activity factor (#14) and divided into
    // grams (#15). Rounding here is how a macro target drifts away from the
    // energy figure printed beside it.
    const result = basalMetabolicRate({
      weightKg: 70.4,
      heightCm: 173.5,
      ageYears: 41,
      sex: "female",
    });

    expect(result % 1).not.toBe(0);
    expect(result).toBeCloseTo(704 + 1084.375 - 205 - 161, 10);
  });

  describe("input that cannot describe a person", () => {
    it.each([
      ["zero weight", { ...REFERENCE, weightKg: 0 }],
      ["negative weight", { ...REFERENCE, weightKg: -70 }],
      ["zero height", { ...REFERENCE, heightCm: 0 }],
      ["NaN height", { ...REFERENCE, heightCm: Number.NaN }],
      ["infinite weight", { ...REFERENCE, weightKg: Number.POSITIVE_INFINITY }],
      ["negative age", { ...REFERENCE, ageYears: -1 }],
    ])("throws on %s", (_label, input) => {
      expect(() => basalMetabolicRate(input)).toThrow(RangeError);
    });

    it("throws on a sex it has no constant for", () => {
      // Not reachable through the type system, but reachable through IndexedDB:
      // a record written by an older build, or edited by hand. Indexing an
      // unknown key would give `undefined` and quietly return NaN.
      const fromStorage = { ...REFERENCE, sex: "unspecified" } as unknown as {
        weightKg: number;
        heightCm: number;
        ageYears: number;
        sex: "male";
      };

      expect(() => basalMetabolicRate(fromStorage)).toThrow(RangeError);
    });
  });

  it("still answers outside the cohort the equation was fitted to", () => {
    // 19–78 is who Mifflin measured, not a validation range. A 16-year-old gets
    // an estimate plus the disclaimer that tells them to see a professional
    // (#10); returning nothing would be a worse answer than an approximate one.
    const young = { ...REFERENCE, ageYears: MIFFLIN_VALIDITY.minAgeYears - 3 };

    expect(Number.isFinite(basalMetabolicRate(young))).toBe(true);
  });
});
