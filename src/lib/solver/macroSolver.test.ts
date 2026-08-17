import { describe, expect, it } from "vitest";

import { FIXTURE_FOODS, FIXTURE_FOOD_IDS } from "./foods.fixture";
import { solveMacros, type MacroTargets, type SolverFood } from "./macroSolver";

function food(
  id: keyof typeof FIXTURE_FOODS,
  bounds: { min: number; max: number; start?: number },
): SolverFood {
  return {
    id,
    per100g: FIXTURE_FOODS[id]!,
    minG: bounds.min,
    maxG: bounds.max,
    quantityG: bounds.start ?? (bounds.min + bounds.max) / 2,
  };
}

function pinned(id: keyof typeof FIXTURE_FOODS, grams: number): SolverFood {
  return { id, per100g: FIXTURE_FOODS[id]!, minG: grams, maxG: grams, quantityG: grams };
}

function quantityOf(
  solution: ReturnType<typeof solveMacros>,
  id: string,
): number {
  return solution.items.find((item) => item.foodId === id)!.quantityG;
}

/**
 * The predecessor's algorithm, reduced to its essentials: scale the carb option
 * to cover the carb target, scale the protein option to cover the protein
 * target, close whatever fat gap is left with the vehicle. Mandatory items are
 * credited (the predecessor did fix that); cross-macro carry-over is not.
 *
 * Present so the improvement claim below is measured against something concrete
 * rather than asserted.
 */
function naiveSingleMacroPlan(input: {
  mandatory: { id: keyof typeof FIXTURE_FOODS; grams: number }[];
  carbOption: keyof typeof FIXTURE_FOODS;
  proteinOption: keyof typeof FIXTURE_FOODS;
  fatVehicle: keyof typeof FIXTURE_FOODS;
  targets: MacroTargets;
}): { proteinG: number; carbG: number; fatG: number } {
  const totals = { proteinG: 0, carbG: 0, fatG: 0 };
  const add = (id: keyof typeof FIXTURE_FOODS, grams: number) => {
    const per = FIXTURE_FOODS[id]!;
    totals.proteinG += (per.proteinG * grams) / 100;
    totals.carbG += (per.carbG * grams) / 100;
    totals.fatG += (per.fatG * grams) / 100;
  };

  for (const item of input.mandatory) add(item.id, item.grams);

  // Both scaling targets are fixed here, from the mandatory items alone. That
  // is the predecessor's shape and its remaining bug: each option is then sized
  // against its own macro in isolation, so whatever protein the carb option
  // carries is never credited. Cause 3 in MACRO-RECONCILIATION.md.
  const carbGap = Math.max(0, input.targets.carbG - totals.carbG);
  const proteinGap = Math.max(0, input.targets.proteinG - totals.proteinG);

  add(input.carbOption, (carbGap / FIXTURE_FOODS[input.carbOption]!.carbG) * 100);
  add(
    input.proteinOption,
    (proteinGap / FIXTURE_FOODS[input.proteinOption]!.proteinG) * 100,
  );

  const fatGap = Math.max(0, input.targets.fatG - totals.fatG);
  add(input.fatVehicle, (fatGap / FIXTURE_FOODS[input.fatVehicle]!.fatG) * 100);

  return totals;
}

