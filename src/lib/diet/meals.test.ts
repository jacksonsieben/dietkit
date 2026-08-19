import { describe, expect, it } from "vitest";

import type { Meal } from "@/lib/storage/types";

import {
  MEAL_LIMITS,
  addMeal,
  canAddMeal,
  canRemoveMeal,
  checkMealName,
  checkSharePercent,
  evenShares,
  mealsFromNames,
  moveMeal,
  normalizeShares,
  removeMeal,
  renameMeal,
  setShare,
} from "./meals";

/**
 * The failure this file is written against is a day that no longer adds up to
 * a day. Every operation here moves shares between meals, and any of them can
 * leave the total at 0,97 or 1,04 without anything looking wrong: the table
 * still renders, the percentages still read plausibly, and the user is simply
 * eating the wrong amount. So the total is asserted after every operation, not
 * only after the ones where the arithmetic is interesting.
 */

function meal(id: string, share: number, name = id): Meal {
  return { id, name, share, items: [] };
}

/** Floating point: shares are divisions, so 1 is 1 to within a rounding error. */
function expectWholeDay(meals: readonly Meal[]) {
  const total = meals.reduce((sum, current) => sum + current.share, 0);
  expect(total).toBeCloseTo(1, 10);
}

const PLAN = [meal("a", 0.5), meal("b", 0.3), meal("c", 0.2)];

describe("normalizeShares", () => {
  it("scales shares that do not add to a day", () => {
    const normalized = normalizeShares([
      meal("a", 2),
      meal("b", 1),
      meal("c", 1),
    ]);

    expect(normalized.map((current) => current.share)).toEqual([
      0.5, 0.25, 0.25,
    ]);
    expectWholeDay(normalized);
  });

  it("falls back to an even split when nothing usable is stored", () => {
    // What a hand-edited import or an older record looks like: no share at all.
    const broken = [
      { id: "a", name: "a", items: [] },
      { id: "b", name: "b", items: [] },
    ] as unknown as Meal[];

    expect(normalizeShares(broken).map((current) => current.share)).toEqual([
      0.5, 0.5,
    ]);
  });

  it("ignores negative shares rather than subtracting a meal from the day", () => {
    const normalized = normalizeShares([meal("a", 3), meal("b", -1)]);

    expect(normalized.map((current) => current.share)).toEqual([1, 0]);
    expectWholeDay(normalized);
  });
});

describe("addMeal", () => {
  it("gives the new meal an average share and keeps the others in proportion", () => {
    const added = addMeal(PLAN, meal("d", 0));

    expect(added.map((current) => current.id)).toEqual(["a", "b", "c", "d"]);
    expect(added[3].share).toBeCloseTo(0.25, 10);
    // 0,5 : 0,3 : 0,2 preserved, scaled into the remaining three quarters.
    expect(added[0].share / added[1].share).toBeCloseTo(0.5 / 0.3, 10);
    expectWholeDay(added);
  });

  it("refuses past the ceiling instead of drawing a row that cannot be edited", () => {
    const full = mealsFromNames(
      Array.from({ length: MEAL_LIMITS.count.max }, (_, index) => ({
        id: String(index),
        name: String(index),
      })),
    );

    expect(canAddMeal(full)).toBe(false);
    expect(addMeal(full, meal("extra", 0))).toHaveLength(MEAL_LIMITS.count.max);
  });
});

describe("removeMeal", () => {
  it("hands the deleted meal's share to the survivors in proportion", () => {
    const left = removeMeal(PLAN, "c");

    expect(left.map((current) => current.id)).toEqual(["a", "b"]);
    expect(left[0].share).toBeCloseTo(0.625, 10);
    expect(left[1].share).toBeCloseTo(0.375, 10);
    expectWholeDay(left);
  });

  it("will not empty the plan", () => {
    const only = [meal("a", 1)];

    expect(canRemoveMeal(only)).toBe(false);
    expect(removeMeal(only, "a")).toEqual(only);
  });

  it("leaves the plan alone when the id is not in it", () => {
    expect(removeMeal(PLAN, "missing")).toEqual(PLAN);
  });
});

