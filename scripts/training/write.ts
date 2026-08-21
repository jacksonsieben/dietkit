/**
 * The training reference data, written into a Postgres.
 *
 * Separate from seed.ts so that `seed.test.ts` can run this exact code — the
 * upserts, the conflict targets, the sweeps — against PGlite. seed.ts is a
 * script: importing it runs it. A seed is the one kind of code whose only
 * production run is against the database it would be worst to get wrong, so
 * the write takes its connection as an argument and is tested like anything
 * else, the way scripts/taco keeps parse.ts out of seed.ts.
 *
 * Two writes, in one order: the splits point at exercises by foreign key, so
 * `writeCatalog` runs first or `writeSplits` fails. seed.ts calls them inside a
 * single transaction for that reason (#74).
 */

import {
  getTableColumns,
  inArray,
  notInArray,
  sql,
  type ExtractTablesWithRelations,
} from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT, PgTable } from "drizzle-orm/pg-core";

import {
  datasetVersions,
  exercises,
  trainingPresetDays,
  trainingPresetItems,
  trainingPresets,
} from "../../src/lib/db/schema/index.ts";
import {
  EXERCISE_CATALOG,
  EXERCISE_CATALOG_CITATION,
  catalogRows,
} from "../../src/lib/training/catalog.ts";
import {
  SPLIT_CATALOG,
  SPLIT_CATALOG_CITATION,
  SPLITS,
} from "../../src/lib/training/splits.ts";

/** Comfortably inside Postgres' parameter limit at a handful of columns a row. */
const CHUNK = 100;

/** Any Postgres drizzle can talk to: Neon over a socket, or PGlite in a test. */
type AnyDatabase<TSchema extends Record<string, unknown>> = PgDatabase<
  PgQueryResultHKT,
  TSchema,
  ExtractTablesWithRelations<TSchema>
>;

/** What a `dataset_versions` row needs, in the shape the catalog modules export. */
interface Dataset {
  readonly dataset: string;
  readonly edition: string;
  readonly authoredOn: string;
  readonly url: string;
}

/** The file the rows came from, hashed. */
export interface DatasetSource {
  readonly sha256: string;
  readonly fileBytes: number;
}

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
 * Derived from the table so that a column added later — a pictogram, a cue — is
 * updated on the second run without anyone remembering to extend a list here.
 */
function updateAllExcept(
  table: PgTable,
  key: string,
): Record<string, ReturnType<typeof sql.raw>> {
  return Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([name]) => name !== key)
      .map(([name, column]) => [name, sql.raw(`excluded."${column.name}"`)]),
  );
}

/**
 * The provenance row, upserted.
 *
 * Unique on (dataset, sha256): editing the file writes a new version row, and
 * re-running on an unchanged file updates the one it has.
 */
async function writeVersion<TSchema extends Record<string, unknown>>(
  db: AnyDatabase<TSchema>,
  dataset: Dataset,
  citation: string,
  source: DatasetSource,
  rowCount: number,
): Promise<number> {
  const values = {
    dataset: dataset.dataset,
    edition: dataset.edition,
    sha256: source.sha256,
    fileBytes: source.fileBytes,
    rowCount,
    sourceUrl: dataset.url,
    citation,
    retrievedAt: dataset.authoredOn,
  };

  const [version] = await db
    .insert(datasetVersions)
    .values(values)
    .onConflictDoUpdate({
      target: [datasetVersions.dataset, datasetVersions.sha256],
      set: {
        edition: values.edition,
        fileBytes: values.fileBytes,
        rowCount: values.rowCount,
        sourceUrl: values.sourceUrl,
        citation: values.citation,
        retrievedAt: values.retrievedAt,
        ingestedAt: sql`now()`,
      },
    })
    .returning({ id: datasetVersions.id });

  return version!.id;
}

/** What one run wrote, so the caller can print it and a test can assert it. */
export interface CatalogWrite {
  readonly versionId: number;
  readonly rowCount: number;
  readonly removed: string[];
}

