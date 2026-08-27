import { describe, expect, it } from "vitest";

import type { FoodSearchResult } from "@/lib/db/foods";
import type {
  PresetItemRow,
  PresetOptionSetRow,
  PresetRow,
} from "@/lib/db/presets";
import type { DietItem, MacroSet, Meal } from "@/lib/storage/types";

import { allItems } from "./options";
import { copyPreset, presetShape, PresetWithoutDefault } from "./fromPreset";

/**
 * Copying a published preset into a plan of somebody's own (#114).
 *
 * Two rules carry most of these tests, and both are about what the copy is
 * *not*. It is not a link: nothing that comes out of here names the preset, so
 * a preset that is re-seeded tomorrow cannot reach a plan somebody wrote today.
 * And it is not a diet plan for a generic person: the preset ships shares,
 * foods and bounds, the targets come from the caller, and the same preset
 * copied against two bodies has to produce two different sets of grams.
 */

const TARGETS: MacroSet = { kcal: 2200, proteinG: 165, carbG: 240, fatG: 70 };

function ids(): () => string {
  let next = 0;
  return () => `id-${++next}`;
}

function copy(preset: PresetRow, foods = FOODS) {
  return copyPreset({
    preset,
    foods,
    name: "Meu plano",
    targets: TARGETS,
    basedOnWeightKg: 82,
    now: "2026-08-27T10:00:00.000Z",
    newId: ids(),
  });
}

describe("describing a preset", () => {
  it("counts the day, the choices, the swaps and the foods", () => {
    const shape = presetShape(PRESET);

    expect(shape.meals).toEqual([
      { name: "Café", percent: 30 },
      { name: "Almoço", percent: 70 },
    ]);
    expect(shape.choices).toBe(1);
    expect(shape.swaps).toBe(1);
    // 10, 11, 20, 21, 30, 31 -- the option nobody picked and the fruits nobody
    // swapped to are foods this preset can reach, and a count that left them
    // out would understate what it asks somebody to keep in the house.
    expect(shape.foods).toBe(6);
  });

  it("closes the day at 100% however the shares were written", () => {
    const thirds = {
      ...PRESET,
      meals: PRESET.meals.map((meal) => ({ ...meal, share: 1 / 3 })),
    };

    const percents = presetShape(thirds).meals.map((meal) => meal.percent);
    expect(percents.reduce((total, percent) => total + percent, 0)).toBe(100);
  });
});

describe("copying a preset", () => {
  it("builds a plan with the preset's meals, shares and rows", () => {
    const { diet } = copy(PRESET);

    expect(diet.name).toBe("Meu plano");
    expect(diet.meals.map((meal) => meal.name)).toEqual(["Café", "Almoço"]);
    expect(diet.meals.map((meal) => meal.share)).toEqual([0.3, 0.7]);

    const lunch = diet.meals[1]!;
    expect(lunch.items).toHaveLength(2);
    expect(lunch.items[0]).toMatchObject({
      food: { source: "taco", tacoId: 10 },
      mandatory: false,
      minG: 80,
      maxG: 250,
    });
    // The teaspoon of oil, as the solver reads a pinned row (#19).
    expect(lunch.items[1]).toMatchObject({
      mandatory: true,
      minG: 8,
      maxG: 8,
    });
  });

  it("arrives solved, in grams sized for the body it was copied against", () => {
    // The preset authored 120 g of food 10. Nobody eats 120 g of it: that
    // number was written against no particular person, and what the copy is
    // for is the shape around it. Two targets, two plans, one preset (#114).
    const mine = copy(PRESET).diet;
    const yours = copyPreset({
      preset: PRESET,
      foods: FOODS,
      name: "Outro plano",
      targets: { kcal: 1400, proteinG: 105, carbG: 140, fatG: 45 },
      basedOnWeightKg: 54,
      now: "2026-08-27T10:00:00.000Z",
      newId: ids(),
    }).diet;

    const grams = (diet: typeof mine) =>
      diet.meals.flatMap((meal) =>
        allItems(meal).map((item) => item.quantityG),
      );

    expect(grams(mine)).not.toEqual(grams(yours));

    // Inside the bounds the preset set, in both plans, and the pinned row
    // pinned in both: the solver may size a portion, not invent one.
    for (const diet of [mine, yours]) {
      for (const item of diet.meals.flatMap((meal) => allItems(meal))) {
        expect(item.quantityG).toBeGreaterThanOrEqual(item.minG);
        expect(item.quantityG).toBeLessThanOrEqual(item.maxG);
      }
      expect(diet.meals[1]!.items[1]!.quantityG).toBe(8);
    }
  });

  it("takes the targets from the caller, never from the preset", () => {
    const { diet } = copy(PRESET);

    expect(diet.targets).toEqual(TARGETS);
    expect(diet.basedOnWeightKg).toBe(82);

    // Said as a shape rather than as a value: a preset that grew a `targets`
    // or a `kcal` would be a preset shipping somebody else's kilocalories, and
    // this is the assertion that would still fail on the day it does.
    expect(JSON.stringify(PRESET)).not.toContain("kcal");
  });

  it("keeps nothing that points back at the preset", () => {
    const { diet, groups } = copy(PRESET);

    const written = JSON.stringify({ diet, groups });
    expect(written).not.toContain(PRESET.slug);
    expect(written).not.toContain("groupSlug");
    // Every id in the copy is one this device minted, in one series.
    for (const id of [
      diet.id,
      ...diet.meals.map((meal) => meal.id),
      ...groups.map((group) => group.id),
    ]) {
      expect(id).toMatch(/^id-\d+$/);
    }
  });

  it("turns the preset's groups into records the user owns", () => {
    const { diet, groups } = copy(PRESET);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      name: "Frutas",
      foods: [
        { source: "taco", tacoId: 30 },
        { source: "taco", tacoId: 31 },
      ],
      createdAt: "2026-08-27T10:00:00.000Z",
      updatedAt: "2026-08-27T10:00:00.000Z",
    });

    // The alternatives are foods the plan is not using, so they carry their own
    // quotations — otherwise swapping would be the one action needing a network.
    expect(groups[0]!.tacoFoods?.map((food) => food.tacoId)).toEqual([30, 31]);

    // And the slot points at the group by the id this device just minted.
    const slot = diet.meals[0]!.items[0]!;
    expect(slot.substitutionGroupId).toBe(groups[0]!.id);
  });

  it("selects the option the preset marked as its default", () => {
    const { diet } = copy(PRESET);

    const set = diet.meals[0]!.optionSets![0]!;
    expect(set.name).toBe("Carboidrato");
    expect(set.options.map((option) => option.name)).toEqual(["Pão", "Aveia"]);
    expect(set.selectedId).toBe(set.options[1]!.id);
  });

  it("refuses, by name, a set nobody marked a default in", () => {
    const set = PRESET.meals[0]!.optionSets[0]!;
    const broken = withSets(PRESET, [
      {
        ...set,
        options: set.options.map((option) => ({ ...option, isDefault: false })),
      },
    ]);

    expect(() => copy(broken)).toThrow(PresetWithoutDefault);
    expect(() => copy(broken)).toThrow(/Carboidrato/);
  });

  it("carries a quotation for every food the plan can reach", () => {
    const { diet } = copy(PRESET);

    const reached = new Set(
      diet.meals
        .flatMap((meal) => allItems(meal))
        .flatMap((item) =>
          item.food.source === "taco" ? [item.food.tacoId] : [],
        ),
    );

    // The unselected option's food included: it is nowhere else on the device.
    expect(reached.has(21)).toBe(true);
    expect(new Set(diet.tacoFoods?.map((food) => food.tacoId))).toEqual(
      reached,
    );
  });

  it("leaves a food TACO withheld the macros of unresolved, not zeroed", () => {
    const withheld = FOODS.map((food) =>
      food.id === 11
        ? { ...food, fatG: null, sentinels: { fatG: "*" as const } }
        : food,
    );

    const { diet } = copy(PRESET, withheld);

    expect(diet.tacoFoods?.some((food) => food.tacoId === 11)).toBe(false);
    // The row is still in the plan — the plan screen shows it as unresolved,
    // which is the honest state. Inventing a zero would understate the day.
    expect(rows(diet.meals).some((item) => tacoId(item) === 11)).toBe(true);
  });

  it("holds the preset's bounds inside the ones this app allows", () => {
    const huge = withLunchItem(PRESET, { maxG: 9000 });

    const { diet } = copy(huge);

    expect(diet.meals[1]!.items[0]!.maxG).toBe(2000);
  });
});

