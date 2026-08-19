import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ageYearsOn } from "@/lib/energy/age";
import { macroEnergy } from "@/lib/energy/macros";
import type {
  FoodComposition,
  FoodRef,
  Id,
  MacroSet,
} from "@/lib/storage/types";

import { CATALOGUE_MACROS, type Catalogue } from "./catalogue";
import { PREDECESSOR_CATALOGUE } from "./catalogue.data";
import { PREDECESSOR_EXPORT } from "./export.fixture";
import { FOOD_MAP, mappingFor } from "./foodMap";
import {
  importPlan,
  neededTacoIds,
  type ImportNote,
  type ImportOptions,
  type ImportResult,
} from "./import";
import { parseProfile } from "./profile";

/**
 * What the import does to a real export (#22).
 *
 * The fixture is the one `profile.test.ts` reads, so these tests are about the
 * second half of the journey: what the old app's numbers become here, and — the
 * part the issue actually asks for — what gets *said* about the parts that
 * could not come across unchanged. A note that stops being emitted is a change
 * the user is no longer told about, which is why so many of these assert on
 * `notes` rather than on the records.
 *
 * The TACO compositions come from the checked-in publication rather than from
 * a stub, for `foodMap.test.ts`' reason: the claim being tested is about the
 * real table, and a fixture would only prove the test agrees with itself.
 */

interface TacoRow {
  id: number;
  description: string;
  values: Record<string, number>;
  sentinels: Record<string, string>;
}

const TACO = JSON.parse(
  fs.readFileSync(
    path.join(import.meta.dirname, "../../../data/taco-4ed.json"),
    "utf8",
  ),
) as { foods: TacoRow[] };

/** `NA` and `Tr` are honest zeroes — see `compositionFromResult`. */
const cell = (row: TacoRow, key: string): number => {
  const value = row.values[key];
  if (value !== undefined) return value;
  return row.sentinels[key] === "NA" || row.sentinels[key] === "Tr" ? 0 : NaN;
};

const COMPOSITIONS: ReadonlyMap<number, FoodComposition> = new Map(
  neededTacoIds(PREDECESSOR_CATALOGUE).flatMap((id) => {
    const row = TACO.foods.find((food) => food.id === id);
    if (row === undefined) return [];

    const per100g: MacroSet = {
      kcal: cell(row, "energyKcal"),
      proteinG: cell(row, "proteinG"),
      carbG: cell(row, "carbG"),
      fatG: cell(row, "fatG"),
    };
    return [[id, { tacoId: id, name: row.description, per100g }] as const];
  }),
);

const NAMES = { diet: "Plano importado", fruits: "Frutas", nuts: "Oleaginosas" };
const TODAY = "2026-08-19";
const NOW = "2026-08-19T12:00:00.000Z";

const profileFrom = (edit: Record<string, unknown> = {}) => {
  const parsed = parseProfile({ ...PREDECESSOR_EXPORT, ...edit });
  if (!parsed.ok) {
    throw new Error(`fixture does not parse: ${JSON.stringify(parsed.issues)}`);
  }
  return parsed.value;
};

const counter = () => {
  let next = 0;
  return (): Id => `id-${++next}`;
};

const run = (
  options: Partial<ImportOptions> & { edit?: Record<string, unknown> } = {},
): ImportResult => {
  const { edit, ...overrides } = options;
  return importPlan({
    profile: profileFrom(edit),
    catalogue: PREDECESSOR_CATALOGUE,
    compositions: COMPOSITIONS,
    names: NAMES,
    today: TODAY,
    now: NOW,
    newId: counter(),
    ...overrides,
  });
};

const codes = (result: ImportResult) => result.notes.map((note) => note.code);

const noteFor = (result: ImportResult, code: string): ImportNote | undefined =>
  result.notes.find((note) => note.code === code);

const refsIn = (result: ImportResult): FoodRef[] =>
  result.diet.meals.flatMap((meal) => meal.items.map((item) => item.food));

const key = (ref: FoodRef) =>
  ref.source === "taco" ? `taco:${ref.tacoId}` : `custom:${ref.customFoodId}`;

