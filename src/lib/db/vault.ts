import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type { IsoTimestamp } from "@/lib/storage/types";
import type { Vault } from "@/lib/sync/vault";
import type {
  StoredVault,
  VaultStore,
  VaultWrite,
} from "@/lib/sync/vault-store";

/**
 * The wrapped key and the record of consent, in SQL (#96).
 *
 * The same `VaultStore` as `src/lib/sync/vault-store.fixture.ts`, written
 * against Postgres instead of a Map, and `./vault.test.ts` runs the one
 * contract over both.
 *
 * Nothing here is readable either. The columns are a salt, an iteration count,
 * two nonces and two ciphertexts — the public half of `src/lib/sync/vault.ts` —
 * plus two dates and the effective date of a page anybody can load. A copy of
 * this table buys an attacker a PBKDF2 attack against 600 000 iterations and
 * the knowledge that an account exists, which is the same thing § D23 already
 * says the server may learn.
 *
 * `accountId` is a parameter, filled by the route from the session, exactly as
 * in `./sync.ts`. There is no field in any request body that names an account.
 */

type Database = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

interface Row {
  version: number | string;
  kdf: string;
  iterations: number | string;
  salt: string;
  passphrase_nonce: string;
  passphrase_ciphertext: string;
  recovery_nonce: string;
  recovery_ciphertext: string;
  notice: string;
  consented_at: string | Date;
}

/** PGlite and neon-http disagree about whether a result *is* its rows. */
function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result)
    ? (result as T[])
    : (result as { rows: T[] }).rows;
}

function toStoredVault(row: Row): StoredVault {
  return {
    vault: {
      // Both drivers hand integers back as numbers over one path and strings
      // over another. `understood()` compares the version, so a "1" that is not
      // 1 would reject a vault that is perfectly fine.
      version: Number(row.version),
      kdf: row.kdf as Vault["kdf"],
      iterations: Number(row.iterations),
      salt: row.salt,
      passphrase: {
        nonce: row.passphrase_nonce,
        ciphertext: row.passphrase_ciphertext,
      },
      recovery: {
        nonce: row.recovery_nonce,
        ciphertext: row.recovery_ciphertext,
      },
    },
    notice: row.notice,
    consentedAt: new Date(row.consented_at).toISOString() as IsoTimestamp,
  };
}

export function createDatabaseVaultStore(
  database: Database,
  accountId: string,
): VaultStore {
  /**
   * The vault and the consent that permits it, or nothing.
   *
   * An inner join: a vault with no consent row is not a state this file can
   * produce — they are written by one statement — and if it somehow existed it
   * would be a vault nobody agreed to, which should read as absent rather than
   * as permission.
   */
  async function read(): Promise<StoredVault | undefined> {
    const result = await database.execute(sql`
      SELECT v.version, v.kdf, v.iterations, v.salt,
             v.passphrase_nonce, v.passphrase_ciphertext,
             v.recovery_nonce, v.recovery_ciphertext,
             c.notice, c.consented_at
        FROM sync.vault v
        JOIN sync.consent c USING (account_id)
       WHERE v.account_id = ${accountId}
    `);

    const found = rowsOf<Row>(result)[0];
    return found ? toStoredVault(found) : undefined;
  }

  return {
    read,

    /**
     * Stores the vault and records the consent, in one statement.
     *
     * One statement because there are no transactions over the HTTP driver
     * (see ./client.ts), and the two halves must not be separable: sealed rows
     * on a server with no record of consent is the state this design exists to
     * make impossible.
     *
     * The salt guard rides on `ON CONFLICT … DO UPDATE … WHERE`. When the
     * predicate is false Postgres updates nothing and returns nothing, the
     * consent branch reads from an empty CTE and does nothing either, and the
     * whole write is a no-op that reports itself as a conflict. That is the
     * behaviour wanted: a second device that generated its own vault must not
     * be able to make every record in the account unreadable.
     *
     * The consent branch has a predicate of its own, so that a passphrase
     * change — which agrees to nothing new — leaves the date it was agreed
     * alone, while a different notice, or a fresh start after a withdrawal,
     * moves it.
     */
    async write(vault: Vault, notice: string): Promise<VaultWrite> {
      const result = await database.execute(sql`
        WITH before AS (
          SELECT 1 FROM sync.vault WHERE account_id = ${accountId}
        ), upserted AS (
          INSERT INTO sync.vault AS v
            (account_id, version, kdf, iterations, salt,
             passphrase_nonce, passphrase_ciphertext,
             recovery_nonce, recovery_ciphertext)
          VALUES
            (${accountId}, ${vault.version}, ${vault.kdf}, ${vault.iterations},
             ${vault.salt}, ${vault.passphrase.nonce},
             ${vault.passphrase.ciphertext}, ${vault.recovery.nonce},
             ${vault.recovery.ciphertext})
          ON CONFLICT (account_id) DO UPDATE
             SET version = excluded.version,
                 kdf = excluded.kdf,
                 iterations = excluded.iterations,
                 passphrase_nonce = excluded.passphrase_nonce,
                 passphrase_ciphertext = excluded.passphrase_ciphertext,
                 recovery_nonce = excluded.recovery_nonce,
                 recovery_ciphertext = excluded.recovery_ciphertext
           WHERE v.salt = excluded.salt
          RETURNING account_id
        ), consented AS (
          INSERT INTO sync.consent AS c (account_id, notice)
          SELECT account_id, ${notice} FROM upserted
          ON CONFLICT (account_id) DO UPDATE
             SET notice = excluded.notice,
                 consented_at = now(),
                 revoked_at = NULL
           WHERE c.notice IS DISTINCT FROM excluded.notice
              OR c.revoked_at IS NOT NULL
          RETURNING account_id
        )
        SELECT (SELECT count(*) FROM upserted) AS wrote,
               (SELECT count(*) FROM before) AS existed
      `);

      const answer = rowsOf<{
        wrote: number | string;
        existed: number | string;
      }>(result)[0];
      const wrote = Number(answer?.wrote ?? 0) > 0;
      const existed = Number(answer?.existed ?? 0) > 0;

      // Read back rather than reconstruct: the stored vault a conflict reports
      // is the *other* device's, and the one a write reports carries the
      // server's own `consented_at`.
      const stored = await read();

      if (!wrote) return { outcome: "conflict", stored: stored! };
      return { outcome: existed ? "replaced" : "created", stored: stored! };
    },

    /**
     * Deletes every sealed row and the vault, and stamps the withdrawal.
     *
     * One statement again, and this is the one where it matters most: a delete
     * that removed the records and left the vault, or removed the vault and
     * left the records, would be an account that cannot be turned back on and
     * cannot be read either.
     */
    async erase(): Promise<{ rows: number }> {
      const result = await database.execute(sql`
        WITH gone AS (
          DELETE FROM sync.rows WHERE account_id = ${accountId} RETURNING 1
        ), dropped AS (
          DELETE FROM sync.vault WHERE account_id = ${accountId} RETURNING 1
        ), revoked AS (
          UPDATE sync.consent
             SET revoked_at = now()
           WHERE account_id = ${accountId}
             AND revoked_at IS NULL
          RETURNING 1
        )
        SELECT (SELECT count(*) FROM gone) AS rows
      `);

      return {
        rows: Number(rowsOf<{ rows: number | string }>(result)[0]?.rows ?? 0),
      };
    },
  };
}
