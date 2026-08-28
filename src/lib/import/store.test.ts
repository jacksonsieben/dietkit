import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryRepository } from "@/lib/storage/memory";
import type { Repository } from "@/lib/storage/repository";
import type {
  CustomFood,
  Diet,
  FoodComposition,
  MacroGoal,
  Profile,
  SubstitutionGroup,
  WeightEntry,
} from "@/lib/storage/types";

import type { ImportResult } from "./import";
import {
  applyImport,
  fetchCompositions,
  importConflicts,
  loadImportBody,
} from "./store";

const NOW = "2026-08-19T12:00:00.000Z";

const profile: Profile = {
  heightCm: 178,
  birthDate: "1991-08-19",
  sex: "male",
  activityFactor: 1.55,
  updatedAt: NOW,
};

const weight: WeightEntry = {
  id: "weight-1",
  date: "2026-08-19",
  weightKg: 82,
  recordedAt: NOW,
};

const goal: MacroGoal = {
  kind: "lose",
  adjustment: { unit: "kcal", value: 500 },
  proteinGPerKg: 2.2,
  fat: { unit: "kcal", value: 660 },
};

const almonds: CustomFood = {
  id: "food-1",
  name: "Amêndoas",
  per100g: { kcal: 620, proteinG: 21, carbG: 20, fatG: 53 },
  createdAt: NOW,
  updatedAt: NOW,
};

const fruits: SubstitutionGroup = {
  id: "group-1",
  name: "Frutas",
  foods: [{ source: "taco", tacoId: 12 }],
  createdAt: NOW,
  updatedAt: NOW,
};

const diet: Diet = {
  id: "diet-1",
  name: "Plano importado",
  targets: { kcal: 2518, proteinG: 182, carbG: 281, fatG: 74 },
  meals: [
    {
      id: "meal-1",
      name: "Café da manhã",
      share: 0.25,
      items: [
        {
          id: "item-1",
          food: { source: "custom", customFoodId: almonds.id },
          quantityG: 30,
          mandatory: false,
          minG: 0,
          maxG: 60,
        },
      ],
    },
  ],
  createdAt: NOW,
  updatedAt: NOW,
};

const result: ImportResult = {
  diet,
  customFoods: [almonds],
  groups: [fruits],
  notes: [],
};

let repository: Repository;

beforeEach(() => {
  repository = createMemoryRepository();
});

describe("applyImport", () => {
  it("puts every record the import produced on the device", async () => {
    await applyImport(repository, result);

    await expect(repository.diets.list()).resolves.toEqual([diet]);
    await expect(repository.customFoods.list()).resolves.toEqual([almonds]);
    await expect(repository.substitutionGroups.list()).resolves.toEqual([
      fruits,
    ]);
  });

  it("writes what the plan points at before the plan itself", async () => {
    // Order is the whole point: a plan stored first is, for as long as the next
    // write takes, a plan whose item refers to a food that is not there — and
    // if that next write fails it stays that way.
    const order: string[] = [];
    const watched = watch(repository, order);

    await applyImport(watched, result);

    expect(order.indexOf("customFoods.put")).toBeLessThan(
      order.indexOf("diets.put"),
    );
    expect(order.indexOf("substitutionGroups.put")).toBeLessThan(
      order.indexOf("diets.put"),
    );
  });

  it("adds the imported plan beside the one already being worked on", async () => {
    const mine: Diet = { ...diet, id: "diet-mine", name: "Meu plano" };
    await repository.diets.put(mine);

    await applyImport(repository, result);

    const stored = await repository.diets.list();
    expect(stored.map((each) => each.id).sort()).toEqual([
      "diet-1",
      "diet-mine",
    ]);
  });

  it("leaves the profile, the weight log and the goal exactly as they were", async () => {
    // #123: the file is years old and the device is not. An import that
    // rewrote either of these would replace a current body with a remembered
    // one, and nothing on screen afterwards would look wrong.
    const mine: Profile = { ...profile, heightCm: 150 };
    const mineGoal: MacroGoal = { ...goal, kind: "gain" };
    await repository.profile.save(mine);
    await repository.settings.patch({ goal: mineGoal });
    await repository.weight.put(weight);

    await applyImport(repository, result);

    await expect(repository.profile.get()).resolves.toEqual(mine);
    expect((await repository.settings.get()).goal).toEqual(mineGoal);
    await expect(repository.weight.list()).resolves.toEqual([weight]);
  });
});

describe("importConflicts", () => {
  it("reports an untouched device as having nothing to lose", async () => {
    await expect(importConflicts(repository)).resolves.toEqual({ diets: 0 });
  });

  it("counts the plans the imported one is joining", async () => {
    await repository.profile.save(profile);
    await repository.diets.put(diet);

    // The profile is on the device and is *not* a conflict: only the plan count
    // is, because a plan is the only thing an import adds to.
    await expect(importConflicts(repository)).resolves.toEqual({ diets: 1 });
  });
});

