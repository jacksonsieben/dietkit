/**
 * Loads data/taco-4ed.json into the reference database.
 *
 *   npm run db:seed
 *
 * Idempotent: running it twice leaves the database as running it once did, and
 * running it after a re-extraction updates the rows in place. That matters
 * because this runs against a Neon branch per environment (README § Reference
 * database) and there is no "reset the preview database" step to forget.
 *
 * Idempotent does not mean "delete everything and insert it again" —
 * `foods.id` is TACO's own food number, which the client already stores in
 * `FoodRef.tacoId` (src/lib/storage/types.ts), so a row must keep its identity
 * across ingests. Every write here is an upsert keyed on what the publication
 * itself calls the row.
 *
 * The connection is the direct one, not the pooler: this is one transaction
 * holding six hundred writes, which is what a transaction pooler is not for.
 */

import { readFile } from "node:fs/promises";
import { env, exit } from "node:process";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { getTableColumns, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { TACO_CITATION, TACO_SOURCE } from "../../src/lib/attribution.ts";
import { NUTRIENT_KEYS } from "../../src/lib/db/nutrients.ts";
import {
  datasetVersions,
  foodGroups,
  foods,
} from "../../src/lib/db/schema/index.ts";
import { DATA_FILE, type TacoDataset } from "./dataset.ts";
import type { ParsedFood } from "./parse.ts";

/** Neon's driver speaks WebSocket for real sessions; Node has no global one. */
neonConfig.webSocketConstructor = ws;

/**
 * One statement per hundred foods rather than 597 round trips. 100 rows of 30
 * columns is well inside Postgres' parameter limit and turns the slow part of
 * the seed into six statements.
 */
const CHUNK = 100;

function connectionString(): string {
  const url = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL_UNPOOLED is not set. Copy .env.example to .env and point " +
        "it at a Neon branch — see README § Reference database.",
    );
  }
  if (url.includes("-pooler.")) {
    throw new Error(
      "DATABASE_URL_UNPOOLED points at the connection pooler. The ingest runs " +
        "as one transaction; use the direct host (the one without `-pooler`).",
    );
  }
  return url;
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
 * Listing them by hand is how a nutrient added to the schema quietly stops
 * being updated on the second run; deriving them from the table means adding a
 * column is enough.
 */
function updateAllExcept<TTable extends typeof foods | typeof foodGroups>(
  table: TTable,
  key: keyof TTable["_"]["columns"],
): Record<string, ReturnType<typeof sql.raw>> {
  return Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([name]) => name !== key)
      .map(([name, column]) => [name, sql.raw(`excluded."${column.name}"`)]),
  );
}

function toRow(
  food: ParsedFood,
  datasetVersionId: number,
): typeof foods.$inferInsert {
  return {
    id: food.id,
    groupSlug: food.groupSlug,
    description: food.description,
    searchText: food.searchText,
    // A nutrient missing from `values` is written as an explicit null, not left
    // out: re-seeding has to be able to *clear* a cell that a re-extraction
    // found blank, and an absent key would keep whatever was there before.
    ...Object.fromEntries(
      NUTRIENT_KEYS.map((key) => [key, food.values[key] ?? null]),
    ),
    sentinels: food.sentinels,
    datasetVersionId,
  } as typeof foods.$inferInsert;
}

async function main(): Promise<void> {
  const dataset = JSON.parse(await readFile(DATA_FILE, "utf8")) as TacoDataset;

  // extract.ts pins the publication by hash. This checks the file on disk still
  // claims to come from that publication, before its numbers are written into a
  // table that carries NEPA's citation.
  if (dataset.sha256 !== TACO_SOURCE.sha256) {
    throw new Error(
      `${DATA_FILE} was extracted from ${dataset.sha256}, but the pinned ` +
        `publication is ${TACO_SOURCE.sha256}. Re-run scripts/taco/extract.ts.`,
    );
  }
  if (dataset.foods.length !== TACO_SOURCE.foodCount) {
    throw new Error(
      `${DATA_FILE} holds ${dataset.foods.length} foods; the publication has ` +
        `${TACO_SOURCE.foodCount}`,
    );
  }

  const pool = new Pool({ connectionString: connectionString() });
  const db = drizzle(pool);

  try {
    await db.transaction(async (tx) => {
      // Unique on (dataset, sha256), so re-seeding the same publication reuses
      // its version row rather than appending a near-duplicate.
      const [version] = await tx
        .insert(datasetVersions)
        .values({
          dataset: dataset.dataset,
          edition: dataset.edition,
          sha256: dataset.sha256,
          fileBytes: dataset.fileBytes,
          rowCount: dataset.foods.length,
          sourceUrl: dataset.sourceUrl,
          citation: TACO_CITATION,
          retrievedAt: dataset.retrievedAt,
        })
        .onConflictDoUpdate({
          target: [datasetVersions.dataset, datasetVersions.sha256],
          set: {
            edition: dataset.edition,
            fileBytes: dataset.fileBytes,
            rowCount: dataset.foods.length,
            sourceUrl: dataset.sourceUrl,
            citation: TACO_CITATION,
            retrievedAt: dataset.retrievedAt,
            ingestedAt: sql`now()`,
          },
        })
        .returning({ id: datasetVersions.id });

      const datasetVersionId = version!.id;

      await tx
        .insert(foodGroups)
        .values([...dataset.groups])
        .onConflictDoUpdate({
          target: foodGroups.slug,
          set: updateAllExcept(foodGroups, "slug"),
        });

      for (const batch of chunk(dataset.foods, CHUNK)) {
        await tx
          .insert(foods)
          .values(batch.map((food) => toRow(food, datasetVersionId)))
          .onConflictDoUpdate({
            target: foods.id,
            set: updateAllExcept(foods, "id"),
          });
      }

      // A food number the publication has dropped would otherwise linger,
      // holding whatever used to be printed against it. Every row this ingest
      // wrote carries its version id, so anything that does not is stale. There
      // is no such row in the 4th edition, and no reason to meet the first one
      // in production.
      const stale = await tx
        .delete(foods)
        .where(sql`${foods.datasetVersionId} <> ${datasetVersionId}`)
        .returning({ id: foods.id });
      if (stale.length > 0) {
        console.log(
          `Removed ${stale.length} food(s) not in this extraction: ` +
            stale.map((food) => food.id).join(", "),
        );
      }

      console.log(
        `Seeded ${dataset.foods.length} foods in ${dataset.groups.length} ` +
          `groups from ${dataset.dataset} ${dataset.edition} ` +
          `(dataset_versions.id = ${datasetVersionId})`,
      );
    });
  } finally {
    await pool.end();
  }

  // The licence condition, printed where the person running the ingest sees it.
  console.log(`\nFonte: ${TACO_CITATION}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exit(1);
}
