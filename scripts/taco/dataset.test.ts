/**
 * Invariants of the extracted dataset — the file the app actually ships.
 *
 * parse.test.ts checks the rules on three pages; this checks the 597 rows those
 * rules produced. It needs no PDF and no database, so it runs in CI, and it is
 * the thing that would notice if data/taco-4ed.json were ever edited by hand,
 * regenerated from a different file, or truncated by a failed extract.
 *
 * These are structural checks plus a few quotations. The extraction itself was
 * verified a second, independent way — every printed cell of all 1194 half-rows
 * was re-read with poppler's `pdftotext -layout` and compared, including the 509
 * rows that contain blanks. See docs/DECISIONS.md § D13.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { TACO_SOURCE } from "../../src/lib/attribution.ts";
import { NUTRIENT_KEYS } from "../../src/lib/db/nutrients.ts";
import { DATA_FILE, type TacoDataset } from "./dataset.ts";
import { fold, slugify } from "../../src/lib/text.ts";

const dataset = JSON.parse(readFileSync(DATA_FILE, "utf8")) as TacoDataset;
const { foods, groups } = dataset;

/** `numeric(10, 3)` on `foods` — see src/lib/db/schema/foods.ts. */
const PRECISION = 10;
const SCALE = 3;
const SENTINELS = new Set(["NA", "Tr", "*"]);

describe("provenance", () => {
  it("names the file it was read from, and that file is the pinned one", () => {
    expect(dataset.dataset).toBe("taco");
    expect(dataset.sha256).toBe(TACO_SOURCE.sha256);
    expect(dataset.edition).toBe(TACO_SOURCE.editionShort);
    expect(dataset.sourceUrl).toBe(TACO_SOURCE.url);
    expect(dataset.fileBytes).toBeGreaterThan(0);
    expect(dataset.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("groups", () => {
  it("holds TACO's fifteen categories in printed order", () => {
    expect(groups).toHaveLength(15);
    expect(groups.map((group) => group.position)).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 1),
    );
    expect(groups[0]!.name).toBe("Cereais e derivados");
    expect(groups.at(-1)!.name).toBe("Nozes e sementes");
  });

  it("derives every slug from the name it prints", () => {
    for (const group of groups) {
      expect(group.slug).toBe(slugify(group.name));
    }
    expect(new Set(groups.map((group) => group.slug)).size).toBe(groups.length);
  });

  it("has no empty category", () => {
    for (const group of groups) {
      expect(
        foods.some((food) => food.groupSlug === group.slug),
        `${group.slug} has no foods`,
      ).toBe(true);
    }
  });
});

describe("foods", () => {
  it("holds every food the publication numbers, once", () => {
    expect(foods).toHaveLength(TACO_SOURCE.foodCount);
    expect(foods.map((food) => food.id)).toEqual(
      Array.from({ length: TACO_SOURCE.foodCount }, (_, index) => index + 1),
    );
  });

  it("files each food under a category that exists", () => {
    const slugs = new Set(groups.map((group) => group.slug));
    for (const food of foods) {
      expect(slugs.has(food.groupSlug), `${food.id}: ${food.groupSlug}`).toBe(
        true,
      );
    }
  });

  it("carries the description as printed, and a folded copy for search", () => {
    for (const food of foods) {
      expect(food.description.trim()).toBe(food.description);
      expect(food.description.length).toBeGreaterThan(0);
      expect(food.searchText).toBe(fold(food.description));
    }
  });

  it("only names nutrients the schema has columns for", () => {
    const known = new Set<string>(NUTRIENT_KEYS);
    for (const food of foods) {
      for (const key of Object.keys(food.values)) {
        expect(known.has(key), `${food.id}: ${key}`).toBe(true);
      }
      for (const key of Object.keys(food.sentinels)) {
        expect(known.has(key), `${food.id}: ${key}`).toBe(true);
      }
    }
  });

  it("never gives one cell both a number and a reason there isn't one", () => {
    for (const food of foods) {
      for (const key of Object.keys(food.sentinels)) {
        expect(food.values, `${food.id}: ${key}`).not.toHaveProperty(key);
      }
    }
  });

  it("stores values that survive the numeric column unchanged", () => {
    const limit = 10 ** (PRECISION - SCALE);
    for (const food of foods) {
      for (const [key, value] of Object.entries(food.values)) {
        expect(Number.isFinite(value), `${food.id}: ${key}`).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(limit);
        expect(Number(value.toFixed(SCALE)), `${food.id}: ${key}`).toBe(value);
      }
    }
  });

  it("uses only the three marks the publication prints", () => {
    for (const food of foods) {
      for (const [key, sentinel] of Object.entries(food.sentinels)) {
        expect(SENTINELS.has(sentinel), `${food.id}: ${key}=${sentinel}`).toBe(
          true,
        );
      }
    }
  });

  it("keeps the two energy columns consistent with each other", () => {
    // Independent of the geometry: 1 kcal is 4,184 kJ, so a column that had
    // slipped sideways anywhere in the table would show up here as a pair that
    // does not convert. The 3 kJ allowance is rounding — the publication prints
    // both figures rounded, and the worst real pair is 2,5 kJ apart.
    for (const food of foods) {
      const { energyKcal, energyKj } = food.values;
      if (energyKcal === undefined || energyKj === undefined) continue;
      expect(
        Math.abs(energyKj - energyKcal * 4.184),
        `${food.id}: ${energyKcal} kcal vs ${energyKj} kJ`,
      ).toBeLessThanOrEqual(3);
    }
  });
});

describe("withheld figures", () => {
  it("keeps `*` on the foods NEPA withdrew, including common ones", () => {
    // "Leite, de vaca, integral" — TACO 4. ed., p. 60–61. Its macros are `*`,
    // *as análises estão sendo reavaliadas*, which is why a plan builder has to
    // filter on `protein_g IS NOT NULL` rather than treat the gap as a zero.
    const milk = foods.find((food) => food.id === 458)!;
    expect(milk.description).toBe("Leite, de vaca, integral");
    expect(milk.sentinels.energyKcal).toBe("*");
    expect(milk.sentinels.proteinG).toBe("*");
    expect(milk.sentinels.fatG).toBe("*");
    expect(milk.sentinels.carbG).toBe("*");
    expect(milk.values.calciumMg).toBe(123);

    const withheld = foods.filter((food) =>
      Object.values(food.sentinels).includes("*"),
    );
    expect(withheld).toHaveLength(21);
  });
});
