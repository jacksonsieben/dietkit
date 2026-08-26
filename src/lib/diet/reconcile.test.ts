import { describe, expect, it } from "vitest";

import type { MacroSet, Meal } from "@/lib/storage/types";

import {
  RECONCILE_MACROS,
  TOLERANCE,
  reconcile,
  reconcileDay,
  reconcileMeal,
} from "./reconcile";
import type { SolvedMeal } from "./solve";

const macros = (over: Partial<MacroSet> = {}): MacroSet => ({
  kcal: 2000,
  proteinG: 150,
  carbG: 200,
  fatG: 60,
  ...over,
});

const meal = (targets: MacroSet, achieved: MacroSet): SolvedMeal =>
  ({
    meal: { id: "m1", name: "Almoço", share: 1, items: [] } as Meal,
    share: 1,
    targets,
    items: [],
    missing: [],
    achieved,
    residual: { proteinG: 0, carbG: 0, fatG: 0, kcal: null },
    feasible: true,
  }) satisfies SolvedMeal;

const lineFor = (
  result: ReturnType<typeof reconcile>,
  macro: (typeof RECONCILE_MACROS)[number],
) => result.lines.find((line) => line.macro === macro)!;

describe("reconcile", () => {
  it("reports every macro, energy included", () => {
    const result = reconcile(macros(), macros());

    expect(result.lines.map((line) => line.macro)).toEqual([
      ...RECONCILE_MACROS,
    ]);
  });

  it("prints the difference between the two numbers it printed", () => {
    // Not 149.6 against 150.4: the screen shows whole grams, so a delta taken
    // before rounding would read "150 · 150 · 1" and invite the user to check
    // the app's arithmetic by hand.
    const result = reconcile(
      macros({ proteinG: 150.4 }),
      macros({ proteinG: 149.6 }),
    );
    const protein = lineFor(result, "proteinG");

    expect(protein.target).toBe(150);
    expect(protein.actual).toBe(150);
    expect(protein.delta).toBe(0);
    expect(protein.delta).toBe(protein.actual - protein.target);
  });

  it("calls a macro met when it is within the solver's own tolerance", () => {
    const short = macros({ proteinG: 150 - TOLERANCE.gramsG });
    const result = reconcile(macros(), short);

    expect(lineFor(result, "proteinG").state).toBe("on");
    expect(lineFor(result, "proteinG").delta).toBe(-TOLERANCE.gramsG);
  });

  it("separates short of target from past it", () => {
    const result = reconcile(
      macros(),
      macros({ proteinG: 130, carbG: 240, fatG: 60 }),
    );

    expect(lineFor(result, "proteinG").state).toBe("under");
    expect(lineFor(result, "proteinG").delta).toBe(-20);
    expect(lineFor(result, "carbG").state).toBe("over");
    expect(lineFor(result, "carbG").delta).toBe(40);
    expect(lineFor(result, "fatG").state).toBe("on");
  });

  it("judges energy against what the gram tolerance is worth, not against grams", () => {
    // A day 20 kcal off is a day whose macros are within a gram or two of
    // target. Holding energy to the gram band would mark every solved plan
    // off-target for a difference the solver was never asked to remove.
    const nearly = reconcile(
      macros(),
      macros({ kcal: 2000 + TOLERANCE.gramsG * 4 }),
    );
    expect(lineFor(nearly, "kcal").state).toBe("on");

    const beyond = reconcile(
      macros(),
      macros({ kcal: 2000 + TOLERANCE.kcal + 1 }),
    );
    expect(lineFor(beyond, "kcal").state).toBe("over");
  });

  it("is on target only when every macro is", () => {
    expect(reconcile(macros(), macros()).onTarget).toBe(true);
    expect(reconcile(macros(), macros({ fatG: 80 })).onTarget).toBe(false);
  });
});

describe("reconcileMeal", () => {
  it("reads the meal's own targets against the meal's own foods", () => {
    const result = reconcileMeal(
      meal(
        macros({ proteinG: 40, carbG: 50, fatG: 15, kcal: 495 }),
        macros({
          proteinG: 40,
          carbG: 50,
          fatG: 22,
          kcal: 558,
        }),
      ),
    );

    expect(lineFor(result, "fatG")).toMatchObject({
      target: 15,
      actual: 22,
      delta: 7,
      state: "over",
    });
  });
});

describe("reconcileDay", () => {
  it("sums the meals on screen rather than reading the goal they came from", () => {
    const result = reconcileDay([
      meal(
        macros({ proteinG: 60, carbG: 80, fatG: 24, kcal: 776 }),
        macros({
          proteinG: 58,
          carbG: 80,
          fatG: 24,
          kcal: 768,
        }),
      ),
      meal(
        macros({ proteinG: 90, carbG: 120, fatG: 36, kcal: 1164 }),
        macros({
          proteinG: 92,
          carbG: 120,
          fatG: 36,
          kcal: 1172,
        }),
      ),
    ]);

    expect(lineFor(result, "proteinG").target).toBe(150);
    expect(lineFor(result, "proteinG").actual).toBe(150);
    expect(lineFor(result, "carbG").target).toBe(200);
    expect(result.onTarget).toBe(true);
  });

  it("adds the misses instead of cancelling them against the day's goal", () => {
    // Two meals 10 g short each is a day 20 g short, and the panel has to say
    // so even though neither meal is dramatic on its own.
    const short = macros({ proteinG: 40, carbG: 50, fatG: 15, kcal: 495 });
    const result = reconcileDay([
      meal(short, { ...short, proteinG: 30 }),
      meal(short, { ...short, proteinG: 30 }),
    ]);

    expect(lineFor(result, "proteinG").delta).toBe(-20);
    expect(result.onTarget).toBe(false);
  });

  it("has nothing to say about a plan with no meals", () => {
    const result = reconcileDay([]);

    expect(result.onTarget).toBe(true);
    expect(result.lines.every((line) => line.target === 0)).toBe(true);
  });
});
