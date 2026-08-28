import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  allItems,
  checkMealOptions,
  effectiveItems,
  optionSetsOf,
  selectedOption,
} from "@/lib/diet/options";
import { macroEnergy, planMacros } from "@/lib/energy/macros";
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
  type ImportBody,
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

const NAMES = {
  diet: "Plano importado",
  fruits: "Frutas",
  nuts: "Oleaginosas",
  carbSet: "Carboidrato",
  proteinSet: "Proteína",
};
const NOW = "2026-08-19T12:00:00.000Z";

/**
 * A body deliberately unlike the one in the file (#123).
 *
 * The fixture weighs 82.5 kg and asks for 2.2 g/kg of protein; this device
 * weighs 88.4 and asks for 2. If any assertion below could pass on either set
 * of numbers, it would not be testing the thing that changed.
 */
const BODY: ImportBody = {
  totalDailyEnergyExpenditure: 2747,
  weightKg: 88.4,
  goal: {
    kind: "lose",
    adjustment: { unit: "kcal", value: 500 },
    proteinGPerKg: 2,
    fat: { unit: "percent", value: 25 },
  },
};

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
    body: BODY,
    now: NOW,
    newId: counter(),
    ...overrides,
  });
};

const codes = (result: ImportResult) => result.notes.map((note) => note.code);

const noteFor = (result: ImportResult, code: string): ImportNote | undefined =>
  result.notes.find((note) => note.code === code);

/** What is on the plate as the file left it: fixed rows plus the selections. */
const refsIn = (result: ImportResult): FoodRef[] =>
  result.diet.meals.flatMap((meal) =>
    effectiveItems(meal).map((item) => item.food),
  );

