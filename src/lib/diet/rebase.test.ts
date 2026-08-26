import { describe, expect, it } from "vitest";

import type { Diet, MacroSet } from "@/lib/storage/types";

import { mealsFromNames } from "./meals";
import { newPlan } from "./plan";
import { REBASE_THRESHOLD_KG, rebasePlan, weightDrift } from "./rebase";

const TARGETS: MacroSet = { proteinG: 160, carbG: 220, fatG: 62, kcal: 2078 };
const FRESH: MacroSet = { proteinG: 150, carbG: 205, fatG: 58, kcal: 1942 };
const NOW = "2026-08-10T09:00:00.000Z";

const MEALS = mealsFromNames([
  { id: "1", name: "Café da manhã" },
  { id: "2", name: "Almoço" },
]);

const plan = (basedOnWeightKg: number): Diet =>
  newPlan(
    { id: "plan-1", name: "Meu plano" },
    MEALS,
    TARGETS,
    basedOnWeightKg,
    NOW,
  );

/**
 * A plan from before the weight was recorded, or one imported from the
 * predecessor. Built by taking the field off rather than by passing `undefined`
 * to `newPlan`, which cannot produce one — that it cannot is the point.
 */
const planWithoutWeight = (): Diet => {
  const { basedOnWeightKg: _dropped, ...rest } = plan(80);
  return rest;
};

describe("weightDrift", () => {
  it("reports the gap between the plan's weight and today's", () => {
    expect(weightDrift(plan(80), 77)).toEqual({
      fromKg: 80,
      toKg: 77,
      deltaKg: -3,
    });
  });

  it("keeps the sign, because losing and gaining are not the same news", () => {
    // Both directions are legitimate goals here, and a banner that said
    // "3 kg de diferença" would leave the reader working out which way.
    expect(weightDrift(plan(80), 83)?.deltaKg).toBe(3);
    expect(weightDrift(plan(80), 77)?.deltaKg).toBe(-3);
  });

  it("says nothing about a body that has not really moved", () => {
    // A scale swings a kilogram on water alone; a banner every visit is one
    // nobody reads by the third week.
    expect(weightDrift(plan(80), 80)).toBeUndefined();
    expect(weightDrift(plan(80), 80.4)).toBeUndefined();
    expect(weightDrift(plan(80), 79.6)).toBeUndefined();
  });

  it("speaks up exactly at the threshold, in both directions", () => {
    expect(weightDrift(plan(80), 80 + REBASE_THRESHOLD_KG)).toBeDefined();
    expect(weightDrift(plan(80), 80 - REBASE_THRESHOLD_KG)).toBeDefined();
  });

  it("stays quiet about a plan that never recorded a weight", () => {
    // Assuming today's would claim the plan is current when nobody knows it is.
    expect(weightDrift(planWithoutWeight(), 95)).toBeUndefined();
  });
});

describe("rebasePlan", () => {
  it("re-aims the plan at the targets today's body asks for", () => {
    const rebased = rebasePlan(plan(80), FRESH, 77);

    expect(rebased.targets).toEqual(FRESH);
    expect(rebased.basedOnWeightKg).toBe(77);
  });

  it("leaves the meals alone", () => {
    // Names, order, shares, foods and bounds are the user's work, and none of
    // it depends on the weight. Only the total the shares are taken of moves.
    const before = plan(80);
    const rebased = rebasePlan(before, FRESH, 77);

    expect(rebased.meals).toEqual(before.meals);
    expect(rebased.id).toBe(before.id);
    expect(rebased.name).toBe(before.name);
    expect(rebased.createdAt).toBe(before.createdAt);
  });

  it("does not stamp the plan as saved", () => {
    // This returns what the screen should show, not what the store should hold.
    // A rebuild someone looked at and backed out of leaves no trace.
    const before = plan(80);

    expect(rebasePlan(before, FRESH, 77).updatedAt).toBe(before.updatedAt);
  });

  it("leaves the plan it was given untouched", () => {
    const before = plan(80);
    rebasePlan(before, FRESH, 77);

    expect(before.targets).toEqual(TARGETS);
    expect(before.basedOnWeightKg).toBe(80);
  });

  it("settles the drift it was called about", () => {
    // The banner has to go away when the button is pressed, and it does so
    // because the two functions agree about what the plan's weight now is.
    const rebased = rebasePlan(plan(80), FRESH, 77);

    expect(weightDrift(rebased, 77)).toBeUndefined();
  });
});
