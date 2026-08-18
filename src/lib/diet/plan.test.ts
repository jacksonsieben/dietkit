import { describe, expect, it } from "vitest";

import { createMemoryRepository } from "@/lib/storage";
import type { MacroSet } from "@/lib/storage/types";

import { mealsFromNames } from "./meals";
import { loadPlan, newPlan, savePlan } from "./plan";

const TARGETS: MacroSet = { proteinG: 187, carbG: 200, fatG: 67, kcal: 2151 };
const NOW = "2026-08-18T12:00:00.000Z";
const LATER = "2026-08-19T08:30:00.000Z";

const MEALS = mealsFromNames([
  { id: "1", name: "Café da manhã" },
  { id: "2", name: "Almoço" },
  { id: "3", name: "Jantar" },
]);

function draft(id = "plan-1") {
  return newPlan({ id, name: "Meu plano" }, MEALS, TARGETS, 80, NOW);
}

describe("newPlan", () => {
  it("builds a plan without writing one", async () => {
    const repository = createMemoryRepository();

    const plan = draft();

    expect(plan.meals).toHaveLength(3);
    expect(plan.createdAt).toBe(NOW);
    expect(plan.updatedAt).toBe(NOW);
    // The whole point: opening the screen must not leave a record behind.
    await expect(repository.diets.list()).resolves.toEqual([]);
  });
});

describe("savePlan", () => {
  it("stores the plan and moves only the update time", async () => {
    const repository = createMemoryRepository();

    const saved = await savePlan(repository, draft(), LATER);

    expect(saved.createdAt).toBe(NOW);
    expect(saved.updatedAt).toBe(LATER);
    await expect(repository.diets.get(saved.id)).resolves.toEqual(saved);
  });

  it("keeps the targets the meals were divided from", async () => {
    const repository = createMemoryRepository();

    const saved = await savePlan(repository, draft(), NOW);

    expect(saved.targets).toEqual(TARGETS);
    expect(saved.basedOnWeightKg).toBe(80);
  });

  it("edits in place rather than piling up copies of the same plan", async () => {
    const repository = createMemoryRepository();
    const first = await savePlan(repository, draft(), NOW);

    await savePlan(repository, { ...first, name: "Cutting" }, LATER);

    const stored = await repository.diets.list();
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Cutting");
  });
});

describe("loadPlan", () => {
  it("has nothing to open on a fresh device", async () => {
    await expect(loadPlan(createMemoryRepository())).resolves.toBeUndefined();
  });

  it("opens the plan that was worked on last, not the one created first", async () => {
    const repository = createMemoryRepository();
    await savePlan(repository, draft("older"), NOW);
    await savePlan(repository, draft("newer"), LATER);

    await expect(loadPlan(repository)).resolves.toMatchObject({ id: "newer" });
  });
});
