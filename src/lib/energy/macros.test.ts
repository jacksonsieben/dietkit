import { describe, expect, it } from "vitest";

import {
  ATWATER,
  DEFAULT_MACRO_GOAL,
  MACRO_GOAL_LIMITS,
  adjustedEnergy,
  macroEnergy,
  planMacros,
} from "./macros";
import type { MacroGoal } from "@/lib/storage/types";

/**
 * The failure this file is written against is not a wrong answer, it is a
 * plausible one. Every number here is a small integer count of grams, and a fat
 * factor typed as 4 or a deficit applied to the wrong side of the subtraction
 * produces targets that still look like targets. So the arithmetic is pinned
 * from both ends: the grams are checked against a hand-computed example, and
 * the grams are independently checked to be worth the energy they claim.
 */

/** 80 kg, 2500 kcal/day, 500 below maintenance. Chosen to land on integers. */
const CLEAN: Parameters<typeof planMacros>[0] = {
  totalDailyEnergyExpenditure: 2500,
  weightKg: 80,
  goal: {
    adjustment: { kind: "kcal", value: -500 },
    proteinGPerKg: 2,
    fatGPerKg: 1,
  },
};

describe("ATWATER", () => {
  it("is 4, 4 and 9 kcal per gram", () => {
    expect(ATWATER.proteinKcalPerG).toBe(4);
    expect(ATWATER.carbKcalPerG).toBe(4);
    expect(ATWATER.fatKcalPerG).toBe(9);
  });

  it("prices fat 5 kcal above the other two", () => {
    // Pinned as a gap as well as individually: the single most likely edit here
    // is fat quietly becoming a 4 like its neighbours, and that survives any
    // test that only reads one constant at a time.
    expect(ATWATER.fatKcalPerG - ATWATER.proteinKcalPerG).toBe(5);
    expect(ATWATER.fatKcalPerG - ATWATER.carbKcalPerG).toBe(5);
  });
});

describe("macroEnergy", () => {
  it("adds up the three factors", () => {
    // 100(4) + 200(4) + 50(9) = 400 + 800 + 450
    expect(macroEnergy({ proteinG: 100, carbG: 200, fatG: 50 })).toBe(1650);
  });

  it("is zero for nothing", () => {
    expect(macroEnergy({ proteinG: 0, carbG: 0, fatG: 0 })).toBe(0);
  });
});

describe("adjustedEnergy", () => {
  it("subtracts an absolute deficit", () => {
    expect(adjustedEnergy(2500, { kind: "kcal", value: -500 })).toBe(2000);
  });

  it("adds an absolute surplus", () => {
    expect(adjustedEnergy(2500, { kind: "kcal", value: 300 })).toBe(2800);
  });

  it("takes a percentage off", () => {
    expect(adjustedEnergy(2500, { kind: "percent", value: -20 })).toBeCloseTo(2000, 10);
  });

  it("puts a percentage on", () => {
    expect(adjustedEnergy(2500, { kind: "percent", value: 10 })).toBeCloseTo(2750, 10);
  });

  it("leaves maintenance alone, whichever way it was expressed", () => {
    expect(adjustedEnergy(2477.5, { kind: "kcal", value: 0 })).toBe(2477.5);
    expect(adjustedEnergy(2477.5, { kind: "percent", value: 0 })).toBe(2477.5);
  });

  it("keeps a percentage proportional and an absolute figure not", () => {
    // The reason `kind` is stored rather than normalised to kilocalories: after
    // a change in bodyweight moves TDEE, one of these two follows and the other
    // deliberately does not.
    const percent = { kind: "percent", value: -20 } as const;
    const kcal = { kind: "kcal", value: -500 } as const;

    expect(adjustedEnergy(2000, percent)).toBeCloseTo(1600, 10);
    expect(adjustedEnergy(3000, percent)).toBeCloseTo(2400, 10);
    expect(adjustedEnergy(2000, kcal)).toBe(1500);
    expect(adjustedEnergy(3000, kcal)).toBe(2500);
  });

  it.each([
    ["a deficit deeper than the limit", { kind: "percent", value: -41 } as const],
    ["a surplus above the limit", { kind: "kcal", value: 1501 } as const],
    ["NaN", { kind: "kcal", value: Number.NaN } as const],
  ])("throws on %s", (_label, adjustment) => {
    expect(() => adjustedEnergy(2500, adjustment)).toThrow(RangeError);
  });

  it("throws on an expenditure that cannot be one", () => {
    expect(() => adjustedEnergy(0, { kind: "kcal", value: 0 })).toThrow(RangeError);
  });
});