/** src/lib/training/catalog.ts, as rows in `exercises`. */
export async function writeCatalog<TSchema extends Record<string, unknown>>(
  db: AnyDatabase<TSchema>,
  source: DatasetSource,
): Promise<CatalogWrite> {
  const rows = catalogRows();

  const versionId = await writeVersion(
    db,
    EXERCISE_CATALOG,
    EXERCISE_CATALOG_CITATION,
    source,
    rows.length,
  );

  for (const batch of chunk(rows, CHUNK)) {
    await db
      .insert(exercises)
      .values(batch)
      .onConflictDoUpdate({
        target: exercises.slug,
        set: updateAllExcept(exercises, "slug"),
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
    versionId,
    rowCount: rows.length,
    removed: removed.map((exercise) => exercise.slug),
  };
}

export interface SplitWrite {
  readonly versionId: number;
  readonly presetCount: number;
  readonly dayCount: number;
  readonly itemCount: number;
  readonly removed: string[];
}

/**
 * src/lib/training/splits.ts, as the three-table preset tree.
 *
 * The days and items are deleted and rewritten rather than upserted, which is
 * the opposite of what `exercises` does and is deliberate. Their identity is a
 * serial id that exists nowhere else: nothing in the database points at a day,
 * nothing on a device does either — a device stores the preset slug and the
 * day's position, because a device is where personal data lives and it does not
 * get to depend on a server-side key (§ D1). So there is no identity to
 * preserve, and rewriting is both simpler and exact: an item removed from the
 * middle of a day cannot survive as an orphan at position 7.
 *
 * `exercises` is upserted precisely because it *is* pointed at.
 */
export async function writeSplits<TSchema extends Record<string, unknown>>(
  db: AnyDatabase<TSchema>,
  source: DatasetSource,
): Promise<SplitWrite> {
  const slugs = SPLITS.map((split) => split.slug);
  const itemCount = SPLITS.reduce(
    (total, split) =>
      total + split.days.reduce((days, day) => days + day.items.length, 0),
    0,
  );

  const versionId = await writeVersion(
    db,
    SPLIT_CATALOG,
    SPLIT_CATALOG_CITATION,
    source,
    itemCount,
  );

  // A split dropped from the file goes, and takes its days and items with it
  // through the cascade.
  const removed = await db
    .delete(trainingPresets)
    .where(notInArray(trainingPresets.slug, slugs))
    .returning({ slug: trainingPresets.slug });

  await db
    .insert(trainingPresets)
    .values(
      SPLITS.map((split, position) => ({
        slug: split.slug,
        name: split.name,
        description: split.description,
        position,
      })),
    )
    .onConflictDoUpdate({
      target: trainingPresets.slug,
      set: updateAllExcept(trainingPresets, "slug"),
    });

  await db
    .delete(trainingPresetDays)
    .where(inArray(trainingPresetDays.presetSlug, slugs));

  // One statement per split, so the ids come back in a known order: `returning`
  // follows the order of the VALUES list, and that is all the correlation this
  // needs between a day in the file and its row.
  let dayCount = 0;
  for (const split of SPLITS) {
    const days = await db
      .insert(trainingPresetDays)
      .values(
        split.days.map((day, position) => ({
          presetSlug: split.slug,
          position,
          name: day.name,
        })),
      )
      .returning({ id: trainingPresetDays.id });

    dayCount += days.length;

    const items = split.days.flatMap((day, index) =>
      day.items.map((item, position) => ({
        dayId: days[index]!.id,
        position,
        exerciseSlug: item.exercise,
        sets: item.sets,
        repMin: item.reps[0],
        repMax: item.reps[1],
        restSeconds: item.restSeconds,
      })),
    );

    for (const batch of chunk(items, CHUNK)) {
      await db.insert(trainingPresetItems).values(batch);
    }
  }

  return {
    versionId,
    presetCount: SPLITS.length,
    dayCount,
    itemCount,
    removed: removed.map((preset) => preset.slug),
  };
}
