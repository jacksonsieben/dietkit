/**
 * The exercise catalog, written into a Postgres.
 *
 * Separate from seed.ts so that `seed.test.ts` can run this exact code — the
 * upsert, the conflict target, the `not in` sweep — against PGlite. seed.ts is
 * a script: importing it runs it. A seed is the one kind of code whose only
 * production run is against the database it would be worst to get wrong, so
 * the write takes its connection as an argument and is tested like anything
 * else, the way scripts/taco keeps parse.ts out of seed.ts.
 */

import {
  getTableColumns,
  notInArray,
  sql,
  type ExtractTablesWithRelations,
} from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { datasetVersions, exercises } from "../../src/lib/db/schema/index.ts";
import {
  EXERCISE_CATALOG,
  EXERCISE_CATALOG_CITATION,
  catalogRows,
} from "../../src/lib/training/catalog.ts";

/** Comfortably inside Postgres' parameter limit at five columns a row. */
const CHUNK = 100;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * `SET col = excluded.col` for every column but the key.
 *
 * Derived from the table so that a column added to `exercises` later — a
 * pictogram, a cue — is updated on the second run without anyone remembering
 * to extend a list here.
 */
function updateAllExceptSlug(): Record<string, ReturnType<typeof sql.raw>> {
  return Object.fromEntries(
    Object.entries(getTableColumns(exercises))
      .filter(([name]) => name !== "slug")
      .map(([name, column]) => [name, sql.raw(`excluded."${column.name}"`)]),
  );
}

/** What one run wrote, so the caller can print it and a test can assert it. */
export interface CatalogWrite {
  readonly versionId: number;
  readonly rowCount: number;
  readonly removed: string[];
}

/** The whole write, against any Postgres drizzle can talk to. */
export async function writeCatalog<TSchema extends Record<string, unknown>>(
  db: PgDatabase<PgQueryResultHKT, TSchema, ExtractTablesWithRelations<TSchema>>,
  source: { sha256: string; fileBytes: number },
): Promise<CatalogWrite> {
  const rows = catalogRows();

  // Unique on (dataset, sha256): editing the catalog writes a new version row,
  // and re-running on an unchanged file updates the one it has.
  const [version] = await db
    .insert(datasetVersions)
    .values({
      dataset: EXERCISE_CATALOG.dataset,
      edition: EXERCISE_CATALOG.edition,
      sha256: source.sha256,
      fileBytes: source.fileBytes,
      rowCount: rows.length,
      sourceUrl: EXERCISE_CATALOG.url,
      citation: EXERCISE_CATALOG_CITATION,
      retrievedAt: EXERCISE_CATALOG.authoredOn,
    })
    .onConflictDoUpdate({
      target: [datasetVersions.dataset, datasetVersions.sha256],
      set: {
        edition: EXERCISE_CATALOG.edition,
        fileBytes: source.fileBytes,
        rowCount: rows.length,
        sourceUrl: EXERCISE_CATALOG.url,
        citation: EXERCISE_CATALOG_CITATION,
        retrievedAt: EXERCISE_CATALOG.authoredOn,
        ingestedAt: sql`now()`,
      },
    })
    .returning({ id: datasetVersions.id });

  for (const batch of chunk(rows, CHUNK)) {
    await db
      .insert(exercises)
      .values(batch)
      .onConflictDoUpdate({
        target: exercises.slug,
        set: updateAllExceptSlug(),
      });
  }

  // A slug dropped from the catalog would otherwise linger in the table and
  // stay selectable through a preset. Deleting it is the honest move, and if a
  // preset still points at it the foreign key aborts the transaction — which is
  // the right failure: the preset is the thing to fix.
  const removed = await db
    .delete(exercises)
    .where(
      notInArray(
        exercises.slug,
        rows.map((row) => row.slug),
      ),
    )
    .returning({ slug: exercises.slug });

  return {
    versionId: version!.id,
    rowCount: rows.length,
    removed: removed.map((exercise) => exercise.slug),
  };
}