describe("planMacros", () => {
  it("matches the worked example", () => {
    // 2500 − 500 = 2000 kcal. 80 kg × 2 = 160 g protein (640 kcal); 80 kg × 1
    // = 80 g fat (720 kcal); 2000 − 640 − 720 = 640 kcal left, ÷ 4 = 160 g carb.
    const plan = planMacros(CLEAN);

    expect(plan.targetKcal).toBe(2000);
    expect(plan.targets).toEqual({
      kcal: 2000,
      proteinG: 160,
      carbG: 160,
      fatG: 80,
    });
  });

  it("reports the adjustment in kilocalories even when it was a percentage", () => {
    const plan = planMacros({
      ...CLEAN,
      goal: { ...CLEAN.goal, adjustment: { kind: "percent", value: -20 } },
    });

    expect(plan.adjustmentKcal).toBeCloseTo(-500, 10);
    expect(plan.targetKcal).toBeCloseTo(2000, 10);
  });

  describe("carbohydrate is the remainder", () => {
    it("gives up 4 kcal of carbohydrate per extra gram of protein", () => {
      const richer = planMacros({
        ...CLEAN,
        goal: { ...CLEAN.goal, proteinGPerKg: CLEAN.goal.proteinGPerKg + 1 },
      });
      const base = planMacros(CLEAN);

      // +1 g/kg over 80 kg is 80 g of protein, worth 320 kcal, which is 80 g of
      // carbohydrate.
      expect(richer.exact.proteinG - base.exact.proteinG).toBeCloseTo(80, 10);
      expect(richer.exact.carbG - base.exact.carbG).toBeCloseTo(-80, 10);
    });

    it("gives up 9 kcal of carbohydrate per extra gram of fat", () => {
      const fattier = planMacros({
        ...CLEAN,
        goal: { ...CLEAN.goal, fatGPerKg: CLEAN.goal.fatGPerKg + 0.5 },
      });
      const base = planMacros(CLEAN);

      // +0.5 g/kg over 80 kg is 40 g of fat, worth 360 kcal — 90 g of carbohydrate.
      expect(fattier.exact.fatG - base.exact.fatG).toBeCloseTo(40, 10);
      expect(fattier.exact.carbG - base.exact.carbG).toBeCloseTo(-90, 10);
    });

    it("scales protein and fat with bodyweight and not with energy", () => {
      const heavier = planMacros({ ...CLEAN, weightKg: 90 });

      expect(heavier.exact.proteinG).toBeCloseTo(180, 10);
      expect(heavier.exact.fatG).toBeCloseTo(90, 10);
      // Same target, more protein and fat, so the remainder has to shrink.
      expect(heavier.targetKcal).toBe(planMacros(CLEAN).targetKcal);
      expect(heavier.exact.carbG).toBeLessThan(planMacros(CLEAN).exact.carbG);
    });
  });

  describe("reconciliation", () => {
    const AWKWARD: Parameters<typeof planMacros>[0] = {
      totalDailyEnergyExpenditure: 2477.5,
      weightKg: 72.4,
      goal: {
        adjustment: { kind: "percent", value: -15 },
        proteinGPerKg: 1.8,
        fatGPerKg: 0.9,
      },
    };

    it("prices the stored targets from their own grams, not from the goal", () => {
      // The invariant that keeps #21 honest: whatever else is true, a MacroSet
      // must be worth what its own grams are worth. If `kcal` were copied from
      // the target instead, every diet built against it would fail to add up.
      const { targets } = planMacros(AWKWARD);

      expect(targets.kcal).toBe(macroEnergy(targets));
      expect(targets.kcal).toBe(2105);
    });

    it("keeps the grams whole", () => {
      const { targets } = planMacros(AWKWARD);

      expect(targets.proteinG % 1).toBe(0);
      expect(targets.carbG % 1).toBe(0);
      expect(targets.fatG % 1).toBe(0);
    });

    it("does not round the exact grams it rounded them from", () => {
      const { exact } = planMacros(AWKWARD);

      expect(exact.proteinG).toBeCloseTo(130.32, 10);
      expect(exact.fatG).toBeCloseTo(65.16, 10);
      expect(exact.carbG % 1).not.toBe(0);
    });

    it("reports the rounding drift instead of swallowing it", () => {
      const plan = planMacros(AWKWARD);

      // 2105 on the plate against 2105.875 asked for.
      expect(plan.targetKcal).toBeCloseTo(2105.875, 10);
      expect(plan.driftKcal).toBeCloseTo(-0.875, 10);
      expect(plan.driftKcal).toBeCloseTo(plan.targets.kcal - plan.targetKcal, 10);
    });

    it("keeps the drift within what rounding three grams can cost", () => {
      // Half a gram each way is at most 0.5(4) + 0.5(4) + 0.5(9) = 8.5 kcal.
      // A drift outside that is not rounding, it is a bug in the split.
      // Expenditure is scaled with the body rather than held at CLEAN's 2500:
      // a 140 kg person on a fixed 2500 kcal is not a rounding case, it is an
      // unreachable goal, and it belongs in the shortfall tests below.
      for (let weightKg = 45; weightKg <= 140; weightKg += 0.5) {
        const plan = planMacros({
          ...CLEAN,
          weightKg,
          totalDailyEnergyExpenditure: 33 * weightKg,
        });

        expect(Math.abs(plan.driftKcal)).toBeLessThanOrEqual(8.5);
        expect(plan.carbShortfallKcal).toBe(0);
      }
    });
  });

  describe("a goal that does not fit", () => {
    /** 90 kg on 3 g/kg protein and 2 g/kg fat — 2700 kcal before any carbohydrate. */
    const IMPOSSIBLE: Parameters<typeof planMacros>[0] = {
      totalDailyEnergyExpenditure: 1600,
      weightKg: 90,
      goal: {
        adjustment: { kind: "percent", value: -40 },
        proteinGPerKg: 3,
        fatGPerKg: 2,
      },
    };

    it("floors carbohydrate at zero rather than printing a negative", () => {
      const plan = planMacros(IMPOSSIBLE);

      expect(plan.exact.carbG).toBe(0);
      expect(plan.targets.carbG).toBe(0);
    });

    it("says how much energy would not fit", () => {
      const plan = planMacros(IMPOSSIBLE);

      // 1600 × 0.6 = 960 kcal asked for; 270 g protein and 180 g fat cost 2700.
      expect(plan.targetKcal).toBeCloseTo(960, 10);
      expect(plan.carbShortfallKcal).toBeCloseTo(1740, 10);
    });

    it("keeps the shortfall out of the ordinary case", () => {
      expect(planMacros(CLEAN).carbShortfallKcal).toBe(0);
    });
  });

  describe("input that cannot describe a goal", () => {
    const withGoal = (goal: Partial<MacroGoal>) => ({
      ...CLEAN,
      goal: { ...CLEAN.goal, ...goal },
    });

    it.each([
      ["zero weight", { ...CLEAN, weightKg: 0 }],
      ["negative weight", { ...CLEAN, weightKg: -80 }],
      ["protein below the limit", withGoal({ proteinGPerKg: 0.4 })],
      ["protein above the limit", withGoal({ proteinGPerKg: 4.1 })],
      ["fat below the limit", withGoal({ fatGPerKg: 0.2 })],
      ["fat above the limit", withGoal({ fatGPerKg: 2.6 })],
      ["a NaN coefficient", withGoal({ fatGPerKg: Number.NaN })],
      [
        "an adjustment past the limit",
        withGoal({ adjustment: { kind: "kcal", value: -2000 } }),
      ],
    ])("throws on %s", (_label, input) => {
      expect(() => planMacros(input)).toThrow(RangeError);
    });

    it("throws rather than returning a target of zero or less", () => {
      // Reachable inside the limits: 1200 kcal of expenditure with the largest
      // absolute deficit the form allows.
      expect(() =>
        planMacros({
          totalDailyEnergyExpenditure: 1200,
          weightKg: 50,
          goal: {
            adjustment: { kind: "kcal", value: -1500 },
            proteinGPerKg: 1.8,
            fatGPerKg: 1,
          },
        }),
      ).toThrow(RangeError);
    });
  });
});

