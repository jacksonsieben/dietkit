import { describe, expect, it } from "vitest";

import type {
  CustomFood,
  DietItem,
  FoodComposition,
  MacroSet,
  Meal,
} from "@/lib/storage/types";

import { buildFoodBook } from "./composition";
import { applySolution, macrosFor, planTotals, solvePlan } from "./solve";

/**
 * Compositions close enough to TACO's that a failure here is about the solve
 * rather than about a number nobody recognises.
 */
const chicken: FoodComposition = {
  tacoId: 1,
  name: "Frango, peito, sem pele, grelhado",
  per100g: { kcal: 159, proteinG: 32, carbG: 0, fatG: 2.5 },
};

const rice: FoodComposition = {
  tacoId: 2,
  name: "Arroz, integral, cozido",
  per100g: { kcal: 124, proteinG: 2.6, carbG: 25.8, fatG: 1 },
};

const beans: FoodComposition = {
  tacoId: 4,
  name: "Feijão, carioca, cozido",
  per100g: { kcal: 76, proteinG: 4.8, carbG: 13.6, fatG: 0.5 },
};

const oil: FoodComposition = {
  tacoId: 3,
  name: "Óleo, de soja",
  per100g: { kcal: 884, proteinG: 0, carbG: 0, fatG: 100 },
};

const book = buildFoodBook([chicken, rice, beans, oil], []);

function item(over: Partial<DietItem> & { id: string; food: DietItem["food"] }): DietItem {
  return {
    quantityG: 100,
    mandatory: false,
    minG: 0,
    maxG: 500,
    ...over,
  };
}

const taco = (tacoId: number) => ({ source: "taco" as const, tacoId });

function meal(items: DietItem[], over: Partial<Meal> = {}): Meal {
  return { id: "m1", name: "Almoço", share: 1, items, ...over };
}

const targets = (over: Partial<MacroSet> = {}): MacroSet => ({
  kcal: 700,
  proteinG: 50,
  carbG: 70,
  fatG: 20,
  ...over,
});

