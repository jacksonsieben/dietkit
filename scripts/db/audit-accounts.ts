/**
 * Checks a Neon branch's `neon_auth` schema against what we say it holds.
 *
 *   node --env-file=.env scripts/db/audit-accounts.ts
 *   node --env-file=.env.preview scripts/db/audit-accounts.ts
 *
 * `src/lib/db/accounts.ts` is the expectation and carries the reasoning; this
 * is the half of the check that needs a real database. Neon Auth is a managed
 * beta whose schema Neon upgrades, so the list can go stale without anybody
 * touching this repository — and a privacy notice (#98) that describes the
 * database as it was is worse than no notice at all.
 *
 * `boundary.test.ts` runs the same comparison in CI against PGlite, where the
 * schema is empty. That catches nothing on its own. This is where it is real,
 * which is why it is a command rather than a test: CI has no branch, and
 * pointing a test suite at a live database is how a test suite starts failing
 * for reasons that have nothing to do with the commit.
 *
 * It reads the catalog and counts rows. It never selects a column value, so
 * running it prints nothing about any person who has an account.
 */

import { env, exit } from "node:process";

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

import { UNUSED_TABLES, compare } from "../../src/lib/db/accounts.ts";

/** Neon's driver speaks WebSocket for real sessions; Node has no global one. */
neonConfig.webSocketConstructor = ws;

function connectionString(): string {
  const url = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL_UNPOOLED is not set. Point it at the branch you want to " +
        "audit — see .env.example.",
    );
  }
  return url;
}

/**
 * The settings that decide what the auth service does, minus the ones that
 * hold credentials. `email_provider` names the sub-processor that sends a
 * password-reset mail, and `trusted_origins` is the list a reset link is
 * allowed to point at — both are answers somebody needs when writing the
 * privacy notice, and neither is otherwise visible outside Neon's console.
 */
interface Config {
  trusted_origins: string[];
  email_provider: { type?: string } | null;
  allow_localhost: boolean;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: connectionString() });
  const problems: string[] = [];

  try {
    const { rows } = await pool.query<{
      table_name: string;
      column_name: string;
    }>(
      `select table_name, column_name
         from information_schema.columns
        where table_schema = 'neon_auth'
        order by table_name, ordinal_position`,
    );

    if (rows.length === 0) {
      throw new Error(
        "This branch has no `neon_auth` schema. Enable Auth on it first " +
          "(Neon Console -> Branch -> Auth), or audit a branch that has it.",
      );
    }

    const present = rows.map((row) => `${row.table_name}.${row.column_name}`);
    const { unexplained, missing } = compare(present);

    console.log(`${present.length} columns in neon_auth.`);

    if (unexplained.length > 0) {
      problems.push(
        `Columns the server has and nobody declared:\n  ` +
          unexplained.join("\n  ") +
          `\n  -> add them to src/lib/db/accounts.ts with a reason, and check ` +
          `whether the privacy notice still describes this database.`,
      );
    }

    if (missing.length > 0) {
      problems.push(
        `Columns declared in src/lib/db/accounts.ts that are not there:\n  ` +
          missing.join("\n  ") +
          `\n  -> remove them, so the list keeps describing a real database.`,
      );
    }

    // The claim in accounts.ts is that the plugin tables Neon provisions are
    // unused. `invitation.email` would be a third party's address, so the
    // claim is worth more as a count than as a sentence.
    for (const table of UNUSED_TABLES) {
      const { rows: counted } = await pool.query<{ count: string }>(
        `select count(*)::text as count from neon_auth."${table}"`,
      );
      const count = Number(counted[0]?.count ?? 0);

      if (count > 0) {
        problems.push(
          `neon_auth.${table} has ${count} row(s) and is documented as unused.`,
        );
      }
    }

    const { rows: config } = await pool.query<Config>(
      `select trusted_origins, email_provider, allow_localhost
         from neon_auth.project_config`,
    );

    for (const row of config) {
      console.log(
        `\nEmail sender: ${row.email_provider?.type ?? "none"}` +
          `\nLocalhost allowed: ${row.allow_localhost}` +
          `\nTrusted origins: ${
            row.trusted_origins.length > 0
              ? row.trusted_origins.join(", ")
              : "none — a password-reset link can only point at localhost"
          }`,
      );
    }
  } finally {
    await pool.end();
  }

  if (problems.length > 0) {
    console.error(`\n${problems.join("\n\n")}`);
    exit(1);
  }

  console.log("\nThe schema is what src/lib/db/accounts.ts says it is.");
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exit(1);
}
