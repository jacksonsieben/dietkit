import { describe, expect, it } from "vitest";

import type { DietItem, FoodRef, Meal, OptionSet } from "@/lib/storage/types";

import {
  OPTION_LIMITS,
  addOption,
  addSet,
  addToContainer,
  allItems,
  canAddOption,
  canAddSet,
  canRemoveOption,
  checkMealOptions,
  checkOptionName,
  containerItems,
  effectiveItems,
  mapMealItems,
  newOptionSet,
  optionSetsOf,
  removeOption,
  removeSet,
  renameOption,
  renameSet,
  selectOption,
  selectedOption,
  siblingItems,
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

describe("newOptionSet", () => {
  it("selects the first option, so a fresh set is already answerable", () => {
    const set = newOptionSet({ id: "s", name: "Carboidrato" }, [
      { id: "o1", name: "A" },
      { id: "o2", name: "B" },
    ]);

    expect(set.selectedId).toBe("o1");
    expect(set.options.map((option) => option.items)).toEqual([[], []]);
  });
});

describe("addSet", () => {
  it("gives a meal that had none an `optionSets` list", () => {
    const set = newOptionSet({ id: "s", name: "n" }, [{ id: "o", name: "A" }]);
    const [meal] = addSet([plain], "m1", set);

    expect(optionSetsOf(meal)).toHaveLength(1);
  });

  it("refuses past the ceiling, so a disabled button is telling the truth", () => {
    const full = breakfast({
      optionSets: Array.from({ length: OPTION_LIMITS.sets.max }, (_, i) =>
        newOptionSet({ id: `s${i}`, name: "n" }, [{ id: `o${i}`, name: "A" }]),
      ),
    });

    expect(canAddSet(full)).toBe(false);
    const [meal] = addSet(
      [full],
      "m1",
      newOptionSet({ id: "x", name: "n" }, []),
    );

    expect(optionSetsOf(meal)).toHaveLength(OPTION_LIMITS.sets.max);
  });
});

describe("removeSet", () => {
  it("takes every option in it, including unselected ones", () => {
    const [meal] = removeSet([breakfast()], "m1", "s1");

    expect(ids(allItems(meal))).toEqual(["fixed"]);
  });

  it("leaves no empty `optionSets` key behind", () => {
    // Otherwise two plans that are the same plan sync as different ones.
    const [meal] = removeSet([breakfast()], "m1", "s1");

    expect("optionSets" in meal).toBe(false);
  });
});

describe("renameSet and renameOption", () => {
  it("rename without touching the rows", () => {
    const [renamed] = renameSet([breakfast()], "m1", "s1", "Carbo");
    const [meal] = renameOption([renamed], "m1", "s1", "o2", "Mingau");

    expect(meal.optionSets![0].name).toBe("Carbo");
    expect(meal.optionSets![0].options[1].name).toBe("Mingau");
    expect(ids(allItems(meal))).toEqual(["fixed", "a", "b"]);
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

  it("refuses to leave a set with one answer", () => {
    expect(canRemoveOption(breakfast().optionSets![0])).toBe(false);
    const [meal] = removeOption([breakfast()], "m1", "s1", "o2");

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
    expect(checkOptionName("  ")).toEqual({ error: "required" });
    expect(checkOptionName(" Pão ")).toEqual({ value: "Pão" });
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

  it("catches a set whose name was cleared", () => {
    const meal = breakfast();
    expect(
      checkMealOptions({
        ...meal,
        optionSets: [{ ...meal.optionSets![0], name: "  " }],
      }),
    ).toBe("required");
  });

  it("catches an option whose name was cleared", () => {
    const meal = breakfast();
    const set = meal.optionSets![0];

    expect(
      checkMealOptions({
        ...meal,
        optionSets: [
          {
            ...set,
            options: [{ ...set.options[0], name: "" }, set.options[1]],
          },
        ],
      }),
    ).toBe("required");
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