describe("solvePlan", () => {
  it("hits all three macros at once rather than one after another", () => {
    // The whole point of #19. The predecessor scaled for protein, then carbs
    // against the remainder, then stretched a fat vehicle — and each stage
    // undid the previous one.
    const [solved] = solvePlan(
      targets(),
      [meal([item({ id: "a", food: taco(1) }), item({ id: "b", food: taco(2) }), item({ id: "c", food: taco(3) })])],
      book,
    );

    expect(solved.feasible).toBe(true);
    expect(Math.abs(solved.residual.proteinG)).toBeLessThanOrEqual(2);
    expect(Math.abs(solved.residual.carbG)).toBeLessThanOrEqual(2);
    expect(Math.abs(solved.residual.fatG)).toBeLessThanOrEqual(2);
  });

  it("treats oil as an ordinary free variable, not a special last pass", () => {
    // "The fat-vehicle special case does not exist" — it is a column of
    // (0, 0, 1) with a wide bound and nothing in the code knows its name.
    const [solved] = solvePlan(
      targets({ fatG: 40 }),
      [meal([item({ id: "a", food: taco(1) }), item({ id: "b", food: taco(2) }), item({ id: "c", food: taco(3) })])],
      book,
    );

    const oilItem = solved.items.find((entry) => entry.item.id === "c");

    expect(solved.feasible).toBe(true);
    expect(oilItem?.quantityG).toBeGreaterThan(20);
  });

  it("credits a mandatory item against the target instead of scaling it", () => {
    // The user said 200 g of rice. That is not a quantity the solver gets to
    // revise — it is a constant the rest of the meal is fitted around.
    const [solved] = solvePlan(
      targets(),
      [
        meal([
          item({ id: "a", food: taco(1) }),
          item({ id: "b", food: taco(2), quantityG: 200, mandatory: true }),
          item({ id: "d", food: taco(4) }),
          item({ id: "c", food: taco(3) }),
        ]),
      ],
      book,
    );

    const riceItem = solved.items.find((entry) => entry.item.id === "b");

    expect(riceItem?.quantityG).toBe(200);
    expect(riceItem?.pinned).toBe(true);
    // And the free foods were fitted around it: 200 g of rice is 51.6 g of
    // carbohydrate, so the beans had to supply the remaining 18 and no more.
    expect(solved.feasible).toBe(true);
    expect(Math.abs(solved.residual.carbG)).toBeLessThanOrEqual(2);
  });

  it("reports an impossible target as a residual instead of missing it quietly", () => {
    // Chicken breast and rice cannot reach 40 g of fat inside their bounds.
    // The old pipeline returned a plan; this returns a plan plus the truth.
    const [solved] = solvePlan(
      targets({ fatG: 40 }),
      [meal([item({ id: "a", food: taco(1), maxG: 200 }), item({ id: "b", food: taco(2), maxG: 200 })])],
      book,
    );

    expect(solved.feasible).toBe(false);
    expect(solved.residual.fatG).toBeLessThan(0);
  });

  it("names the foods holding a missed macro where it is", () => {
    const [solved] = solvePlan(
      targets({ proteinG: 120 }),
      [meal([item({ id: "a", food: taco(1), maxG: 150 }), item({ id: "b", food: taco(2), maxG: 200 })])],
      book,
    );

    expect(solved.feasible).toBe(false);
    expect(solved.items.filter((entry) => entry.limiting).map((entry) => entry.item.id)).toContain("a");
  });

  it("refuses to call a meal solved when one of its foods is unknown", () => {
    // The remaining foods may well hit the numbers. Saying "solved" while a row
    // on screen has no composition is the silent mis-solve this issue rules out.
    const [solved] = solvePlan(
      targets(),
      [
        meal([
          item({ id: "a", food: taco(1) }),
          item({ id: "b", food: taco(2) }),
          item({ id: "c", food: taco(3) }),
          item({ id: "gone", food: { source: "custom", customFoodId: "deleted" } }),
        ]),
      ],
      book,
    );

    expect(solved.missing.map((entry) => entry.id)).toEqual(["gone"]);
    expect(solved.feasible).toBe(false);
  });

  it("solves a custom food from the device, not from a snapshot", () => {
    const whey: CustomFood = {
      id: "whey",
      name: "Whey",
      per100g: { kcal: 380, proteinG: 78, carbG: 8, fatG: 4 },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const [solved] = solvePlan(
      targets({ proteinG: 30, carbG: 10, fatG: 5, kcal: 205 }),
      [meal([item({ id: "w", food: { source: "custom", customFoodId: "whey" } })])],
      buildFoodBook([], [whey]),
    );

    expect(solved.items[0].food.name).toBe("Whey");
    expect(solved.items[0].quantityG).toBeGreaterThan(0);
  });

  it("solves each meal against its own share of the day", () => {
    // Not one system over the whole day: a joint solve would pay for a missed
    // breakfast at dinner, which is tidy arithmetic and not how anyone eats.
    const items = () => [
      item({ id: "a", food: taco(1) }),
      item({ id: "b", food: taco(2) }),
      item({ id: "c", food: taco(3) }),
    ];

    const solved = solvePlan(
      targets({ proteinG: 100, carbG: 140, fatG: 40, kcal: 1320 }),
      [
        meal(items(), { id: "m1", share: 0.75 }),
        meal(items().map((entry) => ({ ...entry, id: `${entry.id}2` })), {
          id: "m2",
          name: "Jantar",
          share: 0.25,
        }),
      ],
      book,
    );

    expect(solved[0].targets.proteinG).toBe(75);
    expect(solved[1].targets.proteinG).toBe(25);
    expect(solved[0].items[0].quantityG).toBeGreaterThan(solved[1].items[0].quantityG);
  });

  it("does not drift a plan that is merely reopened", () => {
    const plan = [meal([item({ id: "a", food: taco(1) }), item({ id: "b", food: taco(2) }), item({ id: "c", food: taco(3) })])];

    const once = applySolution(plan, solvePlan(targets(), plan, book));
    const twice = applySolution(once, solvePlan(targets(), once, book));

    expect(twice).toEqual(once);
  });
});

describe("applySolution", () => {
  it("writes the solved grams back onto the plan", () => {
    const plan = [meal([item({ id: "a", food: taco(1) }), item({ id: "b", food: taco(2) }), item({ id: "c", food: taco(3) })])];

    const solved = solvePlan(targets(), plan, book);
    const [next] = applySolution(plan, solved);

    expect(next.items.map((entry) => entry.quantityG)).toEqual(
      solved[0].items.map((entry) => entry.quantityG),
    );
  });

  it("leaves an unresolved item the quantity it had", () => {
    // The plan should come back the way it was left, not edited by a food that
    // failed to load.
    const plan = [
      meal([
        item({ id: "a", food: taco(1) }),
        item({ id: "gone", food: { source: "custom", customFoodId: "deleted" }, quantityG: 77 }),
      ]),
    ];

    const [next] = applySolution(plan, solvePlan(targets(), plan, book));

    expect(next.items[1].quantityG).toBe(77);
  });
});

describe("planTotals", () => {
  it("adds up what the meals were actually given", () => {
    const items = () => [item({ id: "a", food: taco(1) }), item({ id: "b", food: taco(2) }), item({ id: "c", food: taco(3) })];

    const solved = solvePlan(
      targets({ proteinG: 100, carbG: 140, fatG: 40, kcal: 1320 }),
      [
        meal(items(), { id: "m1", share: 0.5 }),
        meal(items().map((entry) => ({ ...entry, id: `${entry.id}2` })), { id: "m2", share: 0.5 }),
      ],
      book,
    );

    const total = planTotals(solved);

    expect(total.proteinG).toBeCloseTo(
      solved[0].achieved.proteinG + solved[1].achieved.proteinG,
      6,
    );
    expect(total.proteinG).toBeGreaterThan(95);
  });
});

describe("macrosFor", () => {
  it("scales a per-100 g composition to the portion", () => {
    expect(macrosFor(oil.per100g, 15)).toEqual({
      kcal: 132.6,
      proteinG: 0,
      carbG: 0,
      fatG: 15,
    });
  });
});
