import { describe, expect, it } from "vitest";

import {
  ATWATER,
  DEFAULT_MACRO_GOAL,
  FAT_FLOOR_PERCENT,
  GOAL_PRESETS,
  MACRO_GOAL_LIMITS,
  adjustedEnergy,
  fatEnergy,
  goalSign,
  macroEnergy,
  planMacros,
} from "./macros";
import { GOAL_KINDS, type MacroGoal } from "@/lib/storage/types";

/**
 * The failure this file is written against is not a wrong answer, it is a
 * plausible one. Every number here is a small integer count of grams, and a fat
 * factor typed as 4 or a deficit applied to the wrong side of the subtraction
 * produces targets that still look like targets. So the arithmetic is pinned
 * from both ends: the grams are checked against a hand-computed example, and
 * the grams are independently checked to be worth the energy they claim.
 */

/**
 * 80 kg, 2500 kcal/day, 500 below maintenance, 36% of the target from fat.
 * Chosen so every step lands on an integer: 2000 kcal, 160 g protein, 80 g fat,
 * 160 g carbohydrate.
 */
const CLEAN: Parameters<typeof planMacros>[0] = {
  totalDailyEnergyExpenditure: 2500,
  weightKg: 80,
  goal: {
    kind: "lose",
    adjustment: { unit: "kcal", value: 500 },
    proteinGPerKg: 2,
    fat: { unit: "percent", value: 36 },
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

describe("goalSign", () => {
  it("puts the direction in the goal and nowhere else", () => {
    // The whole reason no field in this app asks a human to type a minus.
    expect(goalSign("lose")).toBe(-1);
    expect(goalSign("maintain")).toBe(0);
    expect(goalSign("gain")).toBe(1);
  });
});

describe("adjustedEnergy", () => {
  /** The two fields `adjustedEnergy` actually reads, without the rest of a goal. */
  const at = (
    kind: MacroGoal["kind"],
    unit: MacroGoal["adjustment"]["unit"],
    value: number,
  ) => ({ kind, adjustment: { unit, value } });

  it("subtracts on a cut and adds on a bulk, from the same unsigned number", () => {
    expect(adjustedEnergy(2500, at("lose", "kcal", 500))).toBe(2000);
    expect(adjustedEnergy(2500, at("gain", "kcal", 500))).toBe(3000);
  });

  it("takes a percentage off and puts one on", () => {
    expect(adjustedEnergy(2500, at("lose", "percent", 20))).toBeCloseTo(2000, 10);
    expect(adjustedEnergy(2500, at("gain", "percent", 10))).toBeCloseTo(2750, 10);
  });

  it("leaves maintenance alone, whichever unit it was stored in", () => {
    // And the stored magnitude is a zero, which is deliberately outside the
    // unsigned bounds — so maintenance has to return before they are checked.
    expect(adjustedEnergy(2477.5, at("maintain", "kcal", 0))).toBe(2477.5);
    expect(adjustedEnergy(2477.5, at("maintain", "percent", 0))).toBe(2477.5);
  });

  it("ignores a stale magnitude left over from another goal", () => {
    // The box is hidden on maintenance but its value survives in state, and an
    // import can carry anything at all. Maintenance means maintenance.
    expect(adjustedEnergy(2500, at("maintain", "kcal", 500))).toBe(2500);
  });

  it("keeps a percentage proportional and an absolute figure not", () => {
    // The reason the unit is stored rather than normalised to kilocalories:
    // after a change in bodyweight moves TDEE, one of these two follows and the
    // other deliberately does not.
    const percent = at("lose", "percent", 20);
    const kcal = at("lose", "kcal", 500);

    expect(adjustedEnergy(2000, percent)).toBeCloseTo(1600, 10);
    expect(adjustedEnergy(3000, percent)).toBeCloseTo(2400, 10);
    expect(adjustedEnergy(2000, kcal)).toBe(1500);
    expect(adjustedEnergy(3000, kcal)).toBe(2500);
  });

  it.each([
    ["a deficit deeper than the limit", at("lose", "percent", 41)],
    ["a surplus above the limit", at("gain", "kcal", 1501)],
    ["a magnitude of zero on a goal that needs one", at("lose", "kcal", 0)],
    ["a magnitude with a sign of its own", at("lose", "kcal", -500)],
    ["NaN", at("gain", "kcal", Number.NaN)],
  ])("throws on %s", (_label, goal) => {
    expect(() => adjustedEnergy(2500, goal)).toThrow(RangeError);
  });

  it("throws on an expenditure that cannot be one", () => {
    expect(() => adjustedEnergy(0, at("maintain", "kcal", 0))).toThrow(RangeError);
  });
});

describe("fatEnergy", () => {
  it("takes a share of the target when it is a percentage", () => {
    expect(fatEnergy({ unit: "percent", value: 25 }, 2000)).toBe(500);
    expect(fatEnergy({ unit: "percent", value: 25 }, 3000)).toBe(750);
  });

  it("stays put when it is an absolute figure", () => {
    expect(fatEnergy({ unit: "kcal", value: 600 }, 2000)).toBe(600);
    expect(fatEnergy({ unit: "kcal", value: 600 }, 3000)).toBe(600);
  });
});

describe("planMacros", () => {
  it("matches the worked example", () => {
    // 2500 − 500 = 2000 kcal. 80 kg × 2 = 160 g protein (640 kcal); 36% of 2000
    // = 720 kcal of fat, ÷ 9 = 80 g; 2000 − 640 − 720 = 640 kcal left, ÷ 4 =
    // 160 g carbohydrate.
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
      goal: { ...CLEAN.goal, adjustment: { unit: "percent", value: 20 } },
    });

    expect(plan.adjustmentKcal).toBeCloseTo(-500, 10);
    expect(plan.targetKcal).toBeCloseTo(2000, 10);
  });

  it("signs the adjustment from the goal, not from the number typed", () => {
    const cut = planMacros(CLEAN);
    const bulk = planMacros({ ...CLEAN, goal: { ...CLEAN.goal, kind: "gain" } });

    expect(cut.adjustmentKcal).toBe(-500);
    expect(bulk.adjustmentKcal).toBe(500);
  });

  describe("fat as a share of the energy", () => {
    it("scales the grams with the target", () => {
      // The point of expressing fat as a percentage: deepen the cut and the fat
      // comes down with it, instead of a fixed g/kg quietly eating a larger and
      // larger slice of a shrinking target.
      const shallow = planMacros({
        ...CLEAN,
        goal: { ...CLEAN.goal, adjustment: { unit: "kcal", value: 100 } },
      });
      const deep = planMacros(CLEAN);

      expect(deep.targetKcal).toBeLessThan(shallow.targetKcal);
      expect(deep.exact.fatG).toBeLessThan(shallow.exact.fatG);
      expect(deep.fatShare).toBeCloseTo(shallow.fatShare, 10);
    });

    it("holds an absolute figure still while the target moves", () => {
      const goal: MacroGoal = { ...CLEAN.goal, fat: { unit: "kcal", value: 600 } };
      const shallow = planMacros({
        ...CLEAN,
        goal: { ...goal, adjustment: { unit: "kcal", value: 100 } },
      });
      const deep = planMacros({ ...CLEAN, goal });

      expect(deep.exact.fatG).toBeCloseTo(shallow.exact.fatG, 10);
      expect(deep.fatShare).toBeGreaterThan(shallow.fatShare);
    });

    it("reports the share as a fraction of the target", () => {
      expect(planMacros(CLEAN).fatShare).toBeCloseTo(0.36, 10);
    });

    it("says nothing about the floor in the ordinary case", () => {
      expect(planMacros(CLEAN).fatBelowFloor).toBe(false);
    });

    it("flags a fat figure that lands under the floor", () => {
      // Only reachable through the kcal unit — as a percentage the form will
      // not take anything under `FAT_FLOOR_PERCENT`. 200 kcal of a 2000 kcal
      // target is 10%.
      const plan = planMacros({
        ...CLEAN,
        goal: { ...CLEAN.goal, fat: { unit: "kcal", value: 200 } },
      });

      expect(plan.fatShare).toBeCloseTo(0.1, 10);
      expect(plan.fatBelowFloor).toBe(true);
    });

    it("puts the flag exactly at the floor and not a step before it", () => {
      // 15% of 2000 is 300 kcal. The boundary itself is allowed; a shade under
      // it is not.
      const at = (value: number) =>
        planMacros({ ...CLEAN, goal: { ...CLEAN.goal, fat: { unit: "kcal", value } } });

      expect(FAT_FLOOR_PERCENT).toBe(15);
      expect(at(300).fatBelowFloor).toBe(false);
      expect(at(299).fatBelowFloor).toBe(true);
    });
  });

  describe("carbohydrate is the remainder", () => {
    it("gives up 4 kcal of carbohydrate per extra gram of protein", () => {
      const richer = planMacros({
        ...CLEAN,
        goal: { ...CLEAN.goal, proteinGPerKg: CLEAN.goal.proteinGPerKg + 1 },
      });
      const base = planMacros(CLEAN);

      // +1 g/kg over 80 kg is 80 g of protein, worth 320 kcal — which comes
      // straight out of the carbohydrate, gram for kilocalorie.
      expect(richer.targets.proteinG - base.targets.proteinG).toBe(80);
      expect(base.targets.carbG - richer.targets.carbG).toBe(80);
    });

    it("gives up carbohydrate to fat at 9 kcal a gram", () => {
      // 5 points of a 2000 kcal target is 100 kcal: 11.1 g of fat bought with
      // 25 g of carbohydrate.
      const fattier = planMacros({
        ...CLEAN,
        goal: { ...CLEAN.goal, fat: { unit: "percent", value: 41 } },
      });
      const base = planMacros(CLEAN);

      expect(fattier.exact.fatG - base.exact.fatG).toBeCloseTo(100 / 9, 10);
      expect(base.exact.carbG - fattier.exact.carbG).toBeCloseTo(25, 10);
    });

    it("leaves the grams worth what the target asked for", () => {
      // The end-to-end check: whatever the split, the exact grams price back to
      // the target. A factor used in one direction and not the other breaks
      // here even when every individual number still looks reasonable.
      const { exact, targetKcal } = planMacros(CLEAN);

      expect(macroEnergy(exact)).toBeCloseTo(targetKcal, 10);
    });
  });

  describe("rounding", () => {
    /** Deliberately awkward: nothing here divides evenly. */
    const AWKWARD: Parameters<typeof planMacros>[0] = {
      totalDailyEnergyExpenditure: 2333,
      weightKg: 72.4,
      goal: {
        kind: "lose",
        adjustment: { unit: "percent", value: 13 },
        proteinGPerKg: 1.8,
        fat: { unit: "percent", value: 27 },
      },
    };

    it("hands out whole grams", () => {
      // Nobody weighs 130.32 g of chicken.
      const { targets } = planMacros(AWKWARD);

      expect(targets.proteinG % 1).toBe(0);
      expect(targets.carbG % 1).toBe(0);
      expect(targets.fatG % 1).toBe(0);
    });

    it("does not round the exact grams it rounded them from", () => {
      const { exact } = planMacros(AWKWARD);

      expect(exact.proteinG).toBeCloseTo(130.32, 10);
      expect(exact.fatG).toBeCloseTo(60.8913, 10);
      expect(exact.carbG % 1).not.toBe(0);
    });

    it("reports the rounding drift instead of swallowing it", () => {
      const plan = planMacros(AWKWARD);

      // 2029 on the plate against 2029.71 asked for.
      expect(plan.targetKcal).toBeCloseTo(2029.71, 10);
      expect(plan.targets.kcal).toBe(2029);
      expect(plan.driftKcal).toBeCloseTo(-0.71, 10);
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
    /** 90 kg on 3 g/kg of protein against a 40% cut — 1080 kcal before any fat. */
    const IMPOSSIBLE: Parameters<typeof planMacros>[0] = {
      totalDailyEnergyExpenditure: 1600,
      weightKg: 90,
      goal: {
        kind: "lose",
        adjustment: { unit: "percent", value: 40 },
        proteinGPerKg: 3,
        fat: { unit: "percent", value: 60 },
      },
    };

    it("floors carbohydrate at zero rather than printing a negative", () => {
      const plan = planMacros(IMPOSSIBLE);

      expect(plan.exact.carbG).toBe(0);
      expect(plan.targets.carbG).toBe(0);
    });

    it("says how much energy would not fit", () => {
      const plan = planMacros(IMPOSSIBLE);

      // 1600 × 0.6 = 960 kcal asked for; 270 g of protein costs 1080 and 60% of
      // the target is another 576.
      expect(plan.targetKcal).toBeCloseTo(960, 10);
      expect(plan.carbShortfallKcal).toBeCloseTo(696, 10);
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
      ["a fat share under the floor", withGoal({ fat: { unit: "percent", value: 14 } })],
      ["a fat share above the limit", withGoal({ fat: { unit: "percent", value: 61 } })],
      ["a fat figure below the limit", withGoal({ fat: { unit: "kcal", value: 99 } })],
      ["a fat figure above the limit", withGoal({ fat: { unit: "kcal", value: 2001 } })],
      ["a NaN coefficient", withGoal({ proteinGPerKg: Number.NaN })],
      [
        "an adjustment past the limit",
        withGoal({ adjustment: { unit: "kcal", value: 2000 } }),
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
            kind: "lose",
            adjustment: { unit: "kcal", value: 1500 },
            proteinGPerKg: 1.8,
            fat: { unit: "percent", value: 30 },
          },
        }),
      ).toThrow(RangeError);
    });
  });
});

