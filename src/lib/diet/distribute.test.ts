import { describe, expect, it } from "vitest";

import { macroEnergy } from "@/lib/energy/macros";
import type { MacroSet, Meal } from "@/lib/storage/types";

import { distributeTargets, sharePercents } from "./distribute";
import { mealsFromNames, setShare } from "./meals";

/**
 * The failure this file is written against is a table that does not add up.
 * Rounding five meals to whole grams and printing the day's target above them
 * is a discrepancy the user finds with a calculator and we would never see in a
 * screenshot, so the column totals are checked for every macro in every case
 * here — including the ones where the shares are deliberately awkward.
 */

/** Whole grams, and 4/4/9 of them is 2.151 kcal exactly. */
const DAY: MacroSet = { proteinG: 187, carbG: 200, fatG: 67, kcal: 2151 };

function plan(count: number): Meal[] {
  return mealsFromNames(
    Array.from({ length: count }, (_, index) => ({
      id: String(index),
      name: String(index),
    })),
  );
}

function total(rows: { targets: MacroSet }[], macro: keyof MacroSet): number {
  return rows.reduce((sum, row) => sum + row.targets[macro], 0);
}

describe("distributeTargets", () => {
  it("splits an awkward target into whole grams that still total the day", () => {
    const rows = distributeTargets(DAY, plan(5));

    expect(rows.map((row) => row.targets.proteinG)).toEqual([
      38, 38, 37, 37, 37,
    ]);
    expect(total(rows, "proteinG")).toBe(DAY.proteinG);
    expect(total(rows, "carbG")).toBe(DAY.carbG);
    expect(total(rows, "fatG")).toBe(DAY.fatG);
  });

  it("totals the day in kilocalories too", () => {
    // Holds because each row is priced from its own grams and the day's `kcal`
    // is what its own rounded grams are worth — see `planMacros`.
    const rows = distributeTargets(DAY, plan(3));

    expect(total(rows, "kcal")).toBe(DAY.kcal);
  });

  it("prices each meal from the grams printed beside it", () => {
    const rows = distributeTargets(DAY, plan(4));

    for (const row of rows) {
      expect(row.targets.kcal).toBe(macroEnergy(row.targets));
    }
  });

  it("follows shares that are not even", () => {
    const rows = distributeTargets(DAY, setShare(plan(2), "0", 0.75));

    expect(rows[0].share).toBeCloseTo(0.75, 10);
    expect(rows[0].targets.proteinG).toBe(140);
    expect(rows[1].targets.proteinG).toBe(47);
    expect(total(rows, "proteinG")).toBe(DAY.proteinG);
  });

  it("gives a meal at zero percent nothing, and the day to the rest", () => {
    const rows = distributeTargets(DAY, setShare(plan(3), "0", 0));

    expect(rows[0].targets).toEqual({
      proteinG: 0,
      carbG: 0,
      fatG: 0,
      kcal: 0,
    });
    expect(total(rows, "proteinG")).toBe(DAY.proteinG);
    expect(total(rows, "kcal")).toBe(DAY.kcal);
  });

  it("normalises stored shares rather than trusting them", () => {
    // A record whose shares add to 0,5: the day would otherwise arrive halved.
    const drifted: Meal[] = [
      { id: "a", name: "a", share: 0.25, items: [] },
      { id: "b", name: "b", share: 0.25, items: [] },
    ];

    const rows = distributeTargets(DAY, drifted);

    expect(total(rows, "proteinG")).toBe(DAY.proteinG);
    expect(rows.map((row) => row.share)).toEqual([0.5, 0.5]);
  });

  it("holds for any meal count this app will draw", () => {
    for (let count = 1; count <= 12; count += 1) {
      const rows = distributeTargets(DAY, plan(count));

      expect(rows).toHaveLength(count);
      expect(total(rows, "proteinG")).toBe(DAY.proteinG);
      expect(total(rows, "carbG")).toBe(DAY.carbG);
      expect(total(rows, "fatG")).toBe(DAY.fatG);
      expect(total(rows, "kcal")).toBe(DAY.kcal);
    }
  });

  it("has nothing to divide when there are no meals", () => {
    expect(distributeTargets(DAY, [])).toEqual([]);
  });

  it("carries the meal through, so a row knows what it belongs to", () => {
    const rows = distributeTargets(DAY, plan(2));

    expect(rows.map((row) => row.meal.id)).toEqual(["0", "1"]);
  });
});

describe("sharePercents", () => {
  it("makes three even meals add to a hundred rather than to ninety-nine", () => {
    expect(sharePercents(plan(3))).toEqual([34, 33, 33]);
  });

  it("adds to a hundred at every meal count", () => {
    for (let count = 1; count <= 12; count += 1) {
      const percents = sharePercents(plan(count));

      expect(percents).toHaveLength(count);
      expect(percents.reduce((sum, value) => sum + value, 0)).toBe(100);
    }
  });

  it("reports what was actually asked for", () => {
    expect(sharePercents(setShare(plan(2), "0", 0.75))).toEqual([75, 25]);
  });

  it("has nothing to report for an empty plan", () => {
    expect(sharePercents([])).toEqual([]);
  });
});
