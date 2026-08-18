import { NextResponse } from "next/server";

import type { FoodSearchResult } from "@/lib/db/foods";

import { parseFoodQuery, parseLimit, type FoodQuery } from "./query";

/**
 * `GET /api/foods` without the database attached.
 *
 * The search itself is a parameter rather than an import, for two reasons that
 * point the same way: `db()` is `server-only` and cannot be imported into a
 * test, and `src/lib/db` is the only tree allowed to know drizzle exists
 * (eslint.config.mjs). What is left here is the part worth testing on its own —
 * what a request turns into, what comes back, and what may not be in it.
 */

export type FoodSearchFn = (
  query: FoodQuery,
  limit: number,
) => Promise<readonly FoodSearchResult[]>;

export interface FoodSearchBody {
  /**
   * What the server actually searched for: the typed text folded and split into
   * words. Echoed back because it is the honest answer to "why did I get this"
   * — and because it is all the server kept, which is the point of #16.
   */
  readonly query: string;
  readonly count: number;
  readonly foods: readonly FoodSearchResult[];
}

/**
 * Long enough that a phone typing the same word twice does not ask twice,
 * short enough that a re-ingest reaches everyone within the hour.
 *
 * A shared cache is allowed to hold these because there is nothing personal in
 * them: no cookie is read, no header is inspected, and the whole response is a
 * quotation from a published table. The privacy notice says the same in words.
 */
const FOUND = "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400";

/**
 * An empty answer gets a fraction of that, and no revalidation window.
 *
 * "Nothing matched" is the one answer here that changes without the query
 * changing: it is what an unseeded database, a half-finished ingest or a
 * mid-deploy table says, and `stale-while-revalidate` would then keep serving
 * that "no" for a day after the rows arrived. This is not hypothetical — it is
 * exactly what happened to the preview deployment, where `batata` kept coming
 * back empty long after the seed while `batata&limit=20`, a different cache
 * key, answered with ten rows from the same database.
 *
 * A minute is still enough to absorb a burst of the same typo, and a wrong
 * "no" now expires on its own instead of needing a redeploy to clear it.
 */
const NOT_FOUND = "public, max-age=0, s-maxage=60";

export async function foodSearchResponse(
  search: FoodSearchFn,
  params: URLSearchParams,
): Promise<NextResponse<FoodSearchBody>> {
  const query = parseFoodQuery(params.get("q") ?? "");

  // A box with one letter in it is not an error, it is a box being typed into.
  // Answering 200 with nothing keeps the client's job to rendering a list.
  if (!query) {
    return json({ query: "", count: 0, foods: [] });
  }

  const foods = await search(query, parseLimit(params.get("limit")));

  return json({ query: query.terms.join(" "), count: foods.length, foods });
}

function json(body: FoodSearchBody): NextResponse<FoodSearchBody> {
  return NextResponse.json(body, {
    headers: { "cache-control": body.count === 0 ? NOT_FOUND : FOUND },
  });
}
