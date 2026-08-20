import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { saveProfileForm } from "@/lib/profile/persistence";
import { createDietKitDatabase } from "@/lib/storage/dexie/db";
import { createDexieRepository } from "@/lib/storage/dexie/repository";
import type { Repository } from "@/lib/storage";
import type { Diet } from "@/lib/storage/types";

import { loadToday } from "./summary";

/**
 * Against the Dexie adapter, for the same reason `energy/summary.test.ts` is:
 * what is being checked is that six records written by five different screens
 * come back as one coherent answer, and a hand-built mock would only confirm
 * this file's assumptions about a store it invented.
 *
 * The claim that matters most here is the last one. The plan is solved against
 * *today's* targets rather than the targets stored on the diet when it was
 * written — that is the entire point of the screen (#25): a plan built at 90 kg
 * and still being eaten at 82 kg is a plan that has stopped fitting, and the
 * home screen is where that has to become visible.
 */
let repository: Repository;
let dispose: () => Promise<void>;

const TODAY = "2026-08-20";
const NOW = "2026-08-20T09:00:00.000Z";

/** 25 years old on `TODAY`, so the arithmetic underneath is stable. */
const PROFILE = {
  weightKg: 82,
  heightCm: 180,
  birthDate: "2001-01-01",
  sex: "male",
  activityFactor: 1.55,
} as const;

beforeEach(() => {
  const db = createDietKitDatabase(`today-test-${crypto.randomUUID()}`);
  repository = createDexieRepository(db);
  dispose = async () => {
    db.close();
    await db.delete();
  };
});

afterEach(async () => {
  await dispose();
});

async function withProfile(): Promise<void> {
  await saveProfileForm(repository, { ...PROFILE }, TODAY, NOW);
}

/**
 * A one-meal plan carrying the whole day, made of a single 100 % protein food.
 *
 * The row is mandatory by default, which pins the quantity where it is put and
 * makes the arithmetic assertions below exact. `free` unpins it, which is what
 * lets the solver actually move the row — and moving is the only way to observe
 * *which* set of targets it was solving against.
 */
function planOf(
  name: string,
  quantityG: number,
  targetsKcal: number,
  free = false,
): Diet {
  return {
    id: "diet-1",
    name,
    targets: { kcal: targetsKcal, proteinG: 100, carbG: 0, fatG: 0 },
    tacoFoods: [
      {
        tacoId: 1,
        name: "Proteína pura",
        per100g: { kcal: 400, proteinG: 100, carbG: 0, fatG: 0 },
      },
    ],
    meals: [
      {
        id: "meal-1",
        name: "Única",
        share: 1,
        items: [
          {
            id: "item-1",
            food: { source: "taco", tacoId: 1 },
            quantityG,
            // Mandatory pins the row (`composition.ts` collapses its bounds
            // onto the stated quantity), which is what the exact assertions
            // want and exactly what `free` has to undo.
            mandatory: !free,
            minG: free ? 0 : quantityG,
            maxG: free ? 1000 : quantityG,
          },
        ],
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("loadToday", () => {
  it("asks for a profile before anything else", async () => {
    const state = await loadToday(repository, TODAY);

    expect(state).toEqual({ status: "needs", needs: "profile" });
  });

  it("asks for a weighing when the profile is in but the scale is not", async () => {
    // Reachable in practice: a restore from a backup written before the weight
    // log existed, or a profile saved on a device the user has not weighed on.
    // The screen must ask for the measurement rather than invent one.
    await repository.profile.save({
      heightCm: PROFILE.heightCm,
      birthDate: PROFILE.birthDate,
      sex: PROFILE.sex,
      activityFactor: PROFILE.activityFactor,
      updatedAt: NOW,
    });

    const state = await loadToday(repository, TODAY);

    expect(state).toEqual({ status: "needs", needs: "weight" });
  });

  it("gives targets and a weight once the profile is in", async () => {
    await withProfile();

    const state = await loadToday(repository, TODAY);

    expect(state.status).toBe("ready");
    if (state.status !== "ready") return;

    expect(state.targets.kcal).toBeGreaterThan(0);
    expect(state.weight).toMatchObject({ kg: 82, on: TODAY });
  });

  it("has no plan to report when none has been written", async () => {
    await withProfile();

    const state = await loadToday(repository, TODAY);

    expect(state.status === "ready" && state.plan).toBeUndefined();
  });

  it("counts only the meals that have food in them", async () => {
    await withProfile();
    const diet = planOf("Plano", 100, 2000);
    diet.meals.push({ id: "meal-2", name: "Vazia", share: 0, items: [] });
    await repository.diets.put(diet);

    const state = await loadToday(repository, TODAY);

    expect(state.status === "ready" && state.plan).toMatchObject({
      name: "Plano",
      mealCount: 2,
      filledMealCount: 1,
    });
  });

  it("reports the plan against today's targets, not the ones it was written with", async () => {
    await withProfile();
    // A plan stamped with targets it visibly does not meet. If the screen read
    // the stored `targets`, it would still have to reconcile against today's —
    // so the way to catch a screen that trusts the stamp is to make the stamp a
    // number nothing else in the app would ever produce.
    await repository.diets.put(planOf("Antigo", 100, 1));

    const state = await loadToday(repository, TODAY);

    expect(state.status).toBe("ready");
    if (state.status !== "ready" || state.plan === undefined) {
      throw new Error("expected a plan");
    }

    const kcalLine = state.plan.reconciliation.lines.find(
      (line) => line.macro === "kcal",
    );
    expect(kcalLine?.target).toBe(Math.round(state.targets.kcal));
    expect(kcalLine?.target).not.toBe(1);
  });

  it("solves the plan against today's target rather than the one it was stamped with", async () => {
    await withProfile();
    // The plan was written for a much smaller person: 20 g of protein for the
    // day. Its one row is free to move between 0 and 1000 g, so if the solver
    // were handed the stored targets it would settle at 20 g of protein. Today's
    // protein target for an 82 kg body is far higher, and the gap between the
    // two answers is the whole of #25 made observable.
    const stale = planOf("Antigo", 100, 200, true);
    stale.targets = { kcal: 200, proteinG: 20, carbG: 0, fatG: 0 };
    await repository.diets.put(stale);

    const state = await loadToday(repository, TODAY);

    if (state.status !== "ready" || state.plan === undefined) {
      throw new Error("expected a plan");
    }
    expect(state.targets.proteinG).toBeGreaterThan(100);
    expect(state.plan.achieved.proteinG).toBeGreaterThan(100);
  });

  it("adds up what the plan actually contains", async () => {
    await withProfile();
    // 100 g of a food that is 100 g of protein per 100 g.
    await repository.diets.put(planOf("Plano", 100, 2000));

    const state = await loadToday(repository, TODAY);

    if (state.status !== "ready" || state.plan === undefined) {
      throw new Error("expected a plan");
    }
    expect(state.plan.achieved.proteinG).toBeCloseTo(100, 5);
  });
});
