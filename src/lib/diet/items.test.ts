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
  setItemGroup,
  swapFood,
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

  it("takes the caller's ceiling over the flat default", () => {
    // What stops the solver answering a protein gap with six eggs.
    expect(newItem(rice, "i1", undefined, 200).maxG).toBe(200);
  });

  it("starts below a ceiling that sits under the default quantity", () => {
    // 100 g of olive oil is above olive oil's own ceiling, and an item that
    // arrives at its maximum can only be solved downwards.
    const oil = newItem(rice, "i1", undefined, 60);

    expect(oil.quantityG).toBe(30);
    expect(oil.maxG).toBe(60);
  });

  it("lets a stated serving outweigh the ceiling its group guessed", () => {
    // The serving is a number about this food; the ceiling is a guess about its
    // whole category. Between the two, the specific one wins.
    expect(newItem(rice, "i1", 250, 200).quantityG).toBe(250);
    expect(newItem(rice, "i1", 250, 200).maxG).toBe(500);
  });
});

describe("sameFood", () => {
  it("does not confuse the two id spaces", () => {
    expect(sameFood(rice, { source: "custom", customFoodId: "12" })).toBe(
      false,
    );
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
    expect(
      addItem(full, "m1", item({ id: "extra", food: beans }))[0].items,
    ).toHaveLength(ITEM_LIMITS.count.max);
  });
});

