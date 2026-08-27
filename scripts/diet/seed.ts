/**
 * Loads the diet presets into the reference database.
 *
 *   npm run db:seed:diet
 *
 * One file: src/lib/diet/presets.ts, which is the plan's shape — meals, their
 * shares, the choices each one offers and the groups a slot swaps within. Like
 * the splits and unlike TACO it is a TypeScript module rather than an extracted
 * data file: the arrays in it *are* the publication (§ D14 — nothing is fetched
 * at seed time), and this script is how they reach Postgres.
 *
 * They reach Postgres at all because `diet_preset_items.food_id` is a foreign
 * key to `foods.id`. So this seed has a prerequisite the training one does not:
 * `npm run db:seed` must have loaded TACO first, on this same branch. It says
 * so by name rather than letting the key say it by constraint name.
 *
 * Idempotent, keyed on the preset slug, and one transaction: a half-written
 * preset is a meal with no protein in front of a user.
 *
 * The connection is the direct one, not the pooler.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { env, exit } from "node:process";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import {
  DIET_PRESET_CATALOG,
  DIET_PRESET_CATALOG_CITATION,
} from "../../src/lib/diet/presets.ts";
import { TACO_CITATION } from "../../src/lib/attribution.ts";
import { writePresets, type DatasetSource } from "./write.ts";

/** Neon's driver speaks WebSocket for real sessions; Node has no global one. */
neonConfig.webSocketConstructor = ws;

/** The file whose hash is this dataset's version. */
const PRESETS_FILE = new URL("../../src/lib/diet/presets.ts", import.meta.url);

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
  const source = await hash(PRESETS_FILE);

  const pool = new Pool({ connectionString: connectionString() });
  const db = drizzle(pool);

  try {
    await db.transaction(async (tx) => {
      const presets = await writePresets(tx, source);

      if (presets.removed.length > 0) {
        console.log(
          `Removed ${presets.removed.length} preset(s) no longer in the file: ` +
            presets.removed.join(", "),
        );
      }

      console.log(
        `Seeded ${presets.presetCount} diet preset(s), ${presets.mealCount} ` +
          `meals, ${presets.optionCount} options, ${presets.groupCount} ` +
          `groups and ${presets.itemCount} items from ` +
          `${DIET_PRESET_CATALOG.dataset} ${DIET_PRESET_CATALOG.edition} ` +
          `(dataset_versions.id = ${presets.versionId})`,
      );
    });
  } finally {
    await pool.end();
  }

  // TACO is cited beside the presets' own citation, not instead of it: the
  // composition behind every row here is theirs, and a preset that printed only
  // DietKit's name would be taking credit for the table it points at.
  console.log(`\nFontes:\n${DIET_PRESET_CATALOG_CITATION}\n${TACO_CITATION}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exit(1);
}