describe("loadImportBody", () => {
  const today = "2026-08-19";

  it("names the profile as what is missing on a fresh device", async () => {
    await expect(loadImportBody(repository, today)).resolves.toEqual({
      status: "missing",
      needs: "profile",
    });
  });

  it("names the weight when the profile is filled but nothing was weighed", async () => {
    await repository.profile.save(profile);

    await expect(loadImportBody(repository, today)).resolves.toEqual({
      status: "missing",
      needs: "weight",
    });
  });

  it("names the goal rather than substituting the default one", async () => {
    // `loadGoal` would hand back `DEFAULT_MACRO_GOAL` here, which is right for
    // a screen that has to render something. Baking a maintenance preset the
    // user never chose into an imported plan is not the same thing.
    await repository.profile.save(profile);
    await repository.weight.put(weight);

    await expect(loadImportBody(repository, today)).resolves.toEqual({
      status: "missing",
      needs: "goal",
    });
  });

  it("computes the expenditure from the profile and the latest weighing", async () => {
    await repository.profile.save(profile);
    await repository.weight.put(weight);
    await repository.settings.patch({ goal });

    const state = await loadImportBody(repository, today);
    expect(state.status).toBe("ready");
    if (state.status !== "ready") return;

    // Mifflin-St Jeor for 82 kg, 178 cm, 35 years, male: 1762.5 kcal, x1.55.
    expect(state.body).toEqual({
      totalDailyEnergyExpenditure: 2731.875,
      weightKg: 82,
      goal,
    });
  });

  it("refuses a goal the store holds in a shape this version cannot read", async () => {
    await repository.profile.save(profile);
    await repository.weight.put(weight);
    await repository.settings.patch({
      goal: { kind: "lose" } as unknown as MacroGoal,
    });

    await expect(loadImportBody(repository, today)).resolves.toEqual({
      status: "missing",
      needs: "goal",
    });
  });
});

describe("fetchCompositions", () => {
  it("asks for every row it needs in one request", async () => {
    const asked: string[] = [];

    await fetchCompositions([1, 2, 3], async (url) => {
      asked.push(url);
      return ok([]);
    });

    expect(asked).toEqual(["/api/foods?ids=1,2,3"]);
  });

  it("does not ask when there is nothing to ask for", async () => {
    const asked: string[] = [];

    const found = await fetchCompositions([], async (url) => {
      asked.push(url);
      return ok([]);
    });

    expect(asked).toEqual([]);
    expect(found.size).toBe(0);
  });

  it("keys what came back by the id the plan refers to", async () => {
    const found = await fetchCompositions([12], async () =>
      ok([row({ id: 12, description: "Banana, prata, crua" })]),
    );

    expect([...found.keys()]).toEqual([12]);
    expect(found.get(12)).toEqual<FoodComposition>({
      tacoId: 12,
      name: "Banana, prata, crua",
      per100g: { kcal: 98, proteinG: 1.3, carbG: 26, fatG: 0.1 },
    });
  });

  it("leaves out a row TACO published no macros for", async () => {
    // Not a zero and not a guess: without it the import writes a
    // `compositionMissing` note and the item stays unresolved on the plan.
    const found = await fetchCompositions([458], async () =>
      ok([
        row({
          id: 458,
          description: "Leite, de vaca, integral",
          proteinG: null,
          sentinels: { proteinG: "*" },
        }),
      ]),
    );

    expect(found.size).toBe(0);
  });

  it("comes back empty when the server refused", async () => {
    // With a body that would read perfectly well: a 500 from a proxy, or an
    // error page, is not a table of foods however parseable it happens to be.
    const found = await fetchCompositions([12], async () => ({
      ...ok([row({ id: 12 })]),
      ok: false,
    }));

    expect(found.size).toBe(0);
  });

  it("comes back empty when there was no network at all", async () => {
    const found = await fetchCompositions([12], async () => {
      throw new Error("offline");
    });

    expect(found.size).toBe(0);
  });
});

/** A `FoodSearchResult` with the four macros filled in unless overridden. */
function row(edit: Record<string, unknown>) {
  return {
    id: 1,
    description: "Alimento",
    groupSlug: "frutas",
    groupName: "Frutas",
    energyKcal: 98,
    proteinG: 1.3,
    carbG: 26,
    fatG: 0.1,
    fiberG: 2,
    sentinels: {},
    ...edit,
  };
}

function ok(foods: readonly ReturnType<typeof row>[]) {
  return {
    ok: true,
    json: async () => ({ query: "", count: foods.length, foods }),
  };
}

/** Records the order the writes happen in, and changes nothing else. */
function watch(repository: Repository, order: string[]): Repository {
  const put =
    <T>(name: string, write: (value: T) => Promise<void>) =>
    (value: T) => {
      order.push(name);
      return write(value);
    };

  return {
    ...repository,
    customFoods: {
      ...repository.customFoods,
      put: put("customFoods.put", (food) => repository.customFoods.put(food)),
    },
    substitutionGroups: {
      ...repository.substitutionGroups,
      put: put("substitutionGroups.put", (group) =>
        repository.substitutionGroups.put(group),
      ),
    },
    diets: {
      ...repository.diets,
      put: put("diets.put", (value) => repository.diets.put(value)),
    },
  };
}
