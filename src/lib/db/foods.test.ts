import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseFoodQuery } from "@/lib/foods/query";

import { DATA_FILE, type TacoDataset } from "../../../scripts/taco/dataset.ts";
import { foodsByIds, searchFoods, type FoodSearchResult } from "./foods";
import { NUTRIENT_KEYS } from "./nutrients";
import { createReferenceDatabase, type ReferenceDatabase } from "./pglite.fixture";
import { datasetVersions, foodGroups, foods } from "./schema";

/**
 * Food search, run against Postgres (#16).
 *
 * Against a real one, because everything the endpoint promises is a property of
 * the SQL rather than of the TypeScript around it: accent-insensitivity is the
 * folded column plus `to_tsquery`, "a food worth offering" is a condition over
 * a JSONB map, and the ordering is an expression the planner has to evaluate. A
 * mocked database would return whatever this file told it to and prove none of
 * that.
 *
 * The rows come out of data/taco-4ed.json rather than being typed here, so the
 * fixture is the publication — its accents, its 8,5 g of fibre, its `Tr` where
 * a staple has no fat figure — and not my transcription of it.
 */

const FIXTURE_IDS = [
  1, // Arroz, integral, cozido
  2, // Arroz, integral, cru
  20, // Canjica, com leite integral — matches "leite" without starting with it
  91, // Batata, inglesa, cozida — `Tr` for fat
  456, // Leite, de vaca, desnatado, pó
  458, // Leite, de vaca, integral — every macro withdrawn as `*`
  530, // Bolinho de arroz
  561, // Feijão, carioca, cozido
  562, // Feijão, carioca, cru
];

let fixture: ReferenceDatabase;

beforeAll(async () => {
  fixture = await createReferenceDatabase();
  const { db } = fixture;

  const dataset = JSON.parse(readFileSync(DATA_FILE, "utf8")) as TacoDataset;

  await db.insert(datasetVersions).values({
    id: 1,
    dataset: dataset.dataset,
    edition: dataset.edition,
    sha256: dataset.sha256,
    fileBytes: dataset.fileBytes,
    rowCount: FIXTURE_IDS.length,
    sourceUrl: dataset.sourceUrl,
    citation: "citation",
    retrievedAt: dataset.retrievedAt,
  });

  await db.insert(foodGroups).values([...dataset.groups]);

  const rows = FIXTURE_IDS.map((id) => {
    const food = dataset.foods.find((candidate) => candidate.id === id);
    if (!food) throw new Error(`food ${id} is not in ${DATA_FILE}`);

    // The same mapping seed.ts does: a nutrient missing from `values` is a
    // cell that printed no number, and is written as NULL.
    return {
      id: food.id,
      groupSlug: food.groupSlug,
      description: food.description,
      searchText: food.searchText,
      ...Object.fromEntries(
        NUTRIENT_KEYS.map((key) => [key, food.values[key] ?? null]),
      ),
      sentinels: food.sentinels,
      datasetVersionId: 1,
    } as typeof foods.$inferInsert;
  });

  await db.insert(foods).values(rows);
}, 60_000);

afterAll(async () => {
  await fixture.pg.close();
});

async function search(typed: string, limit = 20): Promise<FoodSearchResult[]> {
  const query = parseFoodQuery(typed);
  if (!query) throw new Error(`not a query: ${typed}`);

  return searchFoods(fixture.db, query, limit);
}

function descriptions(results: readonly FoodSearchResult[]): string[] {
  return results.map((result) => result.description);
}

