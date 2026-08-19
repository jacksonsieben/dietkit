import { describe, expect, it } from "vitest";

import type {
  FoodComposition,
  Meal,
  SubstitutionGroup,
} from "@/lib/storage/types";

import { buildFoodBook } from "./composition";
import {
  GROUP_LIMITS,
  addGroupFood,
  alternativesFor,
  canAddGroup,
  canAddGroupFood,
  checkGroupName,
  findGroup,
  groupCompositions,
  groupsForFood,
  keptCompositions,
  removeGroupFood,
  toGroup,
  validateGroup,
} from "./groups";

const banana = { source: "taco", tacoId: 12 } as const;
const mamao = { source: "taco", tacoId: 48 } as const;
const maca = { source: "taco", tacoId: 61 } as const;
const whey = { source: "custom", customFoodId: "w1" } as const;

function composition(tacoId: number, name: string): FoodComposition {
  return {
    tacoId,
    name,
    per100g: { kcal: 98, proteinG: 1.3, carbG: 26, fatG: 0.1 },
  };
}

function group(over: Partial<SubstitutionGroup> = {}): SubstitutionGroup {
  return {
    id: "g1",
    name: "Frutas",
    foods: [banana, mamao],
    tacoFoods: [composition(12, "Banana prata"), composition(48, "Mamão")],
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...over,
  };
}

describe("checkGroupName", () => {
  it("refuses an empty name", () => {
    expect(checkGroupName("   ")).toEqual({ error: "required" });
  });

  it("refuses a name too short to mean anything", () => {
    expect(checkGroupName("F")).toEqual({ error: "nameLength" });
  });

  it("refuses a name past the limit", () => {
    const long = "a".repeat(GROUP_LIMITS.nameLength.max + 1);
    expect(checkGroupName(long)).toEqual({ error: "nameLength" });
  });

  it("trims, because the name is what appears in the swap control", () => {
    expect(checkGroupName("  Frutas  ")).toEqual({ value: "Frutas" });
  });

  it("refuses a name another group already uses, accents and case aside", () => {
    // The id never reaches the screen, so two "Frutas" would be two identical
    // options holding different foods.
    expect(checkGroupName("frutas", [group()])).toEqual({ error: "nameTaken" });
    expect(checkGroupName("FRUTAS", [group()])).toEqual({ error: "nameTaken" });
  });

  it("lets a group keep its own name while its foods change", () => {
    expect(checkGroupName("Frutas", [group()], "g1")).toEqual({
      value: "Frutas",
    });
  });
});

describe("validateGroup", () => {
  it("refuses a group of one, which offers no substitution", () => {
    const result = validateGroup({ name: "Frutas", foods: [banana] });
    expect(result).toEqual({ ok: false, errors: { foods: "tooFewFoods" } });
  });

  it("counts a repeated food once, so a duplicate cannot pad the minimum", () => {
    const result = validateGroup({ name: "Frutas", foods: [banana, banana] });
    expect(result).toEqual({ ok: false, errors: { foods: "tooFewFoods" } });
  });

  it("refuses more members than the swap control can be read as", () => {
    const foods = Array.from(
      { length: GROUP_LIMITS.foods.max + 1 },
      (_, i) => ({ source: "taco", tacoId: i + 1 }) as const,
    );
    const result = validateGroup({ name: "Frutas", foods });
    expect(result).toEqual({ ok: false, errors: { foods: "tooManyFoods" } });
  });

  it("reports everything wrong in one pass", () => {
    expect(validateGroup({ name: "", foods: [] })).toEqual({
      ok: false,
      errors: { name: "required", foods: "tooFewFoods" },
    });
  });

  it("keeps only the snapshots the surviving members need", () => {
    const result = validateGroup({
      name: "Frutas",
      foods: [banana, mamao],
      tacoFoods: [
        composition(12, "Banana prata"),
        composition(48, "Mamão"),
        composition(99, "Abacaxi"),
      ],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        name: "Frutas",
        foods: [banana, mamao],
        tacoFoods: [composition(12, "Banana prata"), composition(48, "Mamão")],
      },
    });
  });

  it("accepts foods from both sources in one group", () => {
    const result = validateGroup({ name: "Proteína", foods: [banana, whey] });
    expect(result.ok).toBe(true);
  });
});

describe("keptCompositions", () => {
  it("drops the copy when its member leaves", () => {
    const kept = keptCompositions(
      [mamao],
      [composition(12, "Banana prata"), composition(48, "Mamão")],
    );
    expect(kept).toEqual([composition(48, "Mamão")]);
  });

  it("says nothing about custom foods, which are read live from the device", () => {
    expect(keptCompositions([whey], [composition(12, "Banana prata")])).toEqual(
      [],
    );
  });
});

