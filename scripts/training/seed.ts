/**
 * Loads the training reference data into the reference database.
 *
 *   npm run db:seed:training
 *
 * Two files: src/lib/training/catalog.ts, which is the movements, and
 * src/lib/training/splits.ts, which is what to do with them. They are a
 * TypeScript module rather than a data file, so unlike the TACO seed there is
 * nothing to extract first and nothing to verify against a pinned publication:
 * the arrays in those files *are* the publication, and this script is how they
 * reach Postgres.
 *
 * They reach Postgres at all because `training_preset_items.exercise_slug` is a
 * foreign key to `exercises.slug` (src/lib/db/schema/presets.ts). The screens
 * read the bundled arrays — a gym is frequently a basement and a program that
 * needs the network is a program that fails where it is used — so these rows
 * exist to give the shared presets something to point at, not to be fetched.
 *
 * One command and one transaction, not two, because the order matters: a split
 * written before the exercises it names is a foreign key violation, and an
 * ordering a person has to remember is an ordering that will eventually be got
 * wrong against production.
 *
 * Idempotent, keyed on the slug, for the same reason the TACO seed is: this
 * runs once per Neon branch (README § Reference database) and there is no
 * "reset the preview database" step to forget.
 *
 * The connection is the direct one, not the pooler: one transaction, a couple
 * of hundred writes.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { env, exit } from "node:process";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import {
  EXERCISE_CATALOG,
  EXERCISE_CATALOG_CITATION,
} from "../../src/lib/training/catalog.ts";
import {
  SPLIT_CATALOG,
  SPLIT_CATALOG_CITATION,
} from "../../src/lib/training/splits.ts";
import { writeCatalog, writeSplits, type DatasetSource } from "./write.ts";

/** Neon's driver speaks WebSocket for real sessions; Node has no global one. */
neonConfig.webSocketConstructor = ws;

/** The files whose hashes are the two datasets' versions. */
const CATALOG_FILE = new URL(
  "../../src/lib/training/catalog.ts",
  import.meta.url,
);
const SPLITS_FILE = new URL("../../src/lib/training/splits.ts", import.meta.url);

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
      "DATABASE_URL_UNPOOLED points at the connection pooler. The seed runs " +
        "as one transaction; use the direct host (the one without `-pooler`).",
    );
  }
  return url;
}

/** A file's contents as the provenance row records them. */
async function hash(file: URL): Promise<DatasetSource> {
  const source = await readFile(file);

  return {
    sha256: createHash("sha256").update(source).digest("hex"),
    fileBytes: source.byteLength,
  };
}

async function main(): Promise<void> {
  const catalogSource = await hash(CATALOG_FILE);
  const splitsSource = await hash(SPLITS_FILE);

  const pool = new Pool({ connectionString: connectionString() });
  const db = drizzle(pool);

  try {
    await db.transaction(async (tx) => {
      const catalog = await writeCatalog(tx, catalogSource);

      if (catalog.removed.length > 0) {
        console.log(
          `Removed ${catalog.removed.length} exercise(s) no longer in the ` +
            `catalog: ${catalog.removed.join(", ")}`,
        );
      }

      console.log(
        `Seeded ${catalog.rowCount} exercises from ${EXERCISE_CATALOG.dataset} ` +
          `${EXERCISE_CATALOG.edition} ` +
          `(dataset_versions.id = ${catalog.versionId})`,
      );

      const splits = await writeSplits(tx, splitsSource);

      if (splits.removed.length > 0) {
        console.log(
          `Removed ${splits.removed.length} split(s) no longer in the file: ` +
            splits.removed.join(", "),
        );
      }

      console.log(
        `Seeded ${splits.presetCount} splits, ${splits.dayCount} days and ` +
          `${splits.itemCount} items from ${SPLIT_CATALOG.dataset} ` +
          `${SPLIT_CATALOG.edition} ` +
          `(dataset_versions.id = ${splits.versionId})`,
      );
    });
  } finally {
    await pool.end();
  }

  console.log(
    `\nFontes:\n${EXERCISE_CATALOG_CITATION}\n${SPLIT_CATALOG_CITATION}`,
  );
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exit(1);
}
