import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "./schema";

/**
 * A real Postgres, running the migrations that are checked in.
 *
 * PGlite is Postgres compiled to WebAssembly, so `drizzle/*.sql` is applied
 * exactly as `db:migrate` will apply it to Neon. That is what makes it possible
 * to test the SQL rather than a mock's opinion of it: `boundary.test.ts` asks
 * the resulting catalog what exists, and `foods.test.ts` runs the search query
 * itself — the `@@`, the sentinel filter, the ordering, the index expression.
 *
 * Not shipped code. It imports a devDependency and is reached only from tests;
 * it lives here rather than in a test file because two of them need it, and a
 * second copy of "apply the migrations" is a second thing to keep in step.
 */

const migrationsDir = path.resolve(import.meta.dirname, "../../../drizzle");

/** Every checked-in migration, in the order `db:migrate` would apply them. */
export function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

export async function applyMigrations(pg: PGlite): Promise<void> {
  for (const file of migrationFiles()) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    // drizzle-kit writes these markers so its own runner can split a file into
    // statements; `exec` takes the whole script, so they are just noise here.
    await pg.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
}

export interface ReferenceDatabase {
  /** For SQL a test wants to write literally — inserts, catalog queries. */
  readonly pg: PGlite;
  /** The same database as the app sees it. */
  readonly db: ReturnType<typeof drizzle<typeof schema>>;
}

export async function createReferenceDatabase(): Promise<ReferenceDatabase> {
  const pg = await PGlite.create();
  await applyMigrations(pg);

  return { pg, db: drizzle({ client: pg, schema }) };
}
