import { describe, expect, it } from "vitest";

import type { DietItem, FoodRef, Meal, OptionSet } from "@/lib/storage/types";

import {
  OPTION_LIMITS,
  addOption,
  addToContainer,
  allItems,
  canAddOption,
  canAddSet,
  checkMealOptions,
  checkOptionName,
  containerItems,
  effectiveItems,
  endsTheChoice,
  mapMealItems,
  optionSetsOf,
  optionSignature,
  removeOption,
  renameOption,
  selectOption,
  selectedOption,
  siblingItems,
  startOptions,
  trimOptionNames,
  withContainer,
} from "./options";

const bread = { source: "taco", tacoId: 1 } as const;
const oats = { source: "taco", tacoId: 2 } as const;
const oil = { source: "taco", tacoId: 3 } as const;

function item(id: string, food: FoodRef = bread): DietItem {
  return { id, food, quantityG: 100, mandatory: false, minG: 0, maxG: 400 };
}

/** Breakfast the predecessor's way: fixed olive oil, plus a carbohydrate choice. */
function breakfast(over: Partial<Meal> = {}): Meal {
  return {
    id: "m1",
    name: "Café da manhã",
    share: 1,
    items: [item("fixed", oil)],
    optionSets: [
      {
        id: "s1",
        name: "Carboidrato",
        selectedId: "o1",
        options: [
          { id: "o1", name: "Pão", items: [item("a", bread)] },
          { id: "o2", name: "Aveia", items: [item("b", oats)] },
        ],
      },
    ],
    ...over,
  };
}

const plain: Meal = { id: "m1", name: "Almoço", share: 1, items: [item("x")] };

const ids = (items: readonly DietItem[]) => items.map((entry) => entry.id);

describe("optionSetsOf", () => {
  it("gives an empty list for a meal written before options existed", () => {
    // Every caller iterates this, so `undefined` must never reach one.
    expect(optionSetsOf(plain)).toEqual([]);
  });
});

describe("effectiveItems", () => {
  it("is the fixed rows plus the selected option, and nothing else", () => {
    expect(ids(effectiveItems(breakfast()))).toEqual(["fixed", "a"]);
  });

  it("follows the selection", () => {
    const [meal] = selectOption([breakfast()], "m1", "s1", "o2");

    expect(ids(effectiveItems(meal))).toEqual(["fixed", "b"]);
  });

  it("falls back to the first option when the selection names nothing", () => {
    // Hand-edited JSON. A set that contributes nothing is a meal quietly short
    // of a third of its calories, which is worse than showing the wrong option.
    const meal = breakfast({
      optionSets: [{ ...breakfast().optionSets![0], selectedId: "gone" }],
    });

    expect(ids(effectiveItems(meal))).toEqual(["fixed", "a"]);
  });

  it("skips a set with no options at all rather than throwing", () => {
    const meal = breakfast({
      optionSets: [{ id: "s1", name: "Vazio", selectedId: "o1", options: [] }],
    });

    expect(ids(effectiveItems(meal))).toEqual(["fixed"]);
  });
});

describe("allItems", () => {
  it("includes the options nobody selected", () => {
    // The one place they must be counted: keeping their TACO snapshot.
    expect(ids(allItems(breakfast()))).toEqual(["fixed", "a", "b"]);
  });
});

describe("selectedOption", () => {
  it("is undefined only when the set is empty", () => {
    const set: OptionSet = { id: "s", name: "n", selectedId: "x", options: [] };

    expect(selectedOption(set)).toBeUndefined();
  });
});

describe("containerItems", () => {
  it("without an option id, means the meal's own fixed rows", () => {
    expect(ids(containerItems(breakfast()))).toEqual(["fixed"]);
  });

  it("with one, means that option and not its neighbours", () => {
    expect(ids(containerItems(breakfast(), "o2"))).toEqual(["b"]);
  });

  it("is empty for an option that is not there", () => {
    expect(containerItems(breakfast(), "nope")).toEqual([]);
  });
});

describe("siblingItems", () => {
  it("stops at the option boundary", () => {
    // `a` and `b` are alternatives, never on the same plate, so they are not
    // one another's neighbours.
    expect(ids(siblingItems(breakfast(), "a"))).toEqual(["a"]);
    expect(ids(siblingItems(breakfast(), "fixed"))).toEqual(["fixed"]);
  });

  it("is empty for a row the meal does not hold", () => {
    expect(siblingItems(breakfast(), "ghost")).toEqual([]);
  });
});

