import { describe, expect, it, vi } from "vitest";

import type { FoodSearchResult } from "@/lib/db/foods";

import { foodSearchResponse, type FoodSearchFn } from "./endpoint";
import { DEFAULT_LIMIT, MAX_LIMIT } from "./query";

/**
 * The request-to-response half of `GET /api/foods` (#16).
 *
 * The search itself is a stub here on purpose — what the SQL does is settled in
 * src/lib/db/foods.test.ts against a real Postgres. What is left to check is
 * the part a database cannot tell you about: what happens when nothing was
 * typed, what the response says it searched for, and what is in the body.
 */

const ARROZ: FoodSearchResult = {
  id: 1,
  description: "Arroz, integral, cozido",
  groupSlug: "cereais-e-derivados",
  groupName: "Cereais e derivados",
  energyKcal: 124,
  proteinG: 2.6,
  carbG: 25.8,
  fatG: 1,
  fiberG: 2.7,
  sentinels: {},
};

function stub(results: readonly FoodSearchResult[] = [ARROZ]) {
  return vi.fn<FoodSearchFn>(async () => results);
}

function params(query: string): URLSearchParams {
  return new URL(`https://dietkit.test/api/foods?${query}`).searchParams;
}

describe("foodSearchResponse", () => {
  it("answers with the foods that were found", async () => {
    const response = await foodSearchResponse(stub(), params("q=arroz"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      query: "arroz",
      count: 1,
      foods: [ARROZ],
    });
  });

  it("hands the search the folded words and the default limit", async () => {
    const search = stub();
    await foodSearchResponse(search, params("q=Feij%C3%A3o%20carioca"));

    expect(search).toHaveBeenCalledWith(
      { terms: ["feijao", "carioca"], tsquery: "feijao:* & carioca:*" },
      DEFAULT_LIMIT,
    );
  });

  it("takes the limit from the query string, clamped", async () => {
    const search = stub();
    await foodSearchResponse(search, params("q=arroz&limit=999"));

    expect(search).toHaveBeenCalledWith(expect.anything(), MAX_LIMIT);
  });

  it("answers an empty box with an empty list, and asks the database nothing", async () => {
    const search = stub();
    const response = await foodSearchResponse(search, params("q=a"));

    // A box with one letter in it is not a bad request, it is a box being
    // typed into: the client renders a list either way, and the round trip
    // that would have matched a third of the table never happens.
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      query: "",
      count: 0,
      foods: [],
    });
    expect(search).not.toHaveBeenCalled();
  });

  it("treats a missing q the same way", async () => {
    const search = stub();
    const response = await foodSearchResponse(search, params(""));

    expect(response.status).toBe(200);
    expect(search).not.toHaveBeenCalled();
  });

  it("echoes what was searched for, not what was typed", async () => {
    // The response says `feijao carioca` because that is what the server
    // looked for — and it is also all the server kept.
    const body = await (
      await foodSearchResponse(stub(), params("q=%20FEIJ%C3%83O%2C%20carioca"))
    ).json();

    expect(body.query).toBe("feijao carioca");
  });

  it("may be cached by anyone, because there is nothing personal in it", async () => {
    const response = await foodSearchResponse(stub(), params("q=arroz"));
    const cacheControl = response.headers.get("cache-control");

    // `public` is a claim about the body, and it is only allowed to be there
    // because the body is a quotation from a published table: no cookie is
    // read, no header is inspected, nothing here varies per person.
    expect(cacheControl).toContain("public");
    expect(cacheControl).toContain("s-maxage=");
    expect(response.headers.has("set-cookie")).toBe(false);
  });

  it("carries nothing but the query, the count and the foods", async () => {
    // The same guard src/app/api/health/route.test.ts keeps: a response grows
    // a field one commit at a time, and this is the commit that notices.
    const body = await (
      await foodSearchResponse(stub(), params("q=arroz"))
    ).json();

    expect(Object.keys(body).sort()).toEqual(["count", "foods", "query"]);
    expect(Object.keys(body.foods[0]).sort()).toEqual([
      "carbG",
      "description",
      "energyKcal",
      "fatG",
      "fiberG",
      "groupName",
      "groupSlug",
      "id",
      "proteinG",
      "sentinels",
    ]);
  });
});