describe("renameMeal", () => {
  it("renames one meal and touches nothing else", () => {
    const renamed = renameMeal(PLAN, "b", "Almoço");

    expect(renamed.map((current) => current.name)).toEqual([
      "a",
      "Almoço",
      "c",
    ]);
    expect(renamed.map((current) => current.share)).toEqual([0.5, 0.3, 0.2]);
  });
});

describe("moveMeal", () => {
  it("swaps a meal with its neighbour, carrying its share along", () => {
    const moved = moveMeal(PLAN, "c", -1);

    expect(moved.map((current) => current.id)).toEqual(["a", "c", "b"]);
    expect(moved.map((current) => current.share)).toEqual([0.5, 0.2, 0.3]);
  });

  it("does nothing at the ends of the day", () => {
    expect(moveMeal(PLAN, "a", -1)).toEqual(PLAN);
    expect(moveMeal(PLAN, "c", 1)).toEqual(PLAN);
  });
});

describe("setShare", () => {
  it("gives the meal exactly what was asked for", () => {
    const changed = setShare(PLAN, "a", 0.4);

    expect(changed[0].share).toBeCloseTo(0.4, 10);
    expectWholeDay(changed);
  });

  it("absorbs the difference into the others without reshuffling them", () => {
    const changed = setShare(PLAN, "a", 0.4);

    // b and c held 0,3 and 0,2 — a 3:2 ratio — and still do inside the 0,6.
    expect(changed[1].share).toBeCloseTo(0.36, 10);
    expect(changed[2].share).toBeCloseTo(0.24, 10);
  });

  it("splits the room evenly when the other meals are all at zero", () => {
    const zeroed = [meal("a", 1), meal("b", 0), meal("c", 0)];

    const changed = setShare(zeroed, "a", 0.5);

    expect(changed[1].share).toBeCloseTo(0.25, 10);
    expect(changed[2].share).toBeCloseTo(0.25, 10);
    expectWholeDay(changed);
  });

  it("clamps instead of letting a meal take more than the day", () => {
    expect(setShare(PLAN, "a", 4)[0].share).toBe(1);
    expect(setShare(PLAN, "a", -1)[0].share).toBe(0);
    expectWholeDay(setShare(PLAN, "a", 4));
  });

  it("gives the whole day to a lone meal whatever was typed", () => {
    expect(setShare([meal("a", 1)], "a", 0.2)).toEqual([meal("a", 1)]);
  });
});

describe("evenShares and mealsFromNames", () => {
  it("starts a plan on an even split of however many meals there are", () => {
    const built = mealsFromNames([
      { id: "1", name: "Café da manhã" },
      { id: "2", name: "Almoço" },
      { id: "3", name: "Jantar" },
    ]);

    expect(built.map((current) => current.share)).toEqual([
      1 / 3,
      1 / 3,
      1 / 3,
    ]);
    expect(built.every((current) => current.items.length === 0)).toBe(true);
    expectWholeDay(built);
  });

  it("has nothing to split when there are no meals", () => {
    expect(evenShares([])).toEqual([]);
  });
});

describe("checkMealName", () => {
  it("trims before judging, so spaces are not a name", () => {
    expect(checkMealName("   ")).toEqual({ error: "required" });
    expect(checkMealName("  Almoço  ")).toEqual({ value: "Almoço" });
  });

  it("refuses a name longer than the row can show", () => {
    expect(checkMealName("a".repeat(MEAL_LIMITS.nameLength.max + 1))).toEqual({
      error: "nameLength",
    });
  });
});

describe("checkSharePercent", () => {
  it("reads a percentage the way pt-BR writes one", () => {
    expect(checkSharePercent("12,5")).toEqual({ value: 0.125 });
  });

  it("allows a meal to be zeroed out without being deleted", () => {
    expect(checkSharePercent("0")).toEqual({ value: 0 });
  });

  it("refuses what is not a number, and what is out of range", () => {
    expect(checkSharePercent("")).toEqual({ error: "required" });
    expect(checkSharePercent("metade")).toEqual({ error: "notANumber" });
    expect(checkSharePercent("101")).toEqual({ error: "shareRange" });
    expect(checkSharePercent("-1")).toEqual({ error: "shareRange" });
  });
});