describe("DEFAULT_MACRO_GOAL", () => {
  it("is maintenance", () => {
    expect(DEFAULT_MACRO_GOAL.adjustment.value).toBe(0);
  });

  it("sits inside the limits the form enforces", () => {
    // A default outside its own bounds would hand the user a form that refuses
    // to save until they change a value they never chose.
    expect(DEFAULT_MACRO_GOAL.proteinGPerKg).toBeGreaterThanOrEqual(
      MACRO_GOAL_LIMITS.proteinGPerKg.min,
    );
    expect(DEFAULT_MACRO_GOAL.proteinGPerKg).toBeLessThanOrEqual(
      MACRO_GOAL_LIMITS.proteinGPerKg.max,
    );
    expect(DEFAULT_MACRO_GOAL.fatGPerKg).toBeGreaterThanOrEqual(
      MACRO_GOAL_LIMITS.fatGPerKg.min,
    );
    expect(DEFAULT_MACRO_GOAL.fatGPerKg).toBeLessThanOrEqual(
      MACRO_GOAL_LIMITS.fatGPerKg.max,
    );
  });

  it("plans without argument", () => {
    const plan = planMacros({ ...CLEAN, goal: DEFAULT_MACRO_GOAL });

    expect(plan.targetKcal).toBe(CLEAN.totalDailyEnergyExpenditure);
    expect(plan.targets.carbG).toBeGreaterThan(0);
  });
});