describe("searchFoods", () => {
  it("finds an accented food from an unaccented query", async () => {
    // The requirement in as few words as it fits into: a phone keyboard that
    // never produced an "ã" still has to find the country's second staple.
    expect(descriptions(await search("feijao"))).toEqual([
      "Feijão, carioca, cozido",
      "Feijão, carioca, cru",
    ]);
  });

  it("finds the same food when the accent is typed", async () => {
    expect(descriptions(await search("Feijão"))).toEqual([
      "Feijão, carioca, cozido",
      "Feijão, carioca, cru",
    ]);
  });

  it("matches on a prefix, so results appear while the word is unfinished", async () => {
    expect(descriptions(await search("feij"))).toHaveLength(2);
  });

  it("requires every word typed, not any of them", async () => {
    // The two rows differ by 253 kcal per 100 g, and a plan is built out of
    // exactly that difference — so "feijao cru" may not return the cozido.
    expect(descriptions(await search("feijao cru"))).toEqual([
      "Feijão, carioca, cru",
    ]);
  });

  it("ignores the commas TACO writes its descriptions with", async () => {
    expect(descriptions(await search("arroz, integral"))).toEqual([
      "Arroz, integral, cozido",
      "Arroz, integral, cru",
    ]);
  });

  it("puts foods that start with the typed word first", async () => {
    // "Canjica, com leite integral" matches "leite" as well as the milk does,
    // sorts before it alphabetically, and is not what was being looked for.
    expect(descriptions(await search("leite"))).toEqual([
      "Leite, de vaca, desnatado, pó",
      "Canjica, com leite integral",
    ]);
  });

  it("keeps a food whose macro is a trace rather than a number", async () => {
    // Why the sentinel map is consulted at all: boiled potato has no fat
    // figure, and a plain NOT NULL filter would drop it — with 43 others.
    const [batata] = await search("batata cozida");

    expect(batata?.description).toBe("Batata, inglesa, cozida");
    expect(batata?.fatG).toBeNull();
    expect(batata?.sentinels).toEqual({ fatG: "Tr" });
  });

  it("drops a food whose macros NEPA withdrew", async () => {
    // Food 458 prints `*` where its energy and macros should be: the analyses
    // are being reviewed. Offering it means offering a food that adds nothing.
    expect(descriptions(await search("leite vaca"))).toEqual([
      "Leite, de vaca, desnatado, pó",
    ]);
  });

  it("returns only the macro sentinels, not the whole published map", async () => {
    // The row also carries `NA` for cholesterol and `Tr` for riboflavin.
    // Neither is in the response, which quotes only what it shows.
    const [feijao] = await search("feijao cozido");

    expect(feijao?.sentinels).toEqual({});
  });

  it("returns the per-100-g macros and the published group name", async () => {
    const [arroz] = await search("arroz integral cozido");

    expect(arroz).toEqual({
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
    });
  });

  it("returns exact decimals, not the nearest double", async () => {
    const [feijao] = await search("feijao cozido");

    // `numeric` all the way through: 8,5 g of fibre is 8.5, and the figure the
    // app shows is the figure the book prints (docs/TACO-LICENSING.md).
    expect(feijao?.fiberG).toBe(8.5);
  });

  it("returns no more rows than asked for", async () => {
    expect(descriptions(await search("arroz", 1))).toEqual([
      "Arroz, integral, cozido",
    ]);
  });

  it("treats punctuation a user types as punctuation, not as syntax", async () => {
    // Not an escaping claim. `parseFoodQuery` splits on everything that is not
    // a letter or a digit, so by the time the text reaches `to_tsquery` there
    // is no quote left to escape and no operator left to honour — which also
    // means a stray apostrophe cannot make the query fail at runtime, the way
    // a malformed tsquery argument otherwise would.
    expect(descriptions(await search("feijao'"))).toHaveLength(2);

    // `!x` reads as a tsquery negation, and honouring it would have widened
    // the result to every food without an "x" in it.
    expect(await search("feijao & !x")).toEqual([]);
  });

  it("can be answered from the search index", async () => {
    // The index only helps if its expression is the one the query writes, down
    // to the `'simple'` configuration; a mismatch is silent, and just means
    // every search reads the whole table. Sequential scans are turned off
    // because at nine rows — or at TACO's 597 — the planner would rightly
    // choose one, and the question here is whether the index *can* answer.
    await fixture.pg.exec("set enable_seqscan = off");
    const plan = await fixture.pg.query<{ "QUERY PLAN": string }>(
      `explain select id from foods
        where to_tsvector('simple', search_text) @@ to_tsquery('simple', 'feijao:*')`,
    );
    await fixture.pg.exec("set enable_seqscan = on");

    expect(plan.rows.map((row) => row["QUERY PLAN"]).join("\n")).toContain(
      "foods_search_text_idx",
    );
  });
});

/**
 * The by-id half (#22), which exists because an import already knows which
 * rows it wants — and answers a different question from search about a row
 * whose numbers were withdrawn.
 */
describe("foodsByIds", () => {
  it("returns the rows that were asked for", async () => {
    expect(descriptions(await foodsByIds(fixture.db, [561, 1]))).toEqual([
      "Arroz, integral, cozido",
      "Feijão, carioca, cozido",
    ]);
  });

  it("leaves out an id that is not a food rather than failing", async () => {
    expect(await foodsByIds(fixture.db, [99_999])).toEqual([]);
    expect(await foodsByIds(fixture.db, [])).toEqual([]);
  });

  it("answers for a food search would not offer", async () => {
    // 458 is "Leite, de vaca, integral", every macro withdrawn as `*`. Search
    // leaves it out because it cannot be chosen for a plan; here the caller is
    // pointing straight at it, and "no such food" would be a different — and
    // false — answer from "NEPA published no number".
    const [milk] = await foodsByIds(fixture.db, [458]);

    expect(milk?.description).toBe("Leite, de vaca, integral");
    expect(milk?.proteinG).toBeNull();
    expect(descriptions(await search("leite"))).not.toContain(
      "Leite, de vaca, integral",
    );
  });

  it("carries the sentinels, so Tr is still Tr", async () => {
    const [potato] = await foodsByIds(fixture.db, [91]);

    expect(potato?.fatG).toBeNull();
    expect(potato?.sentinels.fatG).toBe("Tr");
  });
});
