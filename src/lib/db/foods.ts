import { and, asc, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type { FoodQuery } from "@/lib/foods/query";

import type { NutrientKey, NutrientSentinels } from "./nutrients";
import { foodGroups, foods } from "./schema";

/**
 * The one query behind food search (#16).
 *
 * Takes the database as an argument rather than importing `db()`, which is
 * `server-only`: the route hands it Neon, and search.test.ts hands it a real
 * Postgres running the checked-in migrations. That is what makes it possible to
 * test the SQL itself — the `@@`, the sentinel filter and the ordering — rather
 * than a mock's opinion of it. It lives here rather than beside the rest of #16
 * because this is the only tree allowed to import drizzle (eslint.config.mjs).
 *
 * Reference data only. Nothing here reads a header, a cookie or a body, and the
 * only input is a word out of a search box.
 */

/** What comes back with each food, per 100 g of edible portion, as TACO prints it. */
export const SEARCH_MACROS = [
  "energyKcal",
  "proteinG",
  "carbG",
  "fatG",
  "fiberG",
] as const satisfies readonly NutrientKey[];

/**
 * The four a plan is built from. Fibre is reported but not required: a food
 * whose fibre TACO never measured is still a food you can eat a hundred grams
 * of, and dropping it would cost the list most of its meats.
 */
const REQUIRED_MACROS = ["energyKcal", "proteinG", "carbG", "fatG"] as const;

export interface FoodSearchResult {
  readonly id: number;
  readonly description: string;
  readonly groupSlug: string;
  readonly groupName: string;
  readonly energyKcal: number | null;
  readonly proteinG: number | null;
  readonly carbG: number | null;
  readonly fatG: number | null;
  readonly fiberG: number | null;
  /**
   * Only the macro cells, not all 26. The shape is `NutrientCarrier`'s, so the
   * client reads a result with `readCell` exactly as it would read a row — and
   * still prints "Tr" where TACO printed "Tr".
   */
  readonly sentinels: NutrientSentinels;
}

type Database = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

/**
 * Whether a macro cell is usable, which is not the same as "is not null".
 *
 * `NA` and `Tr` are stored as NULL plus a sentinel (src/lib/db/nutrients.ts),
 * and both are honest zeroes: 44 of TACO's 597 foods carry one on a macro, and
 * they include boiled potato and raw pumpkin. A plain `IS NOT NULL` filter
 * would hide those from search — 44 foods, silently, with nothing on screen to
 * suggest they exist.
 *
 * What must be excluded is the fourth state: a cell NEPA withdrew (`*`) or
 * never printed. There the number is missing rather than small, and a food
 * offered with a hole in its macros is one the solver would balance a plan on.
 * Five foods are dropped by this, "Leite, de vaca, integral" among them.
 */
function measured(key: (typeof REQUIRED_MACROS)[number]) {
  return or(
    isNotNull(foods[key]),
    // `::text` because `->>` is defined for both a key and an array index, and
    // an untyped parameter leaves Postgres unable to tell which was meant.
    sql`${foods.sentinels} ->> ${key}::text in ('NA', 'Tr')`,
  );
}

export async function searchFoods(
  database: Database,
  query: FoodQuery,
  limit: number,
): Promise<FoodSearchResult[]> {
  /**
   * The folded column against the folded query — which is the whole of the
   * accent-insensitivity, with no `unaccent` extension involved. `'simple'`
   * matches the index in schema/foods.ts; a different configuration here would
   * not be a slower query, it would be a query that cannot use the index at all.
   */
  const matches = sql`to_tsvector('simple', ${foods.searchText}) @@ to_tsquery('simple', ${query.tsquery})`;

  /**
   * A food whose *name* begins with what was typed, before one that merely
   * contains it: "feijao" should offer "Feijão, carioca, cozido" above "Baião
   * de dois, arroz e feijão-de-corda", and `ts_rank` over descriptions of four
   * words is noise dressed up as relevance. Alphabetical underneath, because
   * the alternative — whatever order Postgres returns rows in — changes between
   * two identical searches and makes the list impossible to scan.
   */
  const startsWithTyped = sql<boolean>`starts_with(${foods.searchText}, ${query.terms[0]})`;

  const rows = await database
    .select({
      id: foods.id,
      description: foods.description,
      groupSlug: foods.groupSlug,
      groupName: foodGroups.name,
      energyKcal: foods.energyKcal,
      proteinG: foods.proteinG,
      carbG: foods.carbG,
      fatG: foods.fatG,
      fiberG: foods.fiberG,
      sentinels: foods.sentinels,
    })
    .from(foods)
    .innerJoin(foodGroups, eq(foods.groupSlug, foodGroups.slug))
    .where(and(matches, ...REQUIRED_MACROS.map(measured)))
    .orderBy(desc(startsWithTyped), asc(foods.description))
    .limit(limit);

  return rows.map((row) => ({ ...row, sentinels: macroSentinels(row.sentinels) }));
}

/** The stored map, narrowed to the cells that come back with the food. */
function macroSentinels(sentinels: NutrientSentinels): NutrientSentinels {
  const macros: NutrientSentinels = {};
  for (const key of SEARCH_MACROS) {
    const sentinel = sentinels[key];
    if (sentinel !== undefined) macros[key] = sentinel;
  }
  return macros;
}
