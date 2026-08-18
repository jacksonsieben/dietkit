import { describe, expect, it } from "vitest";

import { ACTIVITY_LEVELS } from "@/lib/profile/activity";

import { basalMetabolicRate } from "./bmr";
import { ACTIVITY_FACTOR_RANGE, totalDailyEnergyExpenditure } from "./tdee";

/** 180 cm, 104 kg, 25, male — BMR 2045, the case bmr.test.ts pins. */
const REFERENCE_BMR = basalMetabolicRate({
  weightKg: 104,
  heightCm: 180,
  ageYears: 25,
  sex: "male",
});

describe("totalDailyEnergyExpenditure", () => {
  it("multiplies the resting cost by the factor", () => {
    expect(totalDailyEnergyExpenditure(2045, 1.55)).toBeCloseTo(3169.75, 10);
  });

  it("is the identity at a factor of 1", () => {
    // The floor of the range, and a meaningful one: a factor of 1 says the
    // person spends exactly their basal rate, which is what the number is
    // scaled from. Anything below it would be a body costing less than resting.
    expect(totalDailyEnergyExpenditure(2045, ACTIVITY_FACTOR_RANGE.min)).toBe(2045);
  });

  it("does not round", () => {
    // #15 subtracts a deficit from this and divides the rest into grams.
    // Rounding here is how a macro target drifts from the kcal beside it.
    const result = totalDailyEnergyExpenditure(1847.5, 1.375);

    expect(result % 1).not.toBe(0);
    expect(result).toBeCloseTo(2540.3125, 10);
  });

  it.each(ACTIVITY_LEVELS)("accepts the $id rung", ({ factor }) => {
    expect(totalDailyEnergyExpenditure(REFERENCE_BMR, factor)).toBeCloseTo(
      REFERENCE_BMR * factor,
      10,
    );
  });

  describe("the disagreement #14 exists to make visible", () => {
    it("moves the answer by hundreds of kcal for one rung", () => {
      // The issue's claim, pinned: the same self-described week costs very
      // differently depending on which rung a calculator files it under. This
      // is why the factor is shown next to the result rather than hidden — the
      // difference between us and another site is a convention, not a bug, and
      // a user can only reconcile the two if both numbers are on screen.
      const light = totalDailyEnergyExpenditure(REFERENCE_BMR, 1.375);
      const moderate = totalDailyEnergyExpenditure(REFERENCE_BMR, 1.55);

      expect(moderate - light).toBeGreaterThan(300);
    });

    it("spans over a thousand kcal across the whole ladder", () => {
      const first = ACTIVITY_LEVELS[0];
      const last = ACTIVITY_LEVELS[ACTIVITY_LEVELS.length - 1];

      const bottom = totalDailyEnergyExpenditure(REFERENCE_BMR, first.factor);
      const top = totalDailyEnergyExpenditure(REFERENCE_BMR, last.factor);

      expect(top - bottom).toBeGreaterThan(1000);
    });
  });

  describe("input that cannot describe a person", () => {
    it.each([
      ["zero BMR", 0, 1.55],
      ["negative BMR", -2045, 1.55],
      ["NaN BMR", Number.NaN, 1.55],
      ["a factor below the floor", 2045, 0.9],
      ["a factor above the ceiling", 2045, 2.6],
      ["a factor of zero", 2045, 0],
      ["a NaN factor", 2045, Number.NaN],
      ["an infinite factor", 2045, Number.POSITIVE_INFINITY],
    ])("throws on %s", (_label, bmr, factor) => {
      expect(() => totalDailyEnergyExpenditure(bmr, factor)).toThrow(RangeError);
    });

    it("accepts both ends of the range it documents", () => {
      // A boundary stated as "1.0–2.5" that rejects 2.5 is a lie told to the
      // one user who typed it.
      expect(() =>
        totalDailyEnergyExpenditure(2045, ACTIVITY_FACTOR_RANGE.min),
      ).not.toThrow();
      expect(() =>
        totalDailyEnergyExpenditure(2045, ACTIVITY_FACTOR_RANGE.max),
      ).not.toThrow();
    });
  });

  it("covers every rung with the range it advertises", () => {
    // The custom override (#14) and the ladder share one bound. A rung outside
    // the range would be a value the picker offers and the calculation refuses.
    for (const level of ACTIVITY_LEVELS) {
      expect(level.factor).toBeGreaterThanOrEqual(ACTIVITY_FACTOR_RANGE.min);
      expect(level.factor).toBeLessThanOrEqual(ACTIVITY_FACTOR_RANGE.max);
    }
  });
});