describe("addGroupFood and removeGroupFood", () => {
  it("adds in the order the user chose", () => {
    expect(addGroupFood([banana], mamao)).toEqual([banana, mamao]);
  });

  it("ignores a food already in the group", () => {
    expect(addGroupFood([banana, mamao], banana)).toEqual([banana, mamao]);
  });

  it("stops at the limit", () => {
    const full = Array.from(
      { length: GROUP_LIMITS.foods.max },
      (_, i) => ({ source: "taco", tacoId: i + 1 }) as const,
    );
    expect(canAddGroupFood(full)).toBe(false);
    expect(addGroupFood(full, whey)).toHaveLength(GROUP_LIMITS.foods.max);
  });

  it("removes by food, not by position", () => {
    expect(removeGroupFood([banana, mamao, whey], mamao)).toEqual([
      banana,
      whey,
    ]);
  });
});

describe("toGroup", () => {
  it("keeps the identity of the group being edited", () => {
    const written = toGroup(
      { name: "Frutas da manhã", foods: [banana, mamao] },
      { id: "g1", createdAt: "2026-08-01T10:00:00.000Z" },
      "2026-08-17T10:00:00.000Z",
    );

    // An edit that minted a new id would leave every slot pointing at the
    // group it replaced.
    expect(written.id).toBe("g1");
    expect(written.createdAt).toBe("2026-08-01T10:00:00.000Z");
    expect(written.updatedAt).toBe("2026-08-17T10:00:00.000Z");
  });

  it("omits the snapshot list entirely when there is nothing to snapshot", () => {
    const written = toGroup(
      { name: "Proteína", foods: [whey, { source: "custom", customFoodId: "w2" }] },
      { id: "g2", createdAt: "2026-08-01T10:00:00.000Z" },
      "2026-08-17T10:00:00.000Z",
    );

    expect("tacoFoods" in written).toBe(false);
  });
});

describe("canAddGroup", () => {
  it("stops at the limit", () => {
    const many = Array.from({ length: GROUP_LIMITS.count.max }, (_, i) =>
      group({ id: `g${i}` }),
    );
    expect(canAddGroup(many)).toBe(false);
    expect(canAddGroup(many.slice(1))).toBe(true);
  });
});

describe("groupCompositions", () => {
  it("gathers every group's snapshots for the plan's food book", () => {
    // Without these, the alternatives — foods the plan is by definition not
    // using — would have their numbers nowhere on the device, and the first
    // swap of the day would need a network.
    const compositions = groupCompositions([
      group(),
      group({
        id: "g2",
        name: "Grãos",
        foods: [maca],
        tacoFoods: [composition(61, "Maçã")],
      }),
    ]);

    expect(compositions.map((f) => f.tacoId).sort()).toEqual([12, 48, 61]);
  });

  it("keeps one copy of a food two groups share", () => {
    const compositions = groupCompositions([group(), group({ id: "g2" })]);
    expect(compositions).toHaveLength(2);
  });
});

describe("groupsForFood", () => {
  it("offers only groups that already contain the food", () => {
    // Attaching any other group would mean either silently replacing what is
    // on the plate or offering a swap list without it.
    const groups = [
      group(),
      group({ id: "g2", name: "Grãos", foods: [maca, whey], tacoFoods: [] }),
    ];

    expect(groupsForFood(groups, banana).map((g) => g.id)).toEqual(["g1"]);
    expect(groupsForFood(groups, whey).map((g) => g.id)).toEqual(["g2"]);
    expect(groupsForFood(groups, { source: "taco", tacoId: 999 })).toEqual([]);
  });
});

describe("findGroup", () => {
  it("answers nothing for a slot with no group", () => {
    expect(findGroup([group()], undefined)).toBeUndefined();
  });

  it("answers nothing for a group deleted since the plan was written", () => {
    expect(findGroup([group()], "gone")).toBeUndefined();
  });
});

describe("alternativesFor", () => {
  const book = buildFoodBook([
    composition(12, "Banana prata"),
    composition(48, "Mamão"),
    composition(61, "Maçã"),
  ]);

  const meal: Meal = {
    id: "m1",
    name: "Café da manhã",
    share: 1,
    items: [
      {
        id: "i1",
        food: banana,
        quantityG: 100,
        mandatory: false,
        minG: 0,
        maxG: 300,
        substitutionGroupId: "g1",
      },
      {
        id: "i2",
        food: maca,
        quantityG: 80,
        mandatory: false,
        minG: 0,
        maxG: 300,
      },
    ],
  };

  it("names every member and marks the one in the slot", () => {
    const options = alternativesFor(
      group({ foods: [banana, mamao, maca] }),
      meal,
      "i1",
      book,
    );

    expect(options.map((o) => o.name)).toEqual([
      "Banana prata",
      "Mamão",
      "Maçã",
    ]);
    expect(options.map((o) => o.current)).toEqual([true, false, false]);
  });

  it("marks a member another row of the same meal already holds", () => {
    const options = alternativesFor(
      group({ foods: [banana, mamao, maca] }),
      meal,
      "i1",
      book,
    );

    expect(options.map((o) => o.taken)).toEqual([false, false, true]);
  });

  it("still offers the member when the book cannot name it", () => {
    // A group whose snapshot was lost is worth showing as a swap the user can
    // still identify by position, rather than a row that quietly shrinks.
    const options = alternativesFor(
      group({ foods: [banana, { source: "taco", tacoId: 777 }] }),
      meal,
      "i1",
      book,
    );

    expect(options).toHaveLength(2);
    expect(options[1].name).toBeUndefined();
  });
});