function rows(meals: readonly Meal[]): DietItem[] {
  return meals.flatMap((meal) => allItems(meal));
}

function tacoId(item: DietItem): number | undefined {
  return item.food.source === "taco" ? item.food.tacoId : undefined;
}

function withSets(
  preset: PresetRow,
  optionSets: PresetOptionSetRow[],
): PresetRow {
  const [breakfast, ...rest] = preset.meals;
  return { ...preset, meals: [{ ...breakfast!, optionSets }, ...rest] };
}

function withLunchItem(
  preset: PresetRow,
  edit: Partial<PresetItemRow>,
): PresetRow {
  const [breakfast, lunch] = preset.meals;
  const [first, ...others] = lunch!.items;

  return {
    ...preset,
    meals: [
      breakfast!,
      { ...lunch!, items: [{ ...first!, ...edit }, ...others] },
    ],
  };
}

/** A row as `dietPresetCatalog` publishes it: bounds, no kilocalories. */
function item(edit: Partial<PresetItemRow>): PresetItemRow {
  return {
    foodId: 10,
    quantityG: 120,
    mandatory: false,
    minG: 80,
    maxG: 250,
    groupSlug: null,
    ...edit,
  };
}

const PRESET: PresetRow = {
  slug: "onivora-equilibrada",
  name: "Onívora equilibrada",
  description: "Uma semana comum.",
  groups: [{ slug: "frutas", name: "Frutas", foodIds: [30, 31] }],
  meals: [
    {
      name: "Café",
      share: 0.3,
      items: [item({ foodId: 30, groupSlug: "frutas" })],
      optionSets: [
        {
          name: "Carboidrato",
          options: [
            { name: "Pão", isDefault: false, items: [item({ foodId: 21 })] },
            { name: "Aveia", isDefault: true, items: [item({ foodId: 20 })] },
          ],
        },
      ],
    },
    {
      name: "Almoço",
      share: 0.7,
      items: [
        item({ foodId: 10 }),
        item({ foodId: 11, quantityG: 8, mandatory: true, minG: 8, maxG: 8 }),
      ],
      optionSets: [],
    },
  ],
};

/** The compositions the route ships beside the preset. */
const FOODS: readonly FoodSearchResult[] = [10, 11, 20, 21, 30, 31].map(
  (id) => ({
    id,
    description: `Alimento ${id}`,
    groupSlug: "diversos",
    groupName: "Diversos",
    energyKcal: 100 + id,
    proteinG: 10,
    carbG: 20,
    fatG: 5,
    fiberG: 2,
    sentinels: {},
  }),
);
