import { describe, expect, it } from "vitest";

import type { DietItem, Meal } from "@/lib/storage/types";

import { looseCeilings, tightenCeilings } from "./ceilings";
import { DEFAULT_ITEM } from "./items";
import { allItems } from "./options";

/** 259–272 is `gorduras-e-oleos`, whose ceiling is 60 g. */
const oil = { source: "taco", tacoId: 260 } as const;
/** 525–556 is `alimentos-preparados`, the group with no opinion. */
const feijoada = { source: "taco", tacoId: 530 } as const;
const own = { source: "custom", customFoodId: "c1" } as const;

function item(over: Partial<DietItem> = {}): DietItem {
  return {
    id: "i1",
    food: oil,
    quantityG: 100,
    mandatory: false,
    minG: DEFAULT_ITEM.minG,
    maxG: DEFAULT_ITEM.maxG,
    ...over,
  };
}

const meals = (items: DietItem[]): Meal[] => [
  { id: "m1", name: "Almoço", share: 1, items },
];

const maxima = (next: readonly Meal[]) =>
  next.flatMap((meal) => allItems(meal).map((row) => row.maxG));

describe("looseCeilings", () => {
  it("counts a row left at the flat default under a lower ceiling", () => {
    expect(looseCeilings(meals([item()]))).toBe(1);
  });

  it("leaves a maximum somebody typed alone", () => {
    // 500 is the fingerprint of "added and never touched"; anything else is a
    // decision, and a table that grew an opinion later does not outrank one.
    expect(looseCeilings(meals([item({ maxG: 250 })]))).toBe(0);
  });

  it("says nothing about a group with no opinion", () => {
    expect(looseCeilings(meals([item({ food: feijoada })]))).toBe(0);
  });

  it("says nothing about the user's own food", () => {
    expect(looseCeilings(meals([item({ food: own })]))).toBe(0);
  });

  it("leaves a pinned row alone", () => {
    // Its bound is the quantity, not `maxG` — see `toSolverFood`.
    expect(looseCeilings(meals([item({ mandatory: true })]))).toBe(0);
  });

  it("leaves a row whose floor is already above the ceiling", () => {
    // Tightening here would invert the range. Better seen than repaired.
    expect(looseCeilings(meals([item({ minG: 200 })]))).toBe(0);
  });

  it("counts rows parked in an option nobody selected (#111)", () => {
    const meal: Meal = {
      id: "m1",
      name: "Café",
      share: 1,
      items: [],
      optionSets: [
        {
          id: "s1",
          name: "Gordura",
          selectedId: "o1",
          options: [
            { id: "o1", name: "Azeite", items: [item()] },
            { id: "o2", name: "Manteiga", items: [item({ id: "i2" })] },
          ],
        },
      ],
    };

    expect(looseCeilings([meal])).toBe(2);
  });
});

describe("tightenCeilings", () => {
  it("brings a loose row down to its group's ceiling", () => {
    expect(maxima(tightenCeilings(meals([item()])))).toEqual([60]);
  });

  it("leaves the quantity where the solve will find it", () => {
    // The screen re-solves and the save writes what the solve produced, so
    // moving the number here would only be a second answer to disagree with.
    const [meal] = tightenCeilings(meals([item()]));

    expect(meal.items[0].quantityG).toBe(100);
  });

  it("touches nothing else in the row", () => {
    const before = item({ substitutionGroupId: "g1" });
    const [meal] = tightenCeilings(meals([before]));

    expect(meal.items[0]).toEqual({ ...before, maxG: 60 });
  });

  it("leaves every row it does not recognise", () => {
    const next = tightenCeilings(
      meals([
        item({ id: "i1", food: feijoada }),
        item({ id: "i2", maxG: 250 }),
        item({ id: "i3", mandatory: true }),
      ]),
    );

    expect(maxima(next)).toEqual([500, 250, 500]);
  });

  it("settles: tightening twice changes nothing the second time", () => {
    const once = tightenCeilings(meals([item()]));

    expect(looseCeilings(once)).toBe(0);
    expect(tightenCeilings(once)).toEqual(once);
  });
});