describe("withContainer", () => {
  it("edits the option that holds the row, and leaves the rest alone", () => {
    const changed = withContainer(breakfast(), "b", (items) =>
      items.map((entry) => ({ ...entry, quantityG: 7 })),
    );

    expect(changed.optionSets![0].options[1].items[0].quantityG).toBe(7);
    expect(changed.optionSets![0].options[0].items[0].quantityG).toBe(100);
    expect(changed.items[0].quantityG).toBe(100);
  });

  it("edits the fixed rows when that is where the row is", () => {
    const changed = withContainer(breakfast(), "fixed", (items) =>
      items.filter(() => false),
    );

    expect(changed.items).toEqual([]);
    expect(ids(allItems(changed))).toEqual(["a", "b"]);
  });

  it("leaves a meal with no options untouched when the row is not there", () => {
    expect(withContainer(plain, "ghost", () => [])).toBe(plain);
  });
});

describe("mapMealItems", () => {
  it("reaches every row, selected or not", () => {
    const changed = mapMealItems(breakfast(), (items) =>
      items.map((entry) => ({ ...entry, quantityG: 1 })),
    );

    expect(allItems(changed).every((entry) => entry.quantityG === 1)).toBe(
      true,
    );
  });

  it("leaves a meal without options without an `optionSets` key", () => {
    expect("optionSets" in mapMealItems(plain, (items) => [...items])).toBe(
      false,
    );
  });
});

describe("addToContainer", () => {
  it("appends to the meal when no option is named", () => {
    expect(ids(addToContainer(plain, undefined, item("new")).items)).toEqual([
      "x",
      "new",
    ]);
  });

  it("appends inside the named option", () => {
    const changed = addToContainer(breakfast(), "o2", item("new"));

    expect(ids(containerItems(changed, "o2"))).toEqual(["b", "new"]);
    expect(ids(changed.items)).toEqual(["fixed"]);
  });
});

describe("startOptions", () => {
  const ids3 = { set: "s", first: "f", second: "g" } as const;

  it("makes what the meal already holds its first version", () => {
    // The whole argument for the button (#H): the person pressing it has a
    // breakfast, and what they mean is "this is one of the ways I have it".
    const [meal] = startOptions([plain], "m1", ids3);
    const set = meal.optionSets![0];

    expect(meal.items).toEqual([]);
    expect(set.selectedId).toBe("f");
    expect(ids(set.options[0].items)).toEqual(["x"]);
    expect(set.options[1].items).toEqual([]);
    expect(ids(effectiveItems(meal))).toEqual(["x"]);
  });

  it("names neither version, because the chips read the food", () => {
    const [meal] = startOptions([plain], "m1", ids3);
    const set = meal.optionSets![0];

    expect([set.name, ...set.options.map((option) => option.name)]).toEqual([
      "",
      "",
      "",
    ]);
  });

  it("refuses a second question in one meal", () => {
    // One per meal (#H): the ceiling is what lets the screen stop saying
    // "conjunto" at all.
    expect(canAddSet(breakfast())).toBe(false);
    const [meal] = startOptions([breakfast()], "m1", ids3);

    expect(optionSetsOf(meal)).toHaveLength(1);
    expect(ids(meal.items)).toEqual(["fixed"]);
  });
});

describe("optionSignature", () => {
  it("takes the first two foods, in plan order", () => {
    const option = {
      id: "o",
      name: "",
      items: [item("a", bread), item("b", oats), item("c", oil)],
    };

    expect(optionSignature(option)).toEqual([bread, oats]);
  });

  it("has nothing to say about an empty version", () => {
    expect(optionSignature({ id: "o", name: "", items: [] })).toEqual([]);
  });
});

describe("addOption", () => {
  it("appends an answer without changing the selection", () => {
    const [meal] = addOption([breakfast()], "m1", "s1", {
      id: "o3",
      name: "Tapioca",
      items: [],
    });

    expect(meal.optionSets![0].options).toHaveLength(3);
    expect(meal.optionSets![0].selectedId).toBe("o1");
  });

  it("refuses past the ceiling", () => {
    const options = Array.from(
      { length: OPTION_LIMITS.options.max },
      (_, i) => ({
        id: `o${i}`,
        name: "A",
        items: [],
      }),
    );
    const full = breakfast({
      optionSets: [{ id: "s1", name: "n", selectedId: "o0", options }],
    });

    expect(canAddOption(full.optionSets![0])).toBe(false);
    const [meal] = addOption([full], "m1", "s1", {
      id: "extra",
      name: "A",
      items: [],
    });

    expect(meal.optionSets![0].options).toHaveLength(OPTION_LIMITS.options.max);
  });
});

