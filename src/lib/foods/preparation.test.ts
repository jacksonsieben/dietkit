import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import type { FoodSearchResult } from "@/lib/db/foods";
import type { CustomFood } from "@/lib/storage/types";

import { cookedFirst, preparationOf } from "./preparation";
import { mergeListings } from "./results";

function taco(id: number, description: string): FoodSearchResult {
  return {
    id,
    description,
    groupSlug: "cereais",
    groupName: "Cereais e derivados",
    energyKcal: 128,
    proteinG: 2.5,
    carbG: 28.1,
    fatG: 0.2,
    fiberG: 1.6,
    sentinels: {},
  };
}

function custom(name: string): CustomFood {
  return {
    id: `id-${name}`,
    name,
    per100g: { kcal: 362, proteinG: 80, carbG: 6, fatG: 2 },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const names = (listings: readonly ReturnType<typeof mergeListings>[number][]) =>
  listings.map((listing) =>
    listing.source === "taco" ? listing.food.description : listing.food.name,
  );

describe("preparationOf", () => {
  it("reads the word TACO puts at the end of the name", () => {
    expect(preparationOf("Arroz, tipo 1, cru")).toBe("raw");
    expect(preparationOf("Arroz, tipo 1, cozido")).toBe("cooked");
  });

  it("agrees the participle with the food, as Portuguese does", () => {
    expect(preparationOf("Aveia, flocos, crua")).toBe("raw");
    expect(preparationOf("Lasanha, massa fresca, cozida")).toBe("cooked");
    expect(preparationOf("Pastel, massa, frita")).toBe("cooked");
  });

  it("counts the other ways of applying heat as cooked", () => {
    // A grilled steak is no more the raw food than a boiled one is, and the
    // whole point of the ordering is "what you eat" against "what you buy".
    expect(preparationOf("Carne, bovina, contra-filé, grelhado")).toBe("cooked");
    expect(preparationOf("Frango, coxa, assada")).toBe("cooked");
    expect(preparationOf("Couve, manteiga, refogada")).toBe("cooked");
  });

  it("finds the word where the publication ran it into another", () => {
    // Real row: the separator is a slash, not a comma.
    expect(preparationOf("Ovo, de galinha, inteiro, cozido/10minutos")).toBe(
      "cooked",
    );
  });

  it("says nothing about a food that is published only one way", () => {
    expect(preparationOf("Pão, trigo, francês")).toBeUndefined();
    expect(preparationOf("Leite, de vaca, integral")).toBeUndefined();
  });

  it("ignores the accents nobody types", () => {
    expect(preparationOf("Pamonha, barra para cozimento, pré-cozida")).toBe(
      "cooked",
    );
  });
});

describe("cookedFirst", () => {
  it("opens with what you eat and ends with what you buy", () => {
    const listings = mergeListings(
      [],
      [taco(1, "Arroz, tipo 1, cru"), taco(2, "Arroz, tipo 1, cozido")],
    );

    expect(names(cookedFirst(listings))).toEqual([
      "Arroz, tipo 1, cozido",
      "Arroz, tipo 1, cru",
    ]);
  });

  it("leaves an unmarked food between the two", () => {
    const listings = mergeListings(
      [],
      [
        taco(1, "Aveia, flocos, crua"),
        taco(2, "Pão, trigo, francês"),
        taco(3, "Arroz, integral, cozido"),
      ],
    );

    expect(names(cookedFirst(listings))).toEqual([
      "Arroz, integral, cozido",
      "Pão, trigo, francês",
      "Aveia, flocos, crua",
    ]);
  });

  it("keeps the user's own foods above the published table", () => {
    // `mergeListings` decides that, and a re-sort that quietly undid it would
    // bury the one food someone typed in by hand under twenty TACO rows.
    const listings = mergeListings(
      [custom("Whey, baunilha")],
      [taco(1, "Arroz, tipo 1, cozido")],
    );

    expect(names(cookedFirst(listings))[0]).toBe("Whey, baunilha");
  });

  it("does not disturb the order the endpoint chose inside a band", () => {
    // Two identical searches have to produce two identical lists, so the sort
    // may only move a row across a band boundary.
    const listings = mergeListings(
      [],
      [
        taco(1, "Feijão, carioca, cozido"),
        taco(2, "Feijão, preto, cozido"),
        taco(3, "Baião de dois, arroz e feijão-de-corda"),
      ],
    );

    expect(names(cookedFirst(listings))).toEqual([
      "Feijão, carioca, cozido",
      "Feijão, preto, cozido",
      "Baião de dois, arroz e feijão-de-corda",
    ]);
  });

  it("classifies every published row into exactly one band", () => {
    // The published table is the input this runs against, and a row that read
    // as both raw and cooked would make the ordering depend on word order.
    const published = JSON.parse(
      readFileSync("data/taco-4ed.json", "utf8"),
    ) as { foods: readonly { description: string }[] };

    const counts = { raw: 0, cooked: 0, unmarked: 0 };
    for (const food of published.foods) {
      counts[preparationOf(food.description) ?? "unmarked"] += 1;
    }

    expect(counts.raw + counts.cooked + counts.unmarked).toBe(
      published.foods.length,
    );
    // Not a snapshot of the arithmetic: a guard that the vocabulary still
    // reaches the table, so a fifth edition renaming the column shows up here
    // rather than as a list that quietly stopped sorting.
    expect(counts.cooked).toBeGreaterThan(100);
    expect(counts.raw).toBeGreaterThan(100);
  });
});