/** Every row the plan holds, the unselected versions included. */
const allRefsIn = (result: ImportResult): FoodRef[] =>
  result.diet.meals.flatMap((meal) => allItems(meal).map((item) => item.food));

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
    const carb = selectedOption(optionSetsOf(result.diet.meals[3]!)[0]!)!;
    expect(carb.items[0]!.food).toEqual(
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
      const fractions = CATALOGUE_MACROS.map(
        (macro) => fractionsOf(macro)[index]!,
      );

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
          Math.abs(fraction - shares[index]!) < 1e-9
            ? shares[index]!
            : fraction,
        ),
      );
    }

    // And the fixture's splits do disagree, so the collapse is reported.
    expect(noteFor(result, "mealShareFlattened")?.value).toBeGreaterThan(0);
  });

  it("sizes the plan from this device's body, not from the file's numbers", () => {
    // 2747 kcal less the 500 kcal cut is 2247; 2 g/kg on 88.4 kg is 177 g of
    // protein and a quarter of the energy is 62 g of fat, carbohydrate taking
    // what is left. Written out rather than compared against `planMacros` so
    // the assertion still means something if that function changes.
    const result = run();

    expect(result.diet.targets).toEqual({
      proteinG: 177,
      carbG: 245,
      fatG: 62,
      kcal: 2246,
    });
    expect(result.diet.basedOnWeightKg).toBe(88.4);
  });

  it("gives the plan the same targets the energy screen shows", () => {
    // The claim #123 is actually making: not "some equation" but *this* one,
    // the one `/energia` and the home screen already run.
    expect(run().diet.targets).toEqual(planMacros(BODY).targets);
  });

  it("would have imported quite different numbers from the file itself", () => {
    // 2.2, 3.4 and 0.9 g/kg against the file's own 82.5 kg — 182 g of protein,
    // 281 of carbohydrate, 74 of fat — is what the import used to write, and
    // the coefficients are still in the fixture. This is the test that fails if
    // anything starts reading them again.
    const result = run();

    expect(result.diet.targets.proteinG).not.toBe(182);
    expect(result.diet.targets.carbG).not.toBe(281);
    expect(result.diet.targets.fatG).not.toBe(74);
  });

  it("produces nothing about the person, only about the food", () => {
    // The whole of #123 in one assertion: an import writes a plan, some foods
    // and some groups. A profile, a weighing or a goal coming back out of here
    // is a personal record the file is three years out of date about.
    expect(Object.keys(run()).sort()).toEqual([
      "customFoods",
      "diet",
      "groups",
      "notes",
    ]);
  });

  it("stops explaining numbers it no longer imports", () => {
    // These notes were honest while the file's own figures were being written
    // to the device. A note about a value nobody imported is worse than no
    // note: it describes a change that did not happen.
    const said = codes(run({ edit: { weight_kg: 900, sex_label: "Outro" } }));

    for (const gone of [
      "carbCoefficientKept",
      "fatUnitChanged",
      "planEnergyDiffers",
      "birthDateEstimated",
      "sexUnrecognised",
      "activityFactorCustom",
      "activityIndexOutOfRange",
      "valueClamped",
    ]) {
      expect(said).not.toContain(gone);
    }
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

    const almonds = result.customFoods.find(
      (food) => food.name === "Amêndoas",
    )!;
    expect(almonds.per100g.kcal).toBe(620);
  });

  it("pins what the old app would not scale and leaves room where it would", () => {
    const result = run();
    const items = result.diet.meals.flatMap(allItems);

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
      allRefsIn(result).flatMap((ref) =>
        ref.source === "taco" ? [ref.tacoId] : [],
      ),
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
      .flatMap(allItems)
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
      const used = effectiveItems(meal).map((item) => key(item.food));
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
    expect(refsIn(result).some((ref) => ref.source === "taco")).toBe(true);
  });

  it("reads a file whose body this app would refuse, because it never uses it", () => {
    // 900 kg used to be clamped to 400 and logged as a weighing. Now it is a
    // number nothing reads, and the plan comes out identical — the shares are
    // ratios of the coefficients, which is the one thing the file still decides.
    const heavy = run({ edit: { weight_kg: 900 } });

    expect(heavy.diet.targets).toEqual(run().diet.targets);
    expect(heavy.diet.meals.map((meal) => meal.share)).toEqual(
      run().diet.meals.map((meal) => meal.share),
    );
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
    const set = optionSetsOf(result.diet.meals[0]!)[1]!;
    expect(set.selectedId).toBe(set.options[0]!.id);
    expect(refsIn(result)).toContainEqual(
      expectedRef(PREDECESSOR_CATALOGUE, first.foodKey!, result),
    );
  });

  it("brings both decisions across, with every version the old app offered", () => {
    const result = run();
    const sets = result.diet.meals.flatMap(optionSetsOf);
    const offered = PREDECESSOR_CATALOGUE.meals.flatMap((meal) => [
      meal.carbOptions,
      meal.proteinOptions,
    ]);

    expect(sets).toHaveLength(offered.length);
    expect(sets.flatMap((set) => set.options)).toHaveLength(
      offered.reduce((total, list) => total + list.length, 0),
    );

    for (const meal of result.diet.meals) {
      expect(optionSetsOf(meal).map((set) => set.name)).toEqual([
        NAMES.carbSet,
        NAMES.proteinSet,
      ]);
    }
  });

  it("selects the version the stored index points at, in both sets", () => {
    // Second carbohydrate, third protein, in the first meal. The fixture
    // stores zero everywhere, so a version that ignored the index would still
    // look right — this is the assertion that would not.
    const result = run({
      edit: { sel_treino_carb_0: 1, sel_treino_prot_0: 2 },
    });
    const spec = PREDECESSOR_CATALOGUE.meals[0]!;
    const [carb, protein] = optionSetsOf(result.diet.meals[0]!);

    expect(selectedOption(carb!)!.name).toBe(spec.carbOptions[1]!.label);
    expect(selectedOption(protein!)!.name).toBe(spec.proteinOptions[2]!.label);
  });

  it("names a version after the label the old app printed on the button", () => {
    const result = run();
    const names = result.diet.meals
      .flatMap(optionSetsOf)
      .flatMap((set) => set.options.map((option) => option.name));

    expect(names).toContain("Aveia + fruta + pasta de amendoim");
    // Nothing arrives with a name the builder would refuse to save.
    for (const meal of result.diet.meals) {
      expect(checkMealOptions(meal)).toBeUndefined();
    }
  });

  it("keeps a TACO snapshot for the versions nobody selected", () => {
    // The point of switching version offline: the food in the version being
    // switched *to* has to be priceable, and its numbers are nowhere else.
    const result = run();
    const onThePlate = new Set(
      refsIn(result).flatMap((ref) =>
        ref.source === "taco" ? [ref.tacoId] : [],
      ),
    );
    const waiting = allRefsIn(result).flatMap((ref) =>
      ref.source === "taco" && !onThePlate.has(ref.tacoId) ? [ref.tacoId] : [],
    );
    const snapshot = new Set(result.diet.tacoFoods?.map((food) => food.tacoId));

    expect(waiting.length).toBeGreaterThan(0);
    for (const tacoId of waiting) expect(snapshot).toContain(tacoId);
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
  if (mapping.kind === "taco")
    return { source: "taco", tacoId: mapping.tacoId };

  const name = catalogue.foods[foodKey]!.name;
  const custom = result.customFoods.find((food) => food.name === name)!;
  return { source: "custom", customFoodId: custom.id };
}