describe("removeOption", () => {
  const three = breakfast({
    optionSets: [
      {
        id: "s1",
        name: "Carboidrato",
        selectedId: "o1",
        options: [
          { id: "o1", name: "Pão", items: [item("a", bread)] },
          { id: "o2", name: "Aveia", items: [item("b", oats)] },
          { id: "o3", name: "Tapioca", items: [] },
        ],
      },
    ],
  });

  it("moves the selection when it removes the selected option", () => {
    // A set pointing at a deleted option is a meal that contributes nothing and
    // looks entirely normal on screen.
    const [meal] = removeOption([three], "m1", "s1", "o1");

    expect(meal.optionSets![0].selectedId).toBe("o2");
    expect(ids(effectiveItems(meal))).toEqual(["fixed", "b"]);
  });

  it("leaves the selection alone when it removes another one", () => {
    const [meal] = removeOption([three], "m1", "s1", "o3");

    expect(meal.optionSets![0].selectedId).toBe("o1");
  });

  it("folds the last survivor back into the meal (#H)", () => {
    // Deleting the second-to-last version is not a rule to enforce, it is
    // somebody saying they no longer want a choice here.
    expect(endsTheChoice(breakfast().optionSets![0])).toBe(true);
    const [meal] = removeOption([breakfast()], "m1", "s1", "o2");

    expect(ids(meal.items)).toEqual(["fixed", "a"]);
    expect("optionSets" in meal).toBe(false);
  });

  it("keeps the meal's own rows before the ones it folds in", () => {
    const [meal] = removeOption([breakfast()], "m1", "s1", "o1");

    expect(ids(effectiveItems(meal))).toEqual(["fixed", "b"]);
  });

  it("still shortens a set that has more than two", () => {
    expect(endsTheChoice(three.optionSets![0])).toBe(false);
    const [meal] = removeOption([three], "m1", "s1", "o3");

    expect(meal.optionSets![0].options).toHaveLength(2);
  });
});

describe("selectOption", () => {
  it("refuses an id the set does not hold", () => {
    // Rather than storing it and letting the read-time fallback cover for it.
    const [meal] = selectOption([breakfast()], "m1", "s1", "elsewhere");

    expect(meal.optionSets![0].selectedId).toBe("o1");
  });
});

describe("checkOptionName", () => {
  it("trims before it judges", () => {
    expect(checkOptionName(" Pão ")).toEqual({ value: "Pão" });
  });

  it("takes no name at all, which is the normal state (#H)", () => {
    // An unnamed version is named after the food in it.
    expect(checkOptionName("  ")).toEqual({ value: "" });
  });

  it("refuses a name longer than the box", () => {
    const long = "a".repeat(OPTION_LIMITS.nameLength.max + 1);

    expect(checkOptionName(long)).toEqual({ error: "nameLength" });
  });
});

describe("checkMealOptions", () => {
  it("says nothing about a meal with no options at all", () => {
    expect(checkMealOptions(plain)).toBeUndefined();
  });

  it("says nothing about versions nobody named", () => {
    const meal = breakfast();
    const set = meal.optionSets![0];

    expect(
      checkMealOptions({
        ...meal,
        optionSets: [
          {
            ...set,
            name: "",
            options: set.options.map((option) => ({ ...option, name: "" })),
          },
        ],
      }),
    ).toBeUndefined();
  });

  it("catches a name longer than the control can show", () => {
    const meal = breakfast();
    const long = "a".repeat(OPTION_LIMITS.nameLength.max + 1);

    expect(
      checkMealOptions({
        ...meal,
        optionSets: [{ ...meal.optionSets![0], name: long }],
      }),
    ).toBe("nameLength");
  });
});

describe("trimOptionNames", () => {
  it("leaves a meal with no options exactly as it was", () => {
    expect(trimOptionNames(plain)).toBe(plain);
  });

  it("trims the set and every option in it", () => {
    const meal = breakfast();
    const set = meal.optionSets![0];
    const spaced = trimOptionNames({
      ...meal,
      optionSets: [
        {
          ...set,
          name: "  Carboidrato ",
          options: [{ ...set.options[0], name: " Pão  " }, set.options[1]],
        },
      ],
    });

    expect(spaced.optionSets![0].name).toBe("Carboidrato");
    expect(spaced.optionSets![0].options[0].name).toBe("Pão");
  });

  it("keeps the rows and the selection untouched", () => {
    const trimmed = trimOptionNames(breakfast());

    expect(trimmed.optionSets![0].selectedId).toBe("o1");
    expect(trimmed.optionSets![0].options[0].items).toHaveLength(1);
  });
});
