import { describe, expect, it } from "vitest";

import type { FoodSearchResult } from "@/lib/db/foods";
import type {
  CustomFood,
  DietItem,
  FoodComposition,
  Meal,
} from "@/lib/storage/types";

import {
  buildFoodBook,
  compositionFromResult,
  foodKey,
  resolveItems,
  toSolverFoods,
  usedTacoFoods,
} from "./composition";

const rice: FoodComposition = {
  tacoId: 12,
  name: "Arroz, integral, cozido",
  per100g: { kcal: 124, proteinG: 2.6, carbG: 25.8, fatG: 1 },
};

const whey: CustomFood = {
  id: "whey",
  name: "Whey da marca X",
  per100g: { kcal: 380, proteinG: 78, carbG: 8, fatG: 4 },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function item(over: Partial<DietItem> = {}): DietItem {
  return {
    id: "i1",
    food: { source: "taco", tacoId: 12 },
    quantityG: 100,
    mandatory: false,
    minG: 0,
    maxG: 400,
    ...over,
  };
}

function result(over: Partial<FoodSearchResult> = {}): FoodSearchResult {
  return {
    id: 12,
    description: "Arroz, integral, cozido",
    groupSlug: "cereais",
    groupName: "Cereais e derivados",
    energyKcal: 124,
    proteinG: 2.6,
    carbG: 25.8,
    fatG: 1,
    fiberG: 2.7,
    sentinels: {},
    ...over,
  };
}

describe("foodKey", () => {
  it("keeps the two id spaces apart", () => {
    // Both sources number from 1. Colliding on the key would let a custom food
    // answer for a TACO row, which is a wrong plan with no error anywhere.
    expect(foodKey({ source: "taco", tacoId: 1 })).not.toBe(
      foodKey({ source: "custom", customFoodId: "1" }),
    );
  });
});

describe("resolveItems", () => {
  it("finds both kinds of food in one book", () => {
    const book = buildFoodBook([rice], [whey]);

    const { known, missing } = resolveItems(
      [
        item(),
        item({ id: "i2", food: { source: "custom", customFoodId: "whey" } }),
      ],
      book,
    );

    expect(known.map((entry) => entry.food.name)).toEqual([
      "Arroz, integral, cozido",
      "Whey da marca X",
    ]);
    expect(missing).toEqual([]);
  });

  it("reports a food it cannot answer for instead of pricing it at zero", () => {
    // A custom food deleted since the plan was written. Counted as zero it
    // would look like a food that adds nothing, and the solver would make up
    // the difference elsewhere and call the meal solved.
    const { known, missing } = resolveItems(
      [
        item({
          id: "gone",
          food: { source: "custom", customFoodId: "deleted" },
        }),
      ],
      buildFoodBook([rice], []),
    );

    expect(known).toEqual([]);
    expect(missing.map((entry) => entry.id)).toEqual(["gone"]);
  });
});

describe("toSolverFoods", () => {
  it("pins a mandatory item to its quantity", () => {
    // This is how "credited against the target before solving" is expressed:
    // a column that cannot move contributes a constant to A·q.
    const book = buildFoodBook([rice], []);
    const { known } = resolveItems(
      [item({ mandatory: true, quantityG: 150, minG: 0, maxG: 400 })],
      book,
    );

    const [food] = toSolverFoods(known);

    expect(food.minG).toBe(150);
    expect(food.maxG).toBe(150);
  });

  it("leaves a free item its full range", () => {
    const { known } = resolveItems([item()], buildFoodBook([rice], []));
    const [food] = toSolverFoods(known);

    expect([food.minG, food.maxG]).toEqual([0, 400]);
  });

  it("passes composition through per 100 g, untouched", () => {
    const { known } = resolveItems([item()], buildFoodBook([rice], []));

    expect(toSolverFoods(known)[0].per100g).toEqual(rice.per100g);
  });
});

describe("compositionFromResult", () => {
  it("copies the name TACO prints, so the plan reads without the table", () => {
    expect(compositionFromResult(result())).toEqual(rice);
  });

  it("accepts NA and Tr, which are zeroes and not gaps", () => {
    // Boiled potato and raw pumpkin are in this group. Refusing them would
    // hide real foods from the builder for no reason.
    const composition = compositionFromResult(
      result({ fatG: null, sentinels: { fatG: "Tr" } }),
    );

    expect(composition?.per100g.fatG).toBe(0);
  });

  it("refuses a food whose macro NEPA withdrew", () => {
    expect(
      compositionFromResult(
        result({ proteinG: null, sentinels: { proteinG: "*" } }),
      ),
    ).toBeUndefined();
  });

  it("refuses a food with a macro cell the table never printed", () => {
    expect(compositionFromResult(result({ carbG: null }))).toBeUndefined();
  });
});

describe("usedTacoFoods", () => {
  const meals = (items: DietItem[]): Meal[] => [
    { id: "m1", name: "Almoço", share: 1, items },
  ];

  it("keeps only what the plan still points at", () => {
    const beans: FoodComposition = {
      tacoId: 88,
      name: "Feijão",
      per100g: { kcal: 76, proteinG: 4.8, carbG: 13.6, fatG: 0.5 },
    };

    expect(usedTacoFoods(meals([item()]), [rice, beans])).toEqual([rice]);
  });

  it("snapshots the options nobody selected", () => {
    // They are by definition the foods the plan is not using, so their numbers
    // are nowhere else on the device — without a copy, switching option would
    // be the only action in this app that needs a network.
    const beans: FoodComposition = {
      tacoId: 88,
      name: "Feijão",
      per100g: { kcal: 76, proteinG: 4.8, carbG: 13.6, fatG: 0.5 },
    };

    const withOptions: Meal[] = [
      {
        id: "m1",
        name: "Almoço",
        share: 1,
        items: [],
        optionSets: [
          {
            id: "s1",
            name: "Carboidrato",
            selectedId: "o1",
            options: [
              { id: "o1", name: "Arroz", items: [item()] },
              {
                id: "o2",
                name: "Feijão",
                items: [
                  item({ id: "i2", food: { source: "taco", tacoId: 88 } }),
                ],
              },
            ],
          },
        ],
      },
    ];

    expect(usedTacoFoods(withOptions, [rice, beans])).toEqual([rice, beans]);
  });

  it("copies a food once however many meals use it", () => {
    const twice: Meal[] = [
      { id: "m1", name: "Almoço", share: 0.5, items: [item()] },
      { id: "m2", name: "Jantar", share: 0.5, items: [item({ id: "i2" })] },
    ];

    expect(usedTacoFoods(twice, [rice])).toHaveLength(1);
  });

  it("ignores custom foods, which are read live rather than copied", () => {
    const custom = item({ food: { source: "custom", customFoodId: "whey" } });

    expect(usedTacoFoods(meals([custom]), [rice])).toEqual([]);
  });
});
