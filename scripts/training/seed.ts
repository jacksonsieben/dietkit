/**
 * Loads src/lib/training/catalog.ts into the reference database.
 *
 *   npm run db:seed:exercises
 *
 * The catalog is a TypeScript module rather than a data file, so unlike the
 * TACO seed there is nothing to extract first and nothing to verify against a
 * pinned publication: the array in that file *is* the publication, and this
 * script is how it reaches Postgres.
 *
 * It reaches Postgres at all because `training_preset_items.exercise_slug` is a
 * foreign key to `exercises.slug` (src/lib/db/schema/presets.ts). The screens
 * read the bundled array — a gym is frequently a basement and a catalog that
 * needs the network is a catalog that fails where it is used — so these rows
 * exist to give the shared presets something to point at, not to be fetched.
 *
 * Idempotent, keyed on the slug, for the same reason the TACO seed is: this
 * runs once per Neon branch (README § Reference database) and there is no
 * "reset the preview database" step to forget.
 *
 * The connection is the direct one, not the pooler: one transaction, one
 * hundred-odd writes.
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
import { writeCatalog } from "./write.ts";

/** Neon's driver speaks WebSocket for real sessions; Node has no global one. */
neonConfig.webSocketConstructor = ws;

/** The file whose hash is the catalog's version. */
const CATALOG_FILE = new URL(
  "../../src/lib/training/catalog.ts",
  import.meta.url,
);

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

async function main(): Promise<void> {
  const source = await readFile(CATALOG_FILE);
  const sha256 = createHash("sha256").update(source).digest("hex");

  const pool = new Pool({ connectionString: connectionString() });
  const db = drizzle(pool);

  try {
    await db.transaction(async (tx) => {
      const written = await writeCatalog(tx, {
        sha256,
        fileBytes: source.byteLength,
      });

      if (written.removed.length > 0) {
        console.log(
          `Removed ${written.removed.length} exercise(s) no longer in the ` +
            `catalog: ${written.removed.join(", ")}`,
        );
      }

      console.log(
        `Seeded ${written.rowCount} exercises from ${EXERCISE_CATALOG.dataset} ` +
          `${EXERCISE_CATALOG.edition} ` +
          `(dataset_versions.id = ${written.versionId})`,
      );
    });
  } finally {
    await pool.end();
  }

  console.log(`\nFonte: ${EXERCISE_CATALOG_CITATION}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exit(1);
}
