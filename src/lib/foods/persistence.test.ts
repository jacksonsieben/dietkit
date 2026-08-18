import { describe, expect, it } from "vitest";

import { createMemoryRepository } from "@/lib/storage";

import { validateCustomFoodForm, type CustomFoodFormValues } from "./custom";
import { saveCustomFood } from "./persistence";

const WHEY: CustomFoodFormValues = {
  name: "Whey protein isolado",
  brand: "Growth",
  proteinG: "80",
  carbG: "6",
  fatG: "2",
  servingG: "30",
};

function input(overrides: Partial<CustomFoodFormValues> = {}) {
  const result = validateCustomFoodForm({ ...WHEY, ...overrides });
  if (!result.ok) throw new Error("fixture does not validate");
  return result.value;
}

const NOW = "2026-08-18T12:00:00.000Z";
const LATER = "2026-08-19T08:30:00.000Z";

describe("saveCustomFood", () => {
  it("stores a new food and makes it findable", async () => {
    const repository = createMemoryRepository();

    const saved = await saveCustomFood(repository, input(), undefined, NOW);

    expect(saved.createdAt).toBe(NOW);
    expect(saved.updatedAt).toBe(NOW);
    await expect(repository.customFoods.get(saved.id)).resolves.toEqual(saved);
    await expect(repository.customFoods.search("whey")).resolves.toEqual([saved]);
  });

  it("edits in place instead of adding a second food", async () => {
    const repository = createMemoryRepository();
    const first = await saveCustomFood(repository, input(), undefined, NOW);

    const edited = await saveCustomFood(
      repository,
      input({ proteinG: "82" }),
      first.id,
      LATER,
    );

    // The id is what a meal stores. A new one here would leave the plan on the
    // old macros with nothing on screen looking wrong.
    expect(edited.id).toBe(first.id);
    expect(await repository.customFoods.list()).toEqual([edited]);
    expect(edited.per100g.proteinG).toBe(82);
  });

  it("keeps the day the food was created, and moves the day it changed", async () => {
    const repository = createMemoryRepository();
    const first = await saveCustomFood(repository, input(), undefined, NOW);

    const edited = await saveCustomFood(repository, input({ fatG: "3" }), first.id, LATER);

    expect(edited.createdAt).toBe(NOW);
    expect(edited.updatedAt).toBe(LATER);
  });

  it("restores a food deleted under the open form, under its own id", async () => {
    // Two tabs, or a delete and a back button. The plan that references this id
    // is worth more than insisting the row must still have been there.
    const repository = createMemoryRepository();
    const first = await saveCustomFood(repository, input(), undefined, NOW);
    await repository.customFoods.remove(first.id);

    const again = await saveCustomFood(repository, input(), first.id, LATER);

    expect(again.id).toBe(first.id);
    expect(again.createdAt).toBe(LATER);
  });

  it("gives each new food its own id", async () => {
    const repository = createMemoryRepository();

    await saveCustomFood(repository, input({ name: "Pão de forma" }), undefined, NOW);
    await saveCustomFood(repository, input({ name: "Pão integral" }), undefined, NOW);

    expect((await repository.customFoods.list()).length).toBe(2);
  });

  it("touches nothing else on the device", async () => {
    // The food list is one store among five, and a save that reached past it
    // would be a personal-data bug rather than a food bug.
    const repository = createMemoryRepository();
    await repository.weight.put({
      id: "w1",
      date: "2026-08-18",
      weightKg: 82,
      recordedAt: NOW,
    });

    await saveCustomFood(repository, input(), undefined, NOW);

    const snapshot = await repository.exportAll();
    expect(snapshot.weight.length).toBe(1);
    expect(snapshot.diets).toEqual([]);
    expect(snapshot.profile).toBeUndefined();
  });
});