describe("GOAL_PRESETS", () => {
  it("has one for every goal, labelled with its own name", () => {
    for (const kind of GOAL_KINDS) {
      expect(GOAL_PRESETS[kind].kind).toBe(kind);
    }
  });

  it("keeps maintenance at maintenance", () => {
    expect(GOAL_PRESETS.maintain.adjustment.value).toBe(0);
  });

  it("moves the same distance either side of it", () => {
    // 500 kcal each way. Not a law of nature, but a preset that cut by 500 and
    // bulked by 200 would be making a judgement nobody asked it to make.
    expect(GOAL_PRESETS.lose.adjustment).toEqual({ unit: "kcal", value: 500 });
    expect(GOAL_PRESETS.gain.adjustment).toEqual({ unit: "kcal", value: 500 });
  });

  it("raises protein as energy gets scarcer or training gets harder", () => {
    // Maintenance is the floor of the three: a cut needs protein to protect
    // lean mass, and a bulk needs it to build any.
    expect(GOAL_PRESETS.lose.proteinGPerKg).toBeGreaterThan(
      GOAL_PRESETS.maintain.proteinGPerKg,
    );
    expect(GOAL_PRESETS.gain.proteinGPerKg).toBeGreaterThan(
      GOAL_PRESETS.lose.proteinGPerKg,
    );
  });

  it("expresses fat as a share, above the floor and inside the guidance", () => {
    // ISSN/ACSM: 20–25% cutting, 25–30% maintaining, 20–30% gaining, never
    // under 15–20%. A preset outside those is the one number here a user is
    // least equipped to second-guess.
    for (const kind of GOAL_KINDS) {
      const fat = GOAL_PRESETS[kind].fat;

      expect(fat.unit).toBe("percent");
      expect(fat.value).toBeGreaterThan(FAT_FLOOR_PERCENT);
      expect(fat.value).toBeLessThanOrEqual(30);
    }
  });

  it("sits inside the limits the form enforces", () => {
    // A preset outside its own bounds would hand the user a form that opens on
    // an error they never typed and refuses to save until they fix it.
    for (const kind of GOAL_KINDS) {
      const goal = GOAL_PRESETS[kind];

      expect(goal.proteinGPerKg).toBeGreaterThanOrEqual(
        MACRO_GOAL_LIMITS.proteinGPerKg.min,
      );
      expect(goal.proteinGPerKg).toBeLessThanOrEqual(MACRO_GOAL_LIMITS.proteinGPerKg.max);
      expect(goal.fat.value).toBeGreaterThanOrEqual(MACRO_GOAL_LIMITS.fatPercent.min);
      expect(goal.fat.value).toBeLessThanOrEqual(MACRO_GOAL_LIMITS.fatPercent.max);
    }
  });

  it("plans a real diet for every goal", () => {
    for (const kind of GOAL_KINDS) {
      const plan = planMacros({ ...CLEAN, goal: GOAL_PRESETS[kind] });

      expect(plan.targets.carbG).toBeGreaterThan(0);
      expect(plan.carbShortfallKcal).toBe(0);
      expect(plan.fatBelowFloor).toBe(false);
    }
  });
});

describe("DEFAULT_MACRO_GOAL", () => {
  it("is maintenance", () => {
    // The goal that assumes least about someone the app has never met.
    expect(DEFAULT_MACRO_GOAL).toBe(GOAL_PRESETS.maintain);
  });

  it("plans without argument", () => {
    const plan = planMacros({ ...CLEAN, goal: DEFAULT_MACRO_GOAL });

    expect(plan.targetKcal).toBe(CLEAN.totalDailyEnergyExpenditure);
    expect(plan.targets.carbG).toBeGreaterThan(0);
  });
});
