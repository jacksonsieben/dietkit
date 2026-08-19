import { describe, expect, it } from "vitest";

import type { DietItem, Meal } from "@/lib/storage/types";

import {
  DEFAULT_ITEM,
  ITEM_LIMITS,
  addItem,
  canAddItem,
  checkGrams,
  hasFood,
  newItem,
  removeItem,
  sameFood,
  updateItem,
} from "./items";

const rice = { source: "taco", tacoId: 12 } as const;
const beans = { source: "taco", tacoId: 88 } as const;

function item(over: Partial<DietItem> = {}): DietItem {
  return {
    id: "i1",
    food: rice,
    quantityG: 100,
    mandatory: false,
    minG: 0,
    maxG: 400,
    ...over,
  };
}

const meals = (items: DietItem[]): Meal[] => [
  { id: "m1", name: "Almoço", share: 1, items },
];

describe("newItem", () => {
  it("starts at the hundred grams TACO publishes in", () => {
    // So the first thing on screen is the table's own number, unedited.
    expect(newItem(rice, "i1").quantityG).toBe(DEFAULT_ITEM.quantityG);
  });

  it("prefers the serving when the food comes in servings", () => {
    expect(newItem(rice, "i1", 30).quantityG).toBe(30);
  });

  it("arrives free rather than pinned", () => {
    // A new item that could not move would make the first solve look broken.
    const fresh = newItem(rice, "i1");

    expect(fresh.mandatory).toBe(false);
    expect(fresh.maxG).toBeGreaterThan(fresh.quantityG);
  });

  it("gives a large serving room to grow", () => {
    // A 400 g serving inside a 500 g default ceiling is a food that can barely
    // move — the ceiling follows the portion rather than capping it.
    expect(newItem(rice, "i1", 400).maxG).toBe(800);
  });

  it("never proposes a quantity past the ceiling", () => {
    expect(newItem(rice, "i1", 9000).quantityG).toBe(ITEM_LIMITS.gramsG.max);
    expect(newItem(rice, "i1", 9000).maxG).toBe(ITEM_LIMITS.gramsG.max);
  });
});

describe("sameFood", () => {
  it("does not confuse the two id spaces", () => {
    expect(sameFood(rice, { source: "custom", customFoodId: "12" })).toBe(false);
  });

  it("matches a food with itself", () => {
    expect(sameFood(rice, { source: "taco", tacoId: 12 })).toBe(true);
  });
});

describe("addItem", () => {
  it("adds to the meal it was asked about and no other", () => {
    const two: Meal[] = [
      { id: "m1", name: "Almoço", share: 0.5, items: [] },
      { id: "m2", name: "Jantar", share: 0.5, items: [] },
    ];

    const next = addItem(two, "m2", item());

    expect(next[0].items).toHaveLength(0);
    expect(next[1].items).toHaveLength(1);
  });

  it("refuses a food the meal already holds", () => {
    // Two rows of the same rice is two bounds on one food, and the solver would
    // happily satisfy both — the user just sees rice twice.
    const next = addItem(meals([item()]), "m1", item({ id: "i2" }));

    expect(next[0].items).toHaveLength(1);
  });

  it("stops at the row limit", () => {
    const full = meals(
      Array.from({ length: ITEM_LIMITS.count.max }, (_, index) =>
        item({ id: `i${index}`, food: { source: "taco", tacoId: index } }),
      ),
    );

    expect(canAddItem(full[0])).toBe(false);
    expect(addItem(full, "m1", item({ id: "extra", food: beans }))[0].items).toHaveLength(
      ITEM_LIMITS.count.max,
    );
  });
});

describe("removeItem", () => {
  it("takes out the row asked for", () => {
    const next = removeItem(meals([item(), item({ id: "i2", food: beans })]), "m1", "i1");

    expect(next[0].items.map((entry) => entry.id)).toEqual(["i2"]);
  });
});

describe("hasFood", () => {
  it("answers about the food, not the row id", () => {
    expect(hasFood(meals([item()])[0], rice)).toBe(true);
    expect(hasFood(meals([item()])[0], beans)).toBe(false);
  });
});

describe("updateItem", () => {
  it("changes one field without disturbing the rest", () => {
    const next = updateItem(meals([item()]), "m1", "i1", { mandatory: true });

    expect(next[0].items[0]).toMatchObject({ mandatory: true, quantityG: 100, maxG: 400 });
  });

  it("pushes the ceiling up when the floor is raised past it", () => {
    // Otherwise the row reads min 500, max 400 — a range no quantity satisfies,
    // and a portion that appears to ignore both.
    const next = updateItem(meals([item()]), "m1", "i1", { minG: 500 });

    expect(next[0].items[0].maxG).toBe(500);
  });

  it("pulls the floor down when the ceiling is lowered under it", () => {
    const next = updateItem(meals([item({ minG: 100 })]), "m1", "i1", { maxG: 50 });

    expect(next[0].items[0].minG).toBe(50);
  });

  it("leaves a bound alone when the other one was the edit", () => {
    // Typing a quantity must not quietly widen the range around it.
    const next = updateItem(meals([item({ minG: 50, maxG: 200 })]), "m1", "i1", {
      quantityG: 900,
    });

    expect(next[0].items[0]).toMatchObject({ minG: 50, maxG: 200 });
  });
});

describe("checkGrams", () => {
  it("reads the comma this country writes decimals with", () => {
    expect(checkGrams("70,5")).toEqual({ value: 71 });
  });

  it("refuses an empty box rather than reading it as nothing", () => {
    expect(checkGrams("  ")).toEqual({ error: "required" });
  });

  it("refuses what is not a number", () => {
    expect(checkGrams("um pouco")).toEqual({ error: "notANumber" });
  });

  it("refuses a portion past what anyone eats", () => {
    expect(checkGrams("5000")).toEqual({ error: "gramsRange" });
    expect(checkGrams("-1")).toEqual({ error: "gramsRange" });
  });

  it("accepts zero, which is a thing someone can mean", () => {
    expect(checkGrams("0")).toEqual({ value: 0 });
  });
});
