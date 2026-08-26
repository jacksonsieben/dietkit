import type { IsoTimestamp } from "@/lib/storage/types";

import type {
  AcceptedRow,
  Cursor,
  PullPage,
  PushResult,
  PushRow,
  ServerRow,
  SyncTransport,
} from "./transport";
import { PULL_LIMIT } from "./transport";

/**
 * The server, in memory (#95).
 *
 * Not test scaffolding that happens to be checked in — this is the executable
 * statement of what `src/app/api/sync/` is allowed to do. Every rule the real
 * route implements in SQL is implemented here in ten lines, so a merge test
 * fails in a readable place instead of inside a Postgres plan, and so the two
 * can be compared by reading them side by side.
 *
 * Two devices in a test share one of these. That is exactly the relationship
 * two phones have with Neon.
 */

interface MemoryTransportOptions {
  /**
   * The store clock. One timestamp per `push` by default, which is what a
   * Postgres `default now()` does inside a transaction — and which means rows
   * written together share a millisecond, so the keyset cursor is under real
   * pressure in the tests rather than the easy case.
   */
  clock?: () => IsoTimestamp;
  /**
   * Caps whatever page size a caller asks for.
   *
   * The real server has a limit too, and a sync that only ever saw one page
   * would leave the cursor loop untested. Setting this to three makes an
   * ordinary twelve-record account paginate.
   */
  pageLimit?: number;
}

export interface MemoryTransport extends SyncTransport {
  /** Everything the server holds. Used to assert it holds nothing legible. */
  rows(): ServerRow[];
  /**
   * Deletes every row, and says how many there were.
   *
   * Not part of `SyncTransport`, because no device does this over the sync
   * wire: turning sync off goes through `vault-store.ts` (#96), which deletes
   * the records and the vault together. This is here so the memory store has
   * something real to delete.
   */
  erase(): number;
}

export function createMemoryTransport(
  options: MemoryTransportOptions = {},
): MemoryTransport {
  const stored = new Map<string, ServerRow>();

  let tick = 0;
  const clock =
    options.clock ??
    (() => new Date(Date.UTC(2026, 0, 1, 0, 0, ++tick)).toISOString());

  return {
    async push(pushed: PushRow[]): Promise<PushResult> {
      const updatedAt = clock();
      const accepted: AcceptedRow[] = [];
      const conflicts: ServerRow[] = [];

      for (const row of pushed) {
        const key = `${row.collection} ${row.recordId}`;
        const current = stored.get(key);

        // The only concurrency rule there is. A push replaying an answer the
        // device never received arrives with a stale `baseRev` and is refused,
        // which is the same outcome as a genuine conflict and the reason a
        // repeated push cannot double-apply.
        if ((current?.rev ?? 0) !== row.baseRev) {
          if (current) conflicts.push(current);
          continue;
        }

        const next: ServerRow = {
          collection: row.collection,
          recordId: row.recordId,
          ciphertext: row.ciphertext,
          nonce: row.nonce,
          rev: row.baseRev + 1,
          updatedAt,
          deleted: row.deleted,
        };

        stored.set(key, next);
        accepted.push({
          collection: next.collection,
          recordId: next.recordId,
          rev: next.rev,
        });
      }

      return { accepted, conflicts };
    },

    async pull(cursor: Cursor | null, limit = PULL_LIMIT): Promise<PullPage> {
      const ordered = [...stored.values()].sort(compare);
      const after = cursor
        ? ordered.filter((row) => compare(row, cursor) > 0)
        : ordered;

      const rows = after.slice(0, Math.min(limit, options.pageLimit ?? limit));
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
        more: after.length > rows.length,
      };
    },

    rows() {
      return [...stored.values()].sort(compare);
    },

    erase() {
      const count = stored.size;
      stored.clear();
      return count;
    },
  };
}

/** The keyset order, in one place so `pull` cannot disagree with itself. */
function compare(a: Cursor, b: Cursor): number {
  return (
    a.updatedAt.localeCompare(b.updatedAt) ||
    a.collection.localeCompare(b.collection) ||
    a.recordId.localeCompare(b.recordId)
  );
}