describe("solveMacros", () => {
  const mealTargets: MacroTargets = { proteinG: 45, carbG: 75, fatG: 20 };

  const breakfast: SolverFood[] = [
    pinned("leite", 200),
    food("aveia", { min: 20, max: 150, start: 60 }),
    food("whey", { min: 0, max: 60, start: 30 }),
    food("azeite", { min: 0, max: 30, start: 5 }),
  ];

  it("hits all three macros at once on a feasible meal", () => {
    const solution = solveMacros(breakfast, mealTargets);

    expect(solution.converged).toBe(true);
    expect(solution.feasible).toBe(true);
    expect(solution.residual.proteinG).toBeCloseTo(0, 0);
    expect(solution.residual.carbG).toBeCloseTo(0, 0);
    expect(solution.residual.fatG).toBeCloseTo(0, 0);
    expect(solution.limiting).toEqual([]);
  });

  it("beats per-macro scaling on the cross-macro carry-over it was written for", () => {
    const naive = naiveSingleMacroPlan({
      mandatory: [{ id: "leite", grams: 200 }],
      carbOption: "aveia",
      proteinOption: "whey",
      fatVehicle: "azeite",
      targets: mealTargets,
    });

    const naiveError =
      Math.abs(naive.proteinG - mealTargets.proteinG) +
      Math.abs(naive.carbG - mealTargets.carbG) +
      Math.abs(naive.fatG - mealTargets.fatG);

    const solution = solveMacros(breakfast, mealTargets);
    const jointError =
      Math.abs(solution.residual.proteinG) +
      Math.abs(solution.residual.carbG) +
      Math.abs(solution.residual.fatG);

    // The documented failure: the carb option's protein is never credited, so
    // protein lands well over while fat lands exactly on target.
    expect(naive.proteinG - mealTargets.proteinG).toBeGreaterThan(10);
    expect(naive.fatG).toBeCloseTo(mealTargets.fatG, 5);

    // What is left is whole-gram rounding, roughly a gram spread over three
    // macros — against a 14 g protein overshoot.
    expect(solution.feasible).toBe(true);
    expect(jointError).toBeLessThan(2);
    expect(jointError).toBeLessThan(naiveError / 5);
  });

  it("treats the fat vehicle as an ordinary variable, not a special case", () => {
    // Same meal, fat target raised. No pooling pass, no vehicle constant —
    // the oil simply moves because it is the cheapest way to close fat.
    const low = solveMacros(breakfast, { ...mealTargets, fatG: 15 });
    const high = solveMacros(breakfast, { ...mealTargets, fatG: 35 });

    expect(quantityOf(high, "azeite")).toBeGreaterThan(quantityOf(low, "azeite"));
    expect(high.residual.proteinG).toBeCloseTo(0, 0);
    expect(high.residual.carbG).toBeCloseTo(0, 0);
  });

  it("never leaves the box, and never moves a pinned item", () => {
    const solution = solveMacros(breakfast, {
      proteinG: 300,
      carbG: 400,
      fatG: 200,
    });

    for (const item of solution.items) {
      const source = breakfast.find((f) => f.id === item.foodId)!;
      expect(item.quantityG).toBeGreaterThanOrEqual(source.minG);
      expect(item.quantityG).toBeLessThanOrEqual(source.maxG);
    }
    expect(quantityOf(solution, "leite")).toBe(200);
    expect(solution.items.find((i) => i.foodId === "leite")?.pinned).toBe(true);
  });

  it("reports an impossible target as a residual instead of mis-solving it", () => {
    const solution = solveMacros(breakfast, {
      proteinG: 200,
      carbG: 75,
      fatG: 20,
    });

    expect(solution.feasible).toBe(false);
    // Short, not silently over: the shortfall is the honest number to show.
    expect(solution.residual.proteinG).toBeLessThan(-50);
    expect(solution.limiting.map((item) => item.foodId)).toContain("whey");
    for (const item of solution.limiting) {
      expect(item.atBound).toBe("max");
      expect(item.pinned).toBe(false);
    }
  });

  it("does not blame a pinned mandatory item for a missed macro", () => {
    // Protein is unreachable, and `leite` carries protein — but its quantity was
    // never the solver's to choose, so telling the user to raise its ceiling
    // would be nonsense.
    const solution = solveMacros(breakfast, {
      proteinG: 200,
      carbG: 75,
      fatG: 20,
    });

    expect(solution.limiting.map((item) => item.foodId)).not.toContain("leite");
  });

  it("reports energy against a kcal target without solving for it", () => {
    const withTarget = solveMacros(breakfast, { ...mealTargets, kcal: 700 });
    const withoutTarget = solveMacros(breakfast, mealTargets);

    expect(withoutTarget.residual.kcal).toBeNull();
    expect(withTarget.residual.kcal).toBeCloseTo(withTarget.achieved.kcal - 700, 6);
    // Adding the kcal target must not change the quantities chosen.
    expect(withTarget.items).toEqual(withoutTarget.items);
  });

  it("reports totals that match the rounded quantities it hands back", () => {
    const solution = solveMacros(breakfast, mealTargets);

    const recomputed = solution.items.reduce(
      (totals, item) => {
        const per = FIXTURE_FOODS[item.foodId]!;
        const factor = item.quantityG / 100;
        return {
          kcal: totals.kcal + per.kcal * factor,
          proteinG: totals.proteinG + per.proteinG * factor,
          carbG: totals.carbG + per.carbG * factor,
          fatG: totals.fatG + per.fatG * factor,
        };
      },
      { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 },
    );

    expect(solution.achieved.kcal).toBeCloseTo(recomputed.kcal, 6);
    expect(solution.achieved.proteinG).toBeCloseTo(recomputed.proteinG, 6);
    expect(solution.achieved.carbG).toBeCloseTo(recomputed.carbG, 6);
    expect(solution.achieved.fatG).toBeCloseTo(recomputed.fatG, 6);
    for (const item of solution.items) {
      expect(Number.isInteger(item.quantityG)).toBe(true);
    }
  });

  it("is deterministic", () => {
    const a = solveMacros(breakfast, mealTargets);
    const b = solveMacros(breakfast, mealTargets);

    expect(a.items).toEqual(b.items);
  });

  describe("stability under editing", () => {
    // Three equations, many unknowns: the fit alone has infinitely many exact
    // solutions. Anchoring is what stops the solver picking a different one
    // every keystroke.
    const dinner: SolverFood[] = [
      food("arroz", { min: 0, max: 300, start: 150 }),
      food("feijao", { min: 0, max: 250, start: 100 }),
      food("frango", { min: 50, max: 300, start: 150 }),
      food("batataDoce", { min: 0, max: 300, start: 100 }),
      food("brocolis", { min: 0, max: 200, start: 80 }),
      food("azeite", { min: 0, max: 40, start: 10 }),
      food("castanha", { min: 0, max: 60, start: 15 }),
    ];
    const dinnerTargets: MacroTargets = { proteinG: 60, carbG: 110, fatG: 30 };

    it("moves portions a little when a target moves a little", () => {
      const base = solveMacros(dinner, dinnerTargets);
      const nudged = solveMacros(dinner, {
        ...dinnerTargets,
        proteinG: dinnerTargets.proteinG + 2,
      });

      expect(base.feasible).toBe(true);
      expect(nudged.feasible).toBe(true);

      const biggestSwing = Math.max(
        ...dinner.map((f) =>
          Math.abs(quantityOf(nudged, f.id) - quantityOf(base, f.id)),
        ),
      );
      expect(biggestSwing).toBeLessThan(25);
    });

    it("leaves an already-solved plan alone", () => {
      const solved = solveMacros(dinner, dinnerTargets);
      const resolved = solveMacros(
        dinner.map((f) => ({ ...f, quantityG: quantityOf(solved, f.id) })),
        dinnerTargets,
      );

      expect(solved.feasible).toBe(true);
      // Reopening the builder must not silently rewrite the user's plan.
      expect(resolved.items).toEqual(solved.items);
    });

    it("keeps each starting plan near where it started, not at one canonical answer", () => {
      // Wide bounds and a reachable target: the fit alone has infinitely many
      // solutions, so what the solver returns is decided by the anchor.
      const compose = (starts: readonly number[]): SolverFood[] =>
        dinner.map((f, j) => ({ ...f, quantityG: starts[j]! }));

      const firstStart = [200, 60, 180, 40, 100, 8, 10];
      const secondStart = [80, 200, 120, 180, 60, 20, 25];
      const first = solveMacros(compose(firstStart), dinnerTargets);
      const second = solveMacros(compose(secondStart), dinnerTargets);

      expect(first.feasible).toBe(true);
      expect(second.feasible).toBe(true);

      const distanceTo = (
        solution: ReturnType<typeof solveMacros>,
        starts: readonly number[],
      ) =>
        dinner.reduce(
          (sum, f, j) => sum + Math.abs(quantityOf(solution, f.id) - starts[j]!),
          0,
        );

      expect(distanceTo(first, firstStart)).toBeLessThan(
        distanceTo(first, secondStart),
      );
      expect(distanceTo(second, secondStart)).toBeLessThan(
        distanceTo(second, firstStart),
      );
      // And the two answers really are different — the anchor is doing work,
      // not being rounded away.
      expect(
        Math.max(
          ...dinner.map((f) =>
            Math.abs(quantityOf(first, f.id) - quantityOf(second, f.id)),
          ),
        ),
      ).toBeGreaterThan(20);
    });
  });

  describe("edge cases", () => {
    it("handles a meal with no foods", () => {
      const solution = solveMacros([], mealTargets);

      expect(solution.items).toEqual([]);
      expect(solution.residual.proteinG).toBe(-45);
      expect(solution.feasible).toBe(false);
    });

    it("handles a food that contributes no macros", () => {
      const solution = solveMacros(
        [
          ...breakfast,
          {
            id: "agua",
            per100g: { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 },
            minG: 0,
            maxG: 500,
            quantityG: 250,
          },
        ],
        mealTargets,
      );

      expect(solution.feasible).toBe(true);
      expect(quantityOf(solution, "agua")).toBe(250);
    });

    it("tolerates bounds given the wrong way round", () => {
      const solution = solveMacros(
        [pinned("leite", 200), food("aveia", { min: 150, max: 20, start: 60 })],
        { proteinG: 45, carbG: 75, fatG: 20 },
      );

      const aveia = quantityOf(solution, "aveia");
      expect(aveia).toBeGreaterThanOrEqual(20);
      expect(aveia).toBeLessThanOrEqual(150);
    });
  });

  describe("performance", () => {
    const build = (count: number): SolverFood[] =>
      FIXTURE_FOOD_IDS.slice(0, count).map((id) =>
        food(id as keyof typeof FIXTURE_FOODS, { min: 0, max: 300, start: 100 }),
      );

    it.each([5, 10, 15, 30])(
      "solves %i foods well inside the 50 ms input-change budget",
      (count) => {
        const foods = count <= FIXTURE_FOOD_IDS.length
          ? build(count)
          : [...build(FIXTURE_FOOD_IDS.length), ...build(count - FIXTURE_FOOD_IDS.length).map((f, i) => ({ ...f, id: `${f.id}-${i}` }))];
        const targets: MacroTargets = { proteinG: 140, carbG: 300, fatG: 70 };

        // Warm the JIT so the measurement is of steady-state, which is what a
        // slider drag actually hits.
        for (let i = 0; i < 50; i += 1) solveMacros(foods, targets);

        const runs = 200;
        const started = performance.now();
        for (let i = 0; i < runs; i += 1) solveMacros(foods, targets);
        const perSolve = (performance.now() - started) / runs;

        const solution = solveMacros(foods, targets);
        console.log(
          `  ${String(count).padStart(2)} foods: ${perSolve.toFixed(3)} ms/solve` +
            `, ${solution.iterations} iteration(s)`,
        );
        expect(perSolve).toBeLessThan(50);
        // Fast *and* finished. Reporting a plan the solver had not actually
        // settled on would be the worse failure of the two.
        expect(solution.converged).toBe(true);
      },
    );

    it("converges in a bounded number of sweeps on a hard, tightly-bounded meal", () => {
      const foods = FIXTURE_FOOD_IDS.map((id) =>
        food(id as keyof typeof FIXTURE_FOODS, { min: 10, max: 40, start: 25 }),
      );
      const solution = solveMacros(foods, {
        proteinG: 90,
        carbG: 140,
        fatG: 55,
      });

      expect(solution.converged).toBe(true);
      // The active-set Newton step is what buys this. Coordinate descent alone
      // needed thousands of sweeps on problems this flat, so a regression here
      // means the step has stopped working, not that the bound is too strict.
      expect(solution.iterations).toBeLessThanOrEqual(10);
    });
  });
});
