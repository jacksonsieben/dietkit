import { describe, expect, it } from "vitest";

import {
  CUSTOM_FOOD_ERROR_CODES,
  CUSTOM_FOOD_LIMITS,
  EMPTY_CUSTOM_FOOD_FORM,
  MACRO_SUM_TOLERANCE_G,
  deriveKcal,
  toCustomFood,
  toCustomFoodForm,
  validateCustomFoodForm,
  type CustomFoodFormValues,
} from "./custom";

const WHEY: CustomFoodFormValues = {
  name: "Whey protein isolado",
  brand: "Growth",
  proteinG: "80",
  carbG: "6",
  fatG: "2",
  servingG: "30",
};

function form(overrides: Partial<CustomFoodFormValues> = {}): CustomFoodFormValues {
  return { ...WHEY, ...overrides };
}

function ok(values: CustomFoodFormValues) {
  const result = validateCustomFoodForm(values);
  if (!result.ok) throw new Error(`expected valid: ${JSON.stringify(result.errors)}`);
  return result.value;
}

function errors(values: CustomFoodFormValues) {
  const result = validateCustomFoodForm(values);
  if (result.ok) throw new Error("expected invalid");
  return result.errors;
}

describe("deriveKcal", () => {
  it("applies 4/4/9", () => {
    expect(deriveKcal(80, 6, 2)).toBe(4 * 80 + 4 * 6 + 9 * 2);
  });

  it("is zero for a food with no macros in it", () => {
    // Black coffee, a diet soft drink, water. A food may legitimately be all
    // zeros, and it must not be mistaken for an unfilled form.
    expect(deriveKcal(0, 0, 0)).toBe(0);
  });

  it("rounds to whole kilocalories", () => {
    // 4 × 0,5 = 2 exactly, but 9 × 0,7 is 6,3 — and a food whose energy is
    // quoted to a tenth suggests a precision the three typed macros do not have.
    expect(Number.isInteger(deriveKcal(0.5, 0.5, 0.7))).toBe(true);
  });
});

describe("validateCustomFoodForm", () => {
  it("accepts a food off a supplement label", () => {
    expect(ok(form())).toEqual({
      name: "Whey protein isolado",
      brand: "Growth",
      per100g: { kcal: 362, proteinG: 80, carbG: 6, fatG: 2 },
      servingG: 30,
    });
  });

  it("reads a comma as a decimal point", () => {
    // The same reason `parseDecimal` exists: pt-BR writes 2,5 and a phone
    // keyboard offers a comma.
    expect(ok(form({ fatG: "2,5" })).per100g.fatG).toBe(2.5);
  });

  it("takes brand and serving as optional, and omits them rather than blanking them", () => {
    const value = ok(form({ brand: "  ", servingG: "" }));

    expect(value).not.toHaveProperty("brand");
    expect(value).not.toHaveProperty("servingG");
  });

  it("says everything that is wrong in one pass", () => {
    expect(errors(EMPTY_CUSTOM_FOOD_FORM)).toEqual({
      name: "required",
      proteinG: "required",
      carbG: "required",
      fatG: "required",
    });
  });

  it("refuses more of a macro than the food can be made of", () => {
    // The typo this bound exists for: the energy figure from the label typed
    // into a macro box.
    expect(errors(form({ proteinG: "350" })).proteinG).toBe("macroRange");
    expect(errors(form({ carbG: "-1" })).carbG).toBe("macroRange");
    expect(ok(form({ fatG: "100", proteinG: "0", carbG: "0" })).per100g.fatG).toBe(100);
  });

  it("refuses a food that is more than all of itself", () => {
    // Each figure in range, the food still impossible: 60 + 30 + 30 is 120 g of
    // macro in 100 g of food.
    const complaint = errors(form({ proteinG: "60", carbG: "30", fatG: "30" }));

    expect(complaint).toEqual({
      proteinG: "macroSum",
      carbG: "macroSum",
      fatG: "macroSum",
    });
  });

  it("still accepts a label whose own roundings add past 100", () => {
    // Olive oil: three figures rounded on their own, summing to 100,8.
    expect(ok(form({ proteinG: "0,5", carbG: "0,4", fatG: "99,9" }))).toBeTruthy();

    // The tolerance is a threshold, not a slope: exactly one gram over is
    // still three roundings, and a fifth of a gram more is not.
    const edge = { proteinG: "50", carbG: "50" };
    expect(ok(form({ ...edge, fatG: String(MACRO_SUM_TOLERANCE_G) }))).toBeTruthy();
    expect(errors(form({ ...edge, fatG: String(MACRO_SUM_TOLERANCE_G + 0.2) })))
      .toHaveProperty("fatG", "macroSum");
  });

  it("keeps a range complaint rather than replacing it with the sum", () => {
    // Both are true when someone types 350 into protein. The specific one is
    // the one that tells them what to do about it.
    expect(errors(form({ proteinG: "350", carbG: "50" })).proteinG).toBe("macroRange");
  });

  it("wants a name a person could find again", () => {
    expect(errors(form({ name: " " })).name).toBe("required");
    expect(errors(form({ name: "a" })).name).toBe("nameLength");
    expect(errors(form({ name: "x".repeat(CUSTOM_FOOD_LIMITS.nameLength.max + 1) })).name)
      .toBe("nameLength");
    expect(ok(form({ name: "  Pão da padaria  " })).name).toBe("Pão da padaria");
  });

  it("bounds the serving, and rejects one that is not a number", () => {
    expect(errors(form({ servingG: "0" })).servingG).toBe("servingRange");
    expect(errors(form({ servingG: "scoop" })).servingG).toBe("notANumber");
    expect(ok(form({ servingG: "30" })).servingG).toBe(30);
  });

  it("derives the energy instead of asking for it", () => {
    // The form has no energy box, and this is the assertion that keeps it that
    // way: what is stored is what the macros imply.
    const value = ok(form({ proteinG: "10", carbG: "20", fatG: "5" }));

    expect(value.per100g.kcal).toBe(deriveKcal(10, 20, 5));
    expect(Object.keys(value.per100g).sort()).toEqual([
      "carbG",
      "fatG",
      "kcal",
      "proteinG",
    ]);
  });
});