describe("importing the predecessor's plan", () => {
  it("imports the training day and says the rest day is not coming", () => {
    // The fixture picks option 3 for the fourth meal's carbohydrate on the rest
    // day and option 0 on the training day, so a version reading the wrong day
    // builds a different meal — and this is the assertion that notices.
    const result = run();
    const meal = PREDECESSOR_CATALOGUE.meals[3]!;
    const first = meal.carbOptions[0]!.items[0]!.foodKey!;

    expect(codes(result)).toContain("restDayNotImported");
    expect(refsIn(result)).toContainEqual(
      expectedRef(PREDECESSOR_CATALOGUE, first, result),
    );
    expect(result.diet.meals[3]!.items[0]!.food).toEqual(
      expectedRef(PREDECESSOR_CATALOGUE, first, result),
    );
  });

  it("gives every meal a share of the day, adding to one", () => {
    const result = run();
    const shares = result.diet.meals.map((meal) => meal.share);

    expect(shares).toHaveLength(PREDECESSOR_CATALOGUE.meals.length);
    for (const share of shares) expect(share).toBeGreaterThan(0);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 10);
  });

  it("weights a meal by its energy rather than by one macro", () => {
    // The single share has to land between the three splits it replaces: below
    // all of them or above all of them would be a meal carrying an amount of
    // the day that no macro asked it to.
    const result = run();
    const profile = profileFrom();

    const fractionsOf = (macro: string) => {
      const stored = profile.distribution.treino[macro as "carb"];
      const total = stored.reduce((sum, value) => sum + value, 0);
      return stored.map((value) => value / total);
    };

    result.diet.meals.forEach((meal, index) => {
      const fractions = CATALOGUE_MACROS.map((macro) => fractionsOf(macro)[index]!);

      expect(meal.share).toBeGreaterThanOrEqual(Math.min(...fractions) - 1e-9);
      expect(meal.share).toBeLessThanOrEqual(Math.max(...fractions) + 1e-9);
    });

    // And in between rather than on top of one of them: taking a single macro's
    // split as the meal's share is the plausible shortcut, and it would satisfy
    // the bounds above while moving the other two macros' totals.
    const shares = result.diet.meals.map((meal) => meal.share);
    for (const macro of CATALOGUE_MACROS) {
      expect(shares).not.toEqual(
        fractionsOf(macro).map((fraction, index) =>
          Math.abs(fraction - shares[index]!) < 1e-9 ? shares[index]! : fraction,
        ),
      );
    }

    // And the fixture's splits do disagree, so the collapse is reported.
    expect(noteFor(result, "mealShareFlattened")?.value).toBeGreaterThan(0);
  });

  it("builds the targets from the coefficients that sized the portions", () => {
    // 2.2, 3.4 and 0.9 g/kg against 82.5 kg — the file's own numbers, not this
    // app's equation, because they are what the portions were scaled by.
    const result = run();

    expect(result.diet.targets).toEqual({
      proteinG: 182,
      carbG: 281,
      fatG: 74,
      kcal: 2518,
    });
    expect(result.diet.targets.kcal).toBe(
      Math.round(macroEnergy(result.diet.targets)),
    );
    expect(result.diet.basedOnWeightKg).toBe(82.5);
  });

  it("reports that the plan's energy is not the one the equation gives", () => {
    // Mifflin-St Jeor over the fixture is 1772.5 kcal, ×1.55 for the third rung
    // and −500 for the cut: 2247 against the plan's own 2518. The old app knew
    // about this gap too — `MacroTotals.delta_kcal` — and showed it.
    expect(noteFor(run(), "planEnergyDiffers")?.value).toBe(271);
  });

  it("keeps the fat coefficient as kilocalories and says it stopped being g/kg", () => {
    const result = run();

    expect(result.goal.kind).toBe("lose");
    expect(result.goal.adjustment).toEqual({ unit: "kcal", value: 500 });
    expect(result.goal.proteinGPerKg).toBe(2.2);
    expect(result.goal.fat).toEqual({ unit: "kcal", value: 668 });
    expect(noteFor(result, "fatUnitChanged")?.value).toBe(668);
    expect(noteFor(result, "carbCoefficientKept")?.value).toBe(3.4);
  });

  it("makes an age into a birth date that ages on its own", () => {
    const result = run();

    expect(ageYearsOn(result.profile.birthDate, TODAY)).toBe(34);
    expect(ageYearsOn(result.profile.birthDate, "2027-08-19")).toBe(35);
    expect(noteFor(result, "birthDateEstimated")?.value).toBe(34);
  });

  it("logs the weight on the day it was imported rather than in the profile", () => {
    const result = run();

    expect(result.weight).toMatchObject({ date: TODAY, weightKg: 82.5 });
    expect(result.profile).not.toHaveProperty("weightKg");
  });

  it("maps a published food to its row and an unpublished one to the user's own", () => {
    // Banana is the correction — the old app cited 194, "Figo, cru" — and the
    // almonds are a preparation TACO does not publish.
    const result = run();
    const fruits = result.groups.find((group) => group.name === NAMES.fruits)!;
    const nuts = result.groups.find((group) => group.name === NAMES.nuts)!;

    expect(fruits.foods).toContainEqual({ source: "taco", tacoId: 182 });
    expect(codes(result)).toContain("foodCorrected");

    const almonds = result.customFoods.find((food) => food.name === "Amêndoas");
    expect(almonds).toBeDefined();
    expect(nuts.foods).toContainEqual({
      source: "custom",
      customFoodId: almonds!.id,
    });
    expect(codes(result)).toContain("foodOtherPreparation");
  });

  it("gives a custom food the energy its own macros come to", () => {
    // The old app printed both a kcal and three macros per food and never
    // checked them against each other, so some rows disagree — almonds are
    // labelled 579 kcal against 620 of macros. Carrying the label over would
    // put a food in the store whose numbers cannot all be true at once.
    const result = run();

    for (const food of result.customFoods) {
      expect(food.per100g.kcal).toBe(Math.round(macroEnergy(food.per100g)));
    }

    const almonds = result.customFoods.find((food) => food.name === "Amêndoas")!;
    expect(almonds.per100g.kcal).toBe(620);
  });

  it("pins what the old app would not scale and leaves room where it would", () => {
    const result = run();
    const items = result.diet.meals.flatMap((meal) => meal.items);

    const pinned = items.filter((item) => item.mandatory);
    expect(pinned.length).toBeGreaterThan(0);
    for (const item of pinned) {
      expect(item.minG).toBe(item.quantityG);
      expect(item.maxG).toBe(item.quantityG);
    }

    const free = items.filter((item) => !item.mandatory);
    expect(free.length).toBeGreaterThan(0);
    for (const item of free) expect(item.maxG).toBeGreaterThan(item.quantityG);
  });

  it("reports the rows that were never a food instead of inventing a quantity", () => {
    // "Ômega 3", "Canela", "Creatina", "Salada de folhas verdes à vontade":
    // printed on the old plan, and not a weight of anything TACO publishes.
    const result = run();
    const subjects = result.notes
      .filter((note) => note.code === "itemWithoutFood")
      .map((note) => note.subject);

    expect(subjects).toContain("Ômega 3");
    expect(subjects).toContain("Creatina");
    expect(subjects).toContain("Salada de folhas verdes à vontade");
    expect(subjects).toHaveLength(6);
  });

  it("carries the numbers of every TACO row the plan points at, and no others", () => {
    const result = run();
    const pointed = new Set(
      refsIn(result).flatMap((ref) => (ref.source === "taco" ? [ref.tacoId] : [])),
    );

    expect(new Set(result.diet.tacoFoods?.map((food) => food.tacoId))).toEqual(
      pointed,
    );
  });

  it("turns the old fruit list into a group and points the fruit slots at it", () => {
    // The predecessor's one hardcoded swap, as a record the user now owns (#20).
    const result = run();
    const fruits = result.groups.find((group) => group.name === NAMES.fruits)!;

    expect(fruits.foods).toHaveLength(PREDECESSOR_CATALOGUE.fruits.length);
    expect(fruits.tacoFoods?.length).toBeGreaterThan(0);

    const slots = result.diet.meals
      .flatMap((meal) => meal.items)
      .filter((item) => item.substitutionGroupId !== undefined);
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) expect(slot.substitutionGroupId).toBe(fruits.id);
  });

  it("never puts the same food in a meal twice", () => {
    // The planner keeps one row per food (`hasFood`), so a combination that
    // repeated one would arrive as a plan with a portion silently missing.
    // Checked across every option the old app could have stored, because the
    // fixture only exercises one of them.
    for (const meal of PREDECESSOR_CATALOGUE.meals) {
      for (const carb of meal.carbOptions) {
        for (const protein of meal.proteinOptions) {
          const keys = [...carb.items, ...protein.items, ...meal.fixed]
            .map((item) => item.foodKey)
            .filter((foodKey) => foodKey !== null);

          expect(new Set(keys).size).toBe(keys.length);
        }
      }
    }

    for (const meal of run().diet.meals) {
      const used = meal.items.map((item) => key(item.food));
      expect(new Set(used).size).toBe(used.length);
    }
  });

  it("asks for exactly the TACO rows the catalogue can reach", () => {
    const ids = neededTacoIds(PREDECESSOR_CATALOGUE);
    const mapped = Object.values(FOOD_MAP).flatMap((mapping) =>
      mapping.kind === "taco" ? [mapping.tacoId] : [],
    );

    expect(ids).toEqual([...mapped].sort((a, b) => a - b));
    expect([...ids].sort((a, b) => a - b)).toEqual(ids);
    for (const id of ids) {
      expect(TACO.foods.some((food) => food.id === id)).toBe(true);
    }
  });

  it("says when it could not quote a row it mapped", () => {
    // An import run offline, or against a database that has not been seeded.
    // The item still points at the row: an unresolved food is a state the plan
    // screen already shows, and inventing numbers for it would not be.
    const result = run({ compositions: new Map() });

    expect(codes(result)).toContain("compositionMissing");
    expect(result.diet.tacoFoods).toBeUndefined();
    expect(
      refsIn(result).some((ref) => ref.source === "taco"),
    ).toBe(true);
  });

  it("keeps a hand-typed activity factor instead of rounding it to a rung", () => {
    const result = run({ edit: { use_custom_fa: true, custom_fa: 1.65 } });

    expect(result.profile.activityFactor).toBe(1.65);
    expect(noteFor(result, "activityFactorCustom")?.value).toBe(1.65);
  });

  it("reads the ladder position when there is no custom factor", () => {
    expect(run().profile.activityFactor).toBe(1.55);
  });

  it("reports a rung the ladder does not have", () => {
    const result = run({ edit: { activity_idx: 9 } });

    expect(noteFor(result, "activityIndexOutOfRange")?.value).toBe(9);
    expect(result.profile.activityFactor).toBe(1.9);
  });

  it("reports a sex it does not recognise rather than choosing quietly", () => {
    const result = run({ edit: { sex_label: "Outro" } });

    expect(noteFor(result, "sexUnrecognised")?.subject).toBe("Outro");
  });

  it("brings a number this app would refuse to its own bound and says so", () => {
    const result = run({ edit: { weight_kg: 900 } });
    const clamped = noteFor(result, "valueClamped");

    expect(clamped).toEqual({ code: "valueClamped", subject: "weight_kg", value: 400 });
    expect(result.weight.weightKg).toBe(400);
  });

  it("reports a stored option the catalogue has no option for", () => {
    const result = run({ edit: { sel_treino_prot_0: 99 } });
    const first = PREDECESSOR_CATALOGUE.meals[0]!.proteinOptions[0]!.items[0]!;

    expect(result.notes).toContainEqual({
      code: "selectionOutOfRange",
      subject: "sel_treino_prot_0",
      value: 99,
    });
    // And the meal is still built, from the first option.
    expect(refsIn(result)).toContainEqual(
      expectedRef(PREDECESSOR_CATALOGUE, first.foodKey!, result),
    );
  });

  it("splits the meals evenly when a macro has no distribution at all", () => {
    const result = run({
      edit: Object.fromEntries(
        [0, 1, 2, 3].map((meal) => [`dist_treino_carb_${meal}`, 0]),
      ),
    });

    expect(noteFor(result, "distributionEmpty")?.subject).toBe("carb");
  });
});

/** What a catalogue key should have become, whichever side of TACO it fell. */
function expectedRef(
  catalogue: Catalogue,
  foodKey: string,
  result: ImportResult,
): FoodRef {
  const mapping = mappingFor(foodKey)!;
  if (mapping.kind === "taco") return { source: "taco", tacoId: mapping.tacoId };

  const name = catalogue.foods[foodKey]!.name;
  const custom = result.customFoods.find((food) => food.name === name)!;
  return { source: "custom", customFoodId: custom.id };
}
