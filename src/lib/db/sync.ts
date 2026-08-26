import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type { IsoTimestamp } from "@/lib/storage/types";
import type { CollectionName } from "@/lib/sync/collections";
import type {
  AcceptedRow,
  Cursor,
  PullPage,
  PushResult,
  PushRow,
  ServerRow,
  SyncTransport,
} from "@/lib/sync/transport";
import { PULL_LIMIT } from "@/lib/sync/transport";

/**
 * The server half of sync, in SQL (#95).
 *
 * This is `src/lib/sync/transport.fixture.ts` written against Postgres, and
 * `./sync.test.ts` runs the same contract over both. The fixture is the readable
 * statement of the rules; this is the one that has to survive two phones pushing
 * the same record at the same instant.
 *
 * Everything it touches is opaque. It stores a nonce and a ciphertext, orders
 * rows by a clock it stamped itself, and compares revision numbers. It never
 * decides which of two edits is newer — that happens on a device, on timestamps
 * sealed inside the blob, because a server that could order two edits by their
 * content would be a server that could read them.
 *
 * `accountId` is a parameter, and the route fills it from the session. It is
 * never read from a request body: the entire boundary between one person's rows
 * and another's is that a device cannot name an account.
 */

type Database = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

/** A row as Postgres hands it back, before the shape the wire wants. */
interface Row {
  collection: string;
  record_id: string;
  ciphertext: string;
  nonce: string;
  rev: number;
  updated_at: string | Date;
  deleted: boolean;
}

/** The columns every read below selects, in one place so they cannot drift. */
const COLUMNS = sql`
  collection, record_id, ciphertext, nonce, rev, updated_at,
  deleted_at IS NOT NULL AS deleted
`;

function toServerRow(row: Row): ServerRow {
  return {
    collection: row.collection as CollectionName,
    recordId: row.record_id,
    ciphertext: row.ciphertext,
    nonce: row.nonce,
    // Postgres hands `rev` back as a number over one driver and a string over
    // another, depending on how the result was decoded. Neither is worth
    // trusting from here.
    rev: Number(row.rev),
    updatedAt: new Date(row.updated_at).toISOString() as IsoTimestamp,
    deleted: row.deleted,
  };
}

/**
 * PGlite and neon-http disagree about whether a result *is* its rows, and the
 * generic `PgDatabase` types `execute` as `unknown` because of it. The shape is
 * settled here, once, rather than at every call site.
 */
function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result)
    ? (result as T[])
    : (result as { rows: T[] }).rows;
}

export function createDatabaseTransport(
  database: Database,
  accountId: string,
): SyncTransport {
  /**
   * Offers one row, and returns the revision it became — or nothing at all.
   *
   * One statement, deliberately. The HTTP driver has no transactions (see
   * ./client.ts), so "read the revision, then write" has to be a single atomic
   * act, or two phones pushing at the same moment would both be told they won.
   *
   * The `UPDATE` covers a record the device has already seen on the server, and
   * the `INSERT` covers one it has not. A device carrying a revision for a row
   * that is no longer there — an account erased under it — matches neither and
   * is refused, which is what stops a stale device from putting a deleted
   * account's records back.
   */
  async function offer(row: PushRow, stamp: Date): Promise<number | undefined> {
    const deletedAt = row.deleted ? stamp : null;

    const result = await database.execute(sql`
      WITH updated AS (
        UPDATE sync.rows
           SET ciphertext = ${row.ciphertext},
               nonce = ${row.nonce},
               rev = ${row.baseRev} + 1,
               deleted_at = ${deletedAt},
               updated_at = ${stamp}
         WHERE account_id = ${accountId}
           AND collection = ${row.collection}
           AND record_id = ${row.recordId}
           AND rev = ${row.baseRev}
         RETURNING rev
      ), inserted AS (
        INSERT INTO sync.rows
          (account_id, collection, record_id, ciphertext, nonce, rev,
           deleted_at, updated_at)
        SELECT ${accountId}, ${row.collection}, ${row.recordId},
               ${row.ciphertext}, ${row.nonce}, 1, ${deletedAt}, ${stamp}
         WHERE ${row.baseRev} = 0
           AND NOT EXISTS (SELECT 1 FROM updated)
        ON CONFLICT (account_id, collection, record_id) DO NOTHING
        RETURNING rev
      )
      SELECT rev FROM updated UNION ALL SELECT rev FROM inserted
    `);

    const rev = rowsOf<{ rev: number }>(result)[0]?.rev;
    return rev === undefined ? undefined : Number(rev);
  }

  async function current(row: PushRow): Promise<ServerRow | undefined> {
    const result = await database.execute(sql`
      SELECT ${COLUMNS}
        FROM sync.rows
       WHERE account_id = ${accountId}
         AND collection = ${row.collection}
         AND record_id = ${row.recordId}
    `);

    const found = rowsOf<Row>(result)[0];
    return found ? toServerRow(found) : undefined;
  }

  return {
    async push(rows: PushRow[]): Promise<PushResult> {
      const accepted: AcceptedRow[] = [];
      const refused: PushRow[] = [];

      // One timestamp for the whole batch, read once rather than per row: a
      // device's writes then land on the cursor together instead of interleaving
      // with another device's. This is what `now()` would have given inside a
      // transaction, and there is no transaction here.
      const stamp = new Date();

      for (const row of rows) {
        const rev = await offer(row, stamp);
        if (rev === undefined) refused.push(row);
        else
          accepted.push({
            collection: row.collection,
            recordId: row.recordId,
            rev,
          });
      }

      // Refusals come back as whole rows so the device can decrypt both sides
      // and settle it in this round trip rather than the next one. A row that
      // was refused and is *gone* yields nothing, which is the honest answer:
      // there is no conflicting record to show.
      const conflicts: ServerRow[] = [];
      for (const row of refused) {
        const found = await current(row);
        if (found) conflicts.push(found);
      }

      return { accepted, conflicts };
    },

    /**
     * Everything stored after the cursor, oldest first.
     *
     * The comparison is over the whole key `(updated_at, collection, record_id)`
     * rather than over the clock alone. Rows written by one push share a
     * timestamp, so a page boundary falling between two of them would, with a
     * clock-only cursor, either skip a record or hand it back forever. Postgres
     * compares row values left to right, which is exactly the order the index
     * on `(account_id, updated_at)` already produces.
     *
     * One row more than asked for is read and dropped, so `more` is an answer
     * rather than a guess.
     */
    async pull(cursor: Cursor | null, limit = PULL_LIMIT): Promise<PullPage> {
      const capped = Math.min(Math.max(limit, 1), PULL_LIMIT);
      const from = cursor ? new Date(cursor.updatedAt) : null;

      const result = await database.execute(sql`
        SELECT ${COLUMNS}
          FROM sync.rows
         WHERE account_id = ${accountId}
           AND (${from}::timestamptz IS NULL
                OR (updated_at, collection, record_id)
                   > (${from}::timestamptz, ${cursor?.collection ?? ""},
                      ${cursor?.recordId ?? ""}))
         ORDER BY updated_at, collection, record_id
         LIMIT ${capped + 1}
      `);

      const found = rowsOf<Row>(result);
      const rows = found.slice(0, capped).map(toServerRow);
      const last = rows.at(-1);

      return {
        rows,
        cursor: last
          ? {
              updatedAt: last.updatedAt,
              collection: last.collection,
              recordId: last.recordId,
            }
          : cursor,
        more: found.length > capped,
      };
    },
  };
}
