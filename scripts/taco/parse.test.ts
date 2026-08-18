/**
 * The parser, against three real pages of the publication.
 *
 * `fixtures/pages.json` is the positioned text pdfjs reports for PDF pages 29,
 * 30 and 64 of the pinned TACO file — captured, not written by hand, because
 * the whole point of the parser is that it copes with how this document is
 * actually typeset. Pages 29 and 30 are the first facing spread, so they carry
 * a group heading and the full 26 nutrients for foods 1–31. Page 64 is here for
 * one row: food 547, whose riboflavin and pyridoxine the publication prints
 * some 25pt right of every other row on the page.
 *
 * The expected numbers below are quotations from TACO. If one of them ever has
 * to change to make a test pass, the change is wrong.
 */

import { describe, expect, it } from "vitest";

import { type Page, parsePage, parseTable } from "./parse.ts";
import fixture from "./fixtures/pages.json";

const pages = fixture as Page[];
const page = (number: number): Page => {
  const found = pages.find((candidate) => candidate.number === number);
  if (!found) throw new Error(`Fixture has no page ${number}`);
  return found;
};

const SPREAD = [page(29), page(30)];

describe("parseTable", () => {
  const { groups, foods } = parseTable(SPREAD);

  it("reads the group heading that opens the table", () => {
    expect(groups).toEqual([
      { slug: "cereais-e-derivados", name: "Cereais e derivados", position: 1 },
    ]);
  });

  it("finds every food on the spread, and only those", () => {
    expect(foods.map((food) => food.id)).toEqual(
      Array.from({ length: 31 }, (_, index) => index + 1),
    );
    expect(foods.every((food) => food.groupSlug === "cereais-e-derivados")).toBe(
      true,
    );
  });

  it("joins both halves of a food into one published row", () => {
    // Arroz, integral, cozido — TACO 4. ed., p. 29–30.
    expect(foods[0]).toEqual({
      id: 1,
      groupSlug: "cereais-e-derivados",
      description: "Arroz, integral, cozido",
      searchText: "arroz, integral, cozido",
      values: {
        moisturePercent: 70.1,
        energyKcal: 124,
        energyKj: 517,
        proteinG: 2.6,
        fatG: 1,
        carbG: 25.8,
        fiberG: 2.7,
        ashG: 0.5,
        calciumMg: 5,
        magnesiumMg: 59,
        manganeseMg: 0.63,
        phosphorusMg: 106,
        ironMg: 0.3,
        sodiumMg: 1,
        potassiumMg: 75,
        copperMg: 0.02,
        zincMg: 0.7,
        thiamineMg: 0.08,
        pyridoxineMg: 0.08,
      },
      sentinels: {
        cholesterolMg: "NA",
        retinolMcg: "NA",
        riboflavinMg: "Tr",
        niacinMg: "Tr",
      },
    });
  });

  it("leaves a blank cell blank instead of shifting the row", () => {
    // This is the failure the whole module exists to prevent. Food 1 prints
    // twelve cells under spread B's fifteen columns: retinol is `NA`, the two
    // retinol-equivalent columns after it are empty, and thiamine resumes in
    // the eleventh. Match by counting and thiamine becomes a retinol
    // equivalent — a number attributed to a nutrient NEPA did not measure.
    const food = foods[0]!;
    expect(food.values.thiamineMg).toBe(0.08);
    expect(food.values).not.toHaveProperty("retinolEquivalentMcg");
    expect(food.sentinels).not.toHaveProperty("retinolEquivalentMcg");
    expect(food.values).not.toHaveProperty("retinolActivityEquivalentMcg");
    expect(food.sentinels).not.toHaveProperty("retinolActivityEquivalentMcg");
    expect(food.values).not.toHaveProperty("vitaminCMg");
    expect(food.sentinels).not.toHaveProperty("vitaminCMg");
  });

  it("keeps a value and a sentinel apart in the same column", () => {
    // Bolo, pronto, milho prints a retinol figure where food 1 prints `NA`.
    const food = foods.find((candidate) => candidate.id === 18)!;
    expect(food.values.retinolMcg).toBe(57);
    expect(food.sentinels.retinolMcg).toBeUndefined();
    expect(food.sentinels.niacinMg).toBe("Tr");
    expect(food.values.niacinMg).toBeUndefined();
  });

  it("takes the description verbatim, and folds a copy for search", () => {
    const food = foods.find((candidate) => candidate.id === 24)!;
    expect(food.description).toBe(
      "Cereais, mistura para vitamina, trigo, cevada e aveia",
    );
    expect(food.searchText).toBe(
      "cereais, mistura para vitamina, trigo, cevada e aveia",
    );
  });

  it("refuses a food that was only found on one half of the table", () => {
    expect(() => parseTable([page(29)])).toThrow(/only found on spread A/);
  });

  it("refuses a page whose columns do not match the nutrient list", () => {
    // A page that has been re-typeset, or a nutrient list edited out of step
    // with the publication, has to stop the ingest — the alternative is a
    // plausible-looking table of misfiled numbers.
    const original = page(29);
    const swapped: Page = {
      number: original.number,
      items: original.items.map((item) =>
        item.text === "(kcal)" ? { ...item, text: "(mg)" } : item,
      ),
    };
    expect(() => parseTable([swapped, page(30)])).toThrow(
      /column 2 is headed "mg" but energyKcal is measured in "kcal"/,
    );
  });
});

describe("parsePage", () => {
  it("files a misprinted row by order rather than by position", () => {
    // Food 547 prints all fifteen of spread B's cells, so the typesetter has
    // already fixed the assignment — but its riboflavin sits at x=626 where the
    // column is at x=601. Nearest-column matching would put it in thiamine's
    // column and cascade from there.
    const row = parsePage(page(64)).rows.find((candidate) => candidate.id === 547)!;
    expect(row.cells.values).toEqual({
      manganeseMg: 0.03,
      phosphorusMg: 103,
      ironMg: 0.3,
      sodiumMg: 248,
      potassiumMg: 149,
      copperMg: 0.08,
      zincMg: 0.4,
      retinolEquivalentMcg: 15,
      retinolActivityEquivalentMcg: 7,
      thiamineMg: 0.05,
      niacinMg: 1.48,
      vitaminCMg: 9.3,
    });
    expect(row.cells.sentinels).toEqual({
      retinolMcg: "Tr",
      riboflavinMg: "Tr",
      pyridoxineMg: "Tr",
    });
  });

  it("ignores the running title, the page number and the footnote markers", () => {
    // The page also carries a running "Tabela 1. Composição…" title, a bare
    // page number in the same band as the food numbers, and the superscript
    // markers that annotate the retinol columns. None of them is a food.
    const { rows } = parsePage(page(64));
    expect(rows.map((row) => row.id)).toEqual(
      Array.from({ length: 29 }, (_, index) => index + 521),
    );
  });
});
