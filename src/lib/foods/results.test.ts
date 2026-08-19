import { describe, expect, it } from "vitest";

import { createMemoryRepository } from "@/lib/storage";
import type { CustomFood } from "@/lib/storage/types";
import type { FoodSearchResult } from "@/lib/db/foods";

import { matchesTerms, mergeListings, searchCustomFoods } from "./results";
import { parseFoodQuery } from "./query";

function custom(name: string, extra: Partial<CustomFood> = {}): CustomFood {
  return {
    id: `id-${name}`,
    name,
    per100g: { kcal: 362, proteinG: 80, carbG: 6, fatG: 2 },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

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

/** The words the server would search for, so both halves answer the same question. */
function terms(typed: string): readonly string[] {
  return parseFoodQuery(typed)?.terms ?? [];
}

describe("matchesTerms", () => {
  it("ignores case and accents on both sides", () => {
    expect(matchesTerms(custom("Açaí batido"), terms("ACAI"))).toBe(true);
    expect(matchesTerms(custom("Acai batido"), terms("açaí"))).toBe(true);
  });

  it("searches the brand too", () => {
    // Someone who wrote the food down under its flavour still looks for it by
    // the name on the tub.
    const whey = custom("Baunilha", { brand: "Growth" });

    expect(matchesTerms(whey, terms("growth"))).toBe(true);
  });

  it("narrows on every word rather than any", () => {
    // The same `&` the tsquery uses. A second word that widened the result
    // would make the device's half disagree with the server's.
    const food = custom("Pão integral");

    expect(matchesTerms(food, terms("pao integral"))).toBe(true);
    expect(matchesTerms(food, terms("pao frances"))).toBe(false);
  });

  it("matches inside a word, not only at its start", () => {
    // The server prefix-matches; a stored list is small enough to do better,
    // and "protein" ought to find "Whey protein".
    expect(matchesTerms(custom("Whey protein"), terms("protein"))).toBe(true);
  });
});

describe("searchCustomFoods", () => {
  async function withFoods(...foods: CustomFood[]) {
    const repository = createMemoryRepository();
    for (const food of foods) await repository.customFoods.put(food);
    return repository;
  }

  it("returns what the device has for those words", async () => {
    const repository = await withFoods(
      custom("Whey protein isolado", { brand: "Growth" }),
      custom("Pão de forma integral"),
    );

    const found = await searchCustomFoods(repository, terms("whey"));

    expect(found.map((food) => food.name)).toEqual(["Whey protein isolado"]);
  });

  it("applies the words after the first as narrowings", async () => {
    const repository = await withFoods(
      custom("Pão de forma integral"),
      custom("Pão de forma branco"),
    );

    expect((await searchCustomFoods(repository, terms("pao"))).length).toBe(2);
    expect(
      (await searchCustomFoods(repository, terms("pao integral"))).map((f) => f.name),
    ).toEqual(["Pão de forma integral"]);
  });

  it("orders by name so the same search looks the same twice", async () => {
    // Insertion order is not an order a user can predict, and a list that
    // reshuffles between identical searches reads as a bug.
    const repository = await withFoods(
      custom("Iogurte caseiro"),
      custom("Amendoim caseiro"),
      custom("Ervilha caseira"),
    );

    const found = await searchCustomFoods(repository, terms("caseir"));

    expect(found.map((food) => food.name)).toEqual([
      "Amendoim caseiro",
      "Ervilha caseira",
      "Iogurte caseiro",
    ]);
  });

  it("finds a food by the brand on the tub", async () => {
    // End to end, not just through `matchesTerms`: the first word goes to the
    // repository, so a repository that only scanned names would answer nothing
    // here while the match rule said it should have matched.
    const repository = await withFoods(
      custom("Baunilha", { brand: "Growth" }),
      custom("Pão de forma integral"),
    );

    expect((await searchCustomFoods(repository, terms("growth"))).length).toBe(1);
  });

  it("asks the device nothing when there is nothing to ask", async () => {
    const repository = await withFoods(custom("Whey protein"));

    expect(await searchCustomFoods(repository, [])).toEqual([]);
  });
});

describe("mergeListings", () => {
  it("puts the user's own foods above the published table", () => {
    // Interleaved, the one food someone typed by hand sits under twenty rows
    // of TACO — which is the failure #17 exists to fix.
    const merged = mergeListings(
      [custom("Whey protein")],
      [taco(1, "Arroz, integral, cozido"), taco(2, "Arroz, tipo 1, cozido")],
    );

    expect(merged.map((listing) => listing.source)).toEqual([
      "custom",
      "taco",
      "taco",
    ]);
  });

  it("keeps the two id spaces apart", () => {
    // A TACO id is a number and a custom id is a string, and both can be "1".
    // Sharing a React key would make one of them disappear.
    const merged = mergeListings([custom("x", { id: "1" })], [taco(1, "Arroz")]);

    expect(merged.map((listing) => listing.key)).toEqual(["custom:1", "taco:1"]);
  });

  it("carries the reference a plan will store, not the food itself", () => {
    // #19 and #20 add these to meals; a listing that only had a name would
    // force the builder to guess which table to look it up in.
    const merged = mergeListings([custom("Whey", { id: "abc" })], [taco(7, "Arroz")]);

    expect(merged.map((listing) => listing.ref)).toEqual([
      { source: "custom", customFoodId: "abc" },
      { source: "taco", tacoId: 7 },
    ]);
  });

  it("is just the other half when one half is empty", () => {
    // Both cases are ordinary: a new user has no foods of their own, and an
    // offline device cannot reach TACO.
    expect(mergeListings([], [taco(1, "Arroz")]).length).toBe(1);
    expect(mergeListings([custom("Whey")], []).length).toBe(1);
    expect(mergeListings([], [])).toEqual([]);
  });
});
