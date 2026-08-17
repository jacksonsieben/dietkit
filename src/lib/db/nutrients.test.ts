import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  NUTRIENTS,
  NUTRIENT_KEYS,
  numericValue,
  nutrientUnit,
  readCell,
  type NutrientSentinels,
} from "./nutrients";
import { foods } from "./schema/foods";

/** A `foods` row, trimmed to what these helpers read. */
function row(
  values: Partial<Record<string, number | null>>,
  sentinels: NutrientSentinels = {},
) {
  return { ...values, sentinels };
}

describe("nutrient catalogue", () => {
  it("names exactly the numeric columns of the foods table", () => {
    // Two files have to agree on what a nutrient is: the table and the sentinel
    // map keyed by the same names. Adding a column without adding it here would
    // otherwise produce a nutrient no sentinel can ever describe.
    const numericColumns = Object.values(getTableColumns(foods))
      .filter((column) => column.columnType === "PgNumericNumber")
      .map((column) => column.name)
      .sort();

    const expected = NUTRIENT_KEYS.map((key) =>
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
    ).sort();

    expect(numericColumns).toEqual(expected);
  });

  it("has no duplicate keys", () => {
    expect(new Set(NUTRIENT_KEYS).size).toBe(NUTRIENT_KEYS.length);
  });

  it("carries a unit for every nutrient", () => {
    for (const key of NUTRIENT_KEYS) {
      expect(nutrientUnit(key)).toBeTruthy();
    }
    expect(nutrientUnit("proteinG")).toBe("g");
    expect(nutrientUnit("energyKcal")).toBe("kcal");
    expect(nutrientUnit("moisturePercent")).toBe("%");
  });

  it("keeps the published column order", () => {
    // A reader should be able to hold the PDF next to the file. The first spread
    // starts at moisture and ends at magnesium.
    expect(NUTRIENTS[0]?.key).toBe("moisturePercent");
    expect(NUTRIENTS[10]?.key).toBe("magnesiumMg");
    expect(NUTRIENTS.at(-1)?.key).toBe("vitaminCMg");
  });

  it("rejects a key it does not know", () => {
    expect(() =>
      // @ts-expect-error — the guard exists for data arriving from outside TS.
      nutrientUnit("vitaminK"),
    ).toThrow(/Unknown nutrient/);
  });
});

describe("reading a cell", () => {
  it("returns the value when the table printed one", () => {
    expect(readCell(row({ proteinG: 2.6 }), "proteinG")).toEqual({
      kind: "value",
      value: 2.6,
    });
  });

  it("keeps NA distinguishable from a measured zero", () => {
    const food = row({ cholesterolMg: null }, { cholesterolMg: "NA" });

    expect(readCell(food, "cholesterolMg")).toEqual({
      kind: "sentinel",
      sentinel: "NA",
    });
    // A real zero is a different fact and must read differently.
    expect(readCell(row({ cholesterolMg: 0 }), "cholesterolMg")).toEqual({
      kind: "value",
      value: 0,
    });
  });

  it("keeps Tr distinguishable from NA", () => {
    const food = row({ manganeseMg: null }, { manganeseMg: "Tr" });

    expect(readCell(food, "manganeseMg")).toEqual({
      kind: "sentinel",
      sentinel: "Tr",
    });
  });

  it("reports a blank cell as absent rather than inventing a reason", () => {
    // A third state: the publication leaves some cells empty, and calling that
    // `NA` would attribute a judgement to NEPA that NEPA did not print.
    expect(readCell(row({ zincMg: null }), "zincMg")).toEqual({
      kind: "absent",
    });
  });
});

describe("numeric value", () => {
  it("passes a real value through", () => {
    expect(numericValue(row({ carbG: 25.8 }), "carbG")).toBe(25.8);
  });

  it("counts Tr, NA and blank as zero for arithmetic", () => {
    // Summing a diet cannot stop on a sentinel. This is the only place the
    // collapse is allowed — rendering uses readCell, which keeps them apart.
    expect(
      numericValue(row({ fatG: null }, { fatG: "Tr" }), "fatG"),
    ).toBe(0);
    expect(
      numericValue(row({ fatG: null }, { fatG: "NA" }), "fatG"),
    ).toBe(0);
    expect(numericValue(row({ fatG: null }), "fatG")).toBe(0);
  });
});
