import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { messages } from "@/i18n/messages";

import {
  CEILING_BY_GROUP,
  PORTIONS,
  ceilingFor,
  ceilingForFood,
  groupOfTacoFood,
  portionCount,
  portionOf,
} from "./portions";

const published = JSON.parse(readFileSync("data/taco-4ed.json", "utf8")) as {
  foods: readonly { id: number; groupSlug: string; description: string }[];
};

const byId = new Map(published.foods.map((food) => [food.id, food]));

describe("the portions table", () => {
  it("names foods the published table actually has", () => {
    // A typo in an id does not fail loudly — it quietly hangs "~6 ovos" off
    // some other food, which is the one error this feature could make that a
    // person would believe.
    for (const id of PORTIONS.keys()) {
      expect(byId.get(id), `no TACO food with id ${id}`).toBeDefined();
    }
  });

  it("weighs every portion as a positive number of grams", () => {
    for (const [id, portion] of PORTIONS) {
      expect(portion.gramsPerUnit, `id ${id}`).toBeGreaterThan(0);
      expect(portion.gramsPerUnit, `id ${id}`).toBeLessThan(500);
    }
  });

  it("has a translated unit for every portion it uses", () => {
    // The unit is a message key chosen from data, so nothing type-checks the
    // pair. A missing one would render the key path to a user.
    const units = messages["pt-BR"].Portions;

    for (const [id, portion] of PORTIONS) {
      expect(units, `unit "${portion.unit}" for id ${id}`).toHaveProperty(
        portion.unit,
      );
    }
  });

  it("covers the foods a day is actually built out of", () => {
    // Not a count for its own sake: the feature is worth nothing if the staples
    // are missing, and this is the cheapest way to notice a table that was
    // trimmed to the point of never appearing.
    for (const id of [489, 3, 53, 179, 458, 410, 567, 260]) {
      expect(PORTIONS.get(id), byId.get(id)?.description).toBeDefined();
    }
  });

  it("gives a custom food no portion", () => {
    // The user already told us what one serving of their own food weighs, and
    // that number is on the item, not in this table.
    expect(portionOf({ source: "custom", customFoodId: "c1" })).toBeUndefined();
  });

  it("gives an uncovered TACO food no portion", () => {
    expect(portionOf({ source: "taco", tacoId: 489 })).toBeDefined();
    expect(portionOf({ source: "taco", tacoId: 340 })).toBeUndefined();
  });
});

describe("portionCount", () => {
  const ovo = { unit: "ovo", gramsPerUnit: 50 } as const;
  const morango = { unit: "unidade", gramsPerUnit: 12 } as const;

  it("counts whole portions", () => {
    expect(portionCount(300, ovo)).toBe(6);
  });

  it("keeps a half while halves still mean something", () => {
    expect(portionCount(125, ovo)).toBe(2.5);
  });

  it("rounds to a whole once there are ten of them", () => {
    // "12,5 morangos" is a precision the estimate behind it does not have.
    expect(portionCount(150, morango)).toBe(13);
  });

  it("says nothing about a trace", () => {
    // A pinch of garlic is not "~0 unidades", and a hint that rounds to zero is
    // worse than no hint at all.
    expect(portionCount(5, ovo)).toBeUndefined();
  });

  it("says nothing once the count stops being a picture", () => {
    expect(portionCount(2000, morango)).toBeUndefined();
  });
});

describe("ceilingFor", () => {
  it("names groups the published table actually has", () => {
    const slugs = new Set(published.foods.map((food) => food.groupSlug));

    for (const slug of Object.keys(CEILING_BY_GROUP)) {
      expect(slugs.has(slug), `no TACO group "${slug}"`).toBe(true);
    }
  });

  it("holds fats far below the flat default", () => {
    // The whole point: 500 g of olive oil was a legal answer to a 2.000 kcal
    // day, and it is the answer a solver reaches for.
    expect(ceilingFor("gorduras-e-oleos")).toBe(60);
  });

  it("stops a breakfast of six eggs", () => {
    const ceiling = ceilingFor("ovos-e-derivados");

    expect(ceiling).toBeDefined();
    expect(ceiling! / 50).toBeLessThan(6);
  });

  it("has no opinion about a group it does not cover", () => {
    // Prepared dishes and drinks keep the old default, because a plate of
    // feijoada and a scoop of whey share no sensible bound.
    expect(ceilingFor("alimentos-preparados")).toBeUndefined();
  });

  it("has no opinion about a food with no group at all", () => {
    expect(ceilingFor(undefined)).toBeUndefined();
  });
});

describe("groupOfTacoFood", () => {
  it("agrees with the published table about every single food", () => {
    // The whole basis of the shortcut: fifteen id runs standing in for 597
    // rows. If a re-ingest ever renumbers anything, this is where it surfaces —
    // and it has to surface, because the failure it prevents is silent, a
    // ceiling meant for oil landing on a fruit.
    for (const food of published.foods) {
      expect(groupOfTacoFood(food.id), food.description).toBe(food.groupSlug);
    }
  });

  it("has nothing to say about an id the table never printed", () => {
    expect(groupOfTacoFood(0)).toBeUndefined();
    expect(groupOfTacoFood(598)).toBeUndefined();
  });
});

describe("ceilingForFood", () => {
  it("caps an oil a plan already points at", () => {
    // 260 is "Azeite, de oliva, extra virgem" — the row #D exists for.
    expect(ceilingForFood({ source: "taco", tacoId: 260 })).toBe(60);
  });

  it("has no opinion about the user's own food", () => {
    // They already said what a serving of it weighs.
    expect(
      ceilingForFood({ source: "custom", customFoodId: "c1" }),
    ).toBeUndefined();
  });
});