describe("round trip", () => {
  it("reopens a stored food on the values it was saved with", () => {
    const stored = toCustomFood(
      ok(form()),
      { id: "food-1", createdAt: "2026-01-01T00:00:00.000Z" },
      "2026-08-18T00:00:00.000Z",
    );

    expect(toCustomFoodForm(stored)).toEqual(form());
    expect(ok(toCustomFoodForm(stored))).toEqual(ok(form()));
  });

  it("keeps the identity an edit must not change", () => {
    const created = "2026-01-01T00:00:00.000Z";
    const edited = toCustomFood(
      ok(form({ proteinG: "82" })),
      { id: "food-1", createdAt: created },
      "2026-08-18T00:00:00.000Z",
    );

    // A new id here would leave every plan that referenced this food pointing
    // at the version being replaced.
    expect(edited.id).toBe("food-1");
    expect(edited.createdAt).toBe(created);
    expect(edited.updatedAt).toBe("2026-08-18T00:00:00.000Z");
  });

  it("writes no key for an absent brand rather than an empty string", () => {
    // `brand?: string` — an empty string would survive export, restore, and
    // every later read as a brand that is blank rather than one that is absent.
    const stored = toCustomFood(
      ok(form({ brand: "", servingG: "" })),
      { id: "food-2", createdAt: "2026-01-01T00:00:00.000Z" },
      "2026-01-01T00:00:00.000Z",
    );

    expect(Object.keys(stored).sort()).toEqual([
      "createdAt",
      "id",
      "name",
      "per100g",
      "updatedAt",
    ]);
  });
});

describe("error codes", () => {
  it("declares every code the validator can return", () => {
    // The catalogue is checked against this list in messages.test.ts, so a code
    // that exists only in the validator would print its own key at a user.
    const produced = new Set<string>();
    const bad: CustomFoodFormValues[] = [
      EMPTY_CUSTOM_FOOD_FORM,
      form({ name: "a" }),
      form({ brand: "b".repeat(CUSTOM_FOOD_LIMITS.brandLength.max + 1) }),
      form({ proteinG: "350" }),
      form({ proteinG: "60", carbG: "30", fatG: "30" }),
      form({ servingG: "0" }),
      form({ servingG: "scoop" }),
    ];

    for (const values of bad) {
      for (const code of Object.values(errors(values))) produced.add(code);
    }

    expect([...produced].sort()).toEqual([...CUSTOM_FOOD_ERROR_CODES].sort());
  });
});
