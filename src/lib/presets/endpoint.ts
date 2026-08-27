import { NextResponse } from "next/server";

import type { PresetCatalog } from "@/lib/db/presets";

/**
 * `GET /api/presets` without the database attached.
 *
 * The load is a parameter rather than an import, for `src/lib/foods/endpoint.ts`'s
 * reasons: `db()` is `server-only` and cannot be imported into a test, and
 * `src/lib/db` is the only tree allowed to know drizzle exists
 * (eslint.config.mjs). What is left here is what a request turns into, what
 * comes back, and — the part this endpoint exists to keep true — what is not in
 * it.
 *
 * There is nothing to parse. The request has no query, no id, no session and no
 * body: every device asks the same question and gets the same answer. That is
 * not a simplification, it is the design (#114). A route that took `?slug=`
 * would be a route whose access log records which diet somebody chose, and
 * docs/DECISIONS.md § D23 is the published list of what this server learns.
 * Nothing here counts, records or attributes a fetch.
 */

export type PresetCatalogFn = () => Promise<PresetCatalog>;

export interface PresetCatalogBody {
  readonly count: number;
  readonly presets: PresetCatalog["presets"];
  /** The TACO rows the presets name, so the copy solves without asking again. */
  readonly foods: PresetCatalog["foods"];
}

/**
 * The same window food search uses, for the same reason: a shared cache is
 * allowed to hold this because there is nothing personal in it. No cookie is
 * read, no header is inspected, and the whole response is a quotation from a
 * published table plus a skeleton this project wrote.
 *
 * An hour is also the honest ceiling on how wrong it may be. A preset is edited
 * in `src/lib/diet/presets.ts` and re-seeded, and a copy made from a stale one
 * is a plan somebody now owns — so a longer window would be a correction that
 * takes days to reach the people it was made for.
 */
const FOUND = "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400";

/**
 * An empty catalogue gets a minute and no revalidation window.
 *
 * "No presets" is what an unseeded branch says, not what the catalogue says,
 * and `stale-while-revalidate` would keep serving that "no" for a day after
 * `db:seed:diet` ran. That is not hypothetical — it is what happened to the
 * preview deployment over food search (`src/lib/foods/endpoint.ts`), where a
 * wrong "nothing matched" outlived the seed and needed a redeploy to clear.
 */
const EMPTY = "public, max-age=0, s-maxage=60";

export async function presetCatalogResponse(
  load: PresetCatalogFn,
): Promise<NextResponse<PresetCatalogBody>> {
  const { presets, foods } = await load();

  return NextResponse.json(
    { count: presets.length, presets, foods },
    {
      headers: {
        "cache-control": presets.length === 0 ? EMPTY : FOUND,
      },
    },
  );
}