describe("removeItem", () => {
  it("takes out the row asked for", () => {
    const next = removeItem(
      meals([item(), item({ id: "i2", food: beans })]),
      "m1",
      "i1",
    );

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

    expect(next[0].items[0]).toMatchObject({
      mandatory: true,
      quantityG: 100,
      maxG: 400,
    });
  });

  it("pushes the ceiling up when the floor is raised past it", () => {
    // Otherwise the row reads min 500, max 400 — a range no quantity satisfies,
    // and a portion that appears to ignore both.
    const next = updateItem(meals([item()]), "m1", "i1", { minG: 500 });

    expect(next[0].items[0].maxG).toBe(500);
  });

  it("pulls the floor down when the ceiling is lowered under it", () => {
    const next = updateItem(meals([item({ minG: 100 })]), "m1", "i1", {
      maxG: 50,
    });

    expect(next[0].items[0].minG).toBe(50);
  });

  it("leaves a bound alone when the other one was the edit", () => {
    // Typing a quantity must not quietly widen the range around it.
    const next = updateItem(
      meals([item({ minG: 50, maxG: 200 })]),
      "m1",
      "i1",
      {
        quantityG: 900,
      },
    );

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

describe("swapFood", () => {
  it("keeps the slot and changes only what fills it", () => {
    const next = swapFood(
      meals([item({ quantityG: 180, minG: 50, maxG: 300, mandatory: true })]),
      "m1",
      "i1",
      beans,
    );

    expect(next[0].items[0]).toEqual({
      id: "i1",
      food: beans,
      quantityG: 180,
      mandatory: true,
      minG: 50,
      maxG: 300,
    });
  });

  it("keeps the group the slot draws from", () => {
    const next = swapFood(
      meals([item({ substitutionGroupId: "g1" })]),
      "m1",
      "i1",
      beans,
    );

    expect(next[0].items[0].substitutionGroupId).toBe("g1");
  });

  it("refuses a food the meal already holds in another row", () => {
    const before = meals([item(), item({ id: "i2", food: beans })]);
    const next = swapFood(before, "m1", "i1", beans);

    expect(next[0].items.map((i) => i.food)).toEqual([rice, beans]);
  });

  it("leaves other meals alone", () => {
    const before: Meal[] = [
      { id: "m1", name: "Almoço", share: 0.5, items: [item()] },
      { id: "m2", name: "Jantar", share: 0.5, items: [item({ id: "i2" })] },
    ];

    expect(swapFood(before, "m1", "i1", beans)[1]).toBe(before[1]);
  });
});

describe("setItemGroup", () => {
  it("attaches a group without touching the food", () => {
    const next = setItemGroup(meals([item()]), "m1", "i1", "g1");

    expect(next[0].items[0].substitutionGroupId).toBe("g1");
    expect(next[0].items[0].food).toEqual(rice);
  });

  it("drops the key entirely when detached, rather than storing undefined", () => {
    const next = setItemGroup(
      meals([item({ substitutionGroupId: "g1" })]),
      "m1",
      "i1",
      undefined,
    );

    // An explicit `undefined` would survive into IndexedDB and back out of a
    // JSON export as a key that reads like an unfinished write.
    expect("substitutionGroupId" in next[0].items[0]).toBe(false);
  });
});

describe("rows that live inside an option", () => {
  const oats = { source: "taco", tacoId: 5 } as const;

  /** Rice fixed, then a choice between rice-and-beans and oats (#111). */
  const withOptions = (): Meal[] => [
    {
      id: "m1",
      name: "Café da manhã",
      share: 1,
      items: [item({ id: "fixed" })],
      optionSets: [
        {
          id: "s1",
          name: "Carboidrato",
          selectedId: "o1",
          options: [
            {
              id: "o1",
              name: "Feijão",
              items: [item({ id: "a", food: beans })],
            },
            { id: "o2", name: "Aveia", items: [item({ id: "b", food: oats })] },
          ],
        },
      ],
    },
  ];

  const option = (meals: Meal[], id: string) =>
    meals[0].optionSets![0].options.find((entry) => entry.id === id)!;

  it("counts rows against the limit per container, not per meal", () => {
    const meal = withOptions()[0];

    expect(canAddItem(meal)).toBe(true);
    expect(canAddItem(meal, "o1")).toBe(true);
  });

  it("lets the same food sit in two options of one set", () => {
    // The predecessor's breakfast puts milk in all five protein options. Those
    // are alternatives that are never on the same plate, so they are not the
    // double-counting the one-row-per-food rule exists to prevent.
    const meal = withOptions()[0];

    expect(hasFood(meal, beans, "o1")).toBe(true);
    expect(hasFood(meal, beans, "o2")).toBe(false);

    const next = addItem(
      withOptions(),
      "m1",
      item({ id: "new", food: beans }),
      "o2",
    );

    expect(option(next, "o2").items.map((entry) => entry.id)).toEqual([
      "b",
      "new",
    ]);
  });

  it("still refuses the same food twice inside one option", () => {
    const next = addItem(
      withOptions(),
      "m1",
      item({ id: "new", food: beans }),
      "o1",
    );

    expect(option(next, "o1").items).toHaveLength(1);
  });

  it("adds to the meal's fixed rows when no option is named", () => {
    const next = addItem(withOptions(), "m1", item({ id: "new", food: beans }));

    expect(next[0].items.map((entry) => entry.id)).toEqual(["fixed", "new"]);
  });

  it("removes a row from the option that holds it", () => {
    const next = removeItem(withOptions(), "m1", "b");

    expect(option(next, "o2").items).toEqual([]);
    expect(option(next, "o1").items).toHaveLength(1);
    expect(next[0].items).toHaveLength(1);
  });

  it("updates a row inside an unselected option", () => {
    // Editing an option nobody has picked is the ordinary case: that is how a
    // person writes the alternative before switching to it.
    const next = updateItem(withOptions(), "m1", "b", { minG: 40 });

    expect(option(next, "o2").items[0].minG).toBe(40);
    expect(option(next, "o1").items[0].minG).toBe(0);
  });

  it("swaps a food inside an option, against that option's rows only", () => {
    const next = swapFood(withOptions(), "m1", "b", beans);

    expect(option(next, "o2").items[0].food).toEqual(beans);
  });

  it("refuses a swap that clashes inside the same option", () => {
    const clashing = withOptions();
    clashing[0].optionSets![0].options[1].items.push(
      item({ id: "b2", food: beans }),
    );

    const next = swapFood(clashing, "m1", "b", beans);

    expect(option(next, "o2").items[0].food).toEqual(oats);
  });

  it("sets a substitution group on a row inside an option", () => {
    const next = setItemGroup(withOptions(), "m1", "b", "g1");

    expect(option(next, "o2").items[0].substitutionGroupId).toBe("g1");
  });
});
