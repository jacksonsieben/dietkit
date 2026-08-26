import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

/**
 * Everything this server holds about one account, deleted (#97).
 *
 * The neighbouring `./vault.ts` already has an `erase()`, and the difference
 * between the two is the whole point of the issue. That one is *withdrawing
 * consent*: the sealed rows and the wrapped key go, the consent record stays
 * with `revoked_at` stamped on it, and the account keeps existing. This one is
 * *deleting the account*: the consent record goes too, because there is no
 * longer anybody for it to be evidence about, and the identity in `neon_auth`
 * follows — that half belongs to Neon Auth and is done by the caller in
 * `src/lib/auth/actions.ts`.
 *
 * GDPR art. 7(3) is why they are two buttons and not one: withdrawing consent
 * has to be as easy as giving it, and it must not cost somebody their account.
 *
 * There is no cascade to lean on. `src/lib/db/schema/sync.ts` explains why
 * there is no foreign key to `neon_auth.user` — Neon owns that schema and our
 * migrations never create it — so every table that carries an `account_id` has
 * to be named here, by hand. `./erasure.test.ts` is the guard: it sweeps a
 * migrated database for the id afterwards and fails if any column anywhere
 * still carries it, so a table added later without a line in this statement is
 * a failing test rather than a row nobody can reach.
 *
 * One statement, because the HTTP driver has no transactions (see ./client.ts)
 * and a partial deletion is the worst outcome available: rows without a vault
 * are unreadable forever, and a vault without a consent record is a key held
 * for something nobody agreed to.
 */

type Database = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

/** What was actually deleted, so the screen can say a number. */
export interface Erasure {
  /** Sealed records. */
  readonly rows: number;
  /** The wrapped key: 1 if sync was ever on, 0 if it never was. */
  readonly vaults: number;
  /** The consent record: 1 if sync was ever on. */
  readonly consents: number;
}

function count(result: unknown, field: string): number {
  const rows = Array.isArray(result)
    ? (result as Record<string, unknown>[])
    : (result as { rows: Record<string, unknown>[] }).rows;

  return Number(rows[0]?.[field] ?? 0);
}

/**
 * Deletes the account's sealed rows, its wrapped key, and its consent record.
 *
 * Safe to run for an account that never turned sync on: every branch simply
 * deletes nothing and reports zero. That matters, because the delete screen
 * cannot know whether sync was ever enabled without asking a question it has
 * no reason to ask.
 */
export async function eraseAccount(
  database: Database,
  accountId: string,
): Promise<Erasure> {
  const result = await database.execute(sql`
    WITH gone AS (
      DELETE FROM sync.rows WHERE account_id = ${accountId} RETURNING 1
    ), dropped AS (
      DELETE FROM sync.vault WHERE account_id = ${accountId} RETURNING 1
    ), withdrawn AS (
      DELETE FROM sync.consent WHERE account_id = ${accountId} RETURNING 1
    )
    SELECT (SELECT count(*) FROM gone) AS rows,
           (SELECT count(*) FROM dropped) AS vaults,
           (SELECT count(*) FROM withdrawn) AS consents
  `);

  return {
    rows: count(result, "rows"),
    vaults: count(result, "vaults"),
    consents: count(result, "consents"),
  };
}
