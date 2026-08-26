import type { IsoTimestamp } from "@/lib/storage/types";

import type { CollectionName } from "./collections";

/**
 * The wire between a device and the server (#95).
 *
 * An interface rather than a `fetch` call, for the same reason `Repository` is
 * an interface: the merge rules are the hard part and they should be testable
 * without a network, a session or a Postgres. `transport.fixture.ts` is the
 * in-memory implementation the tests run against, and `src/app/api/sync/` is
 * the one that talks to Neon. Both have to obey the same three rules stated
 * below, and the fixture is where a violation shows up first.
 *
 * Note what is *not* here: no account id. The server takes that from the
 * session and never from the request body, so a device cannot ask for someone
 * else's rows by typing a different id.
 */

/** A row as the server hands it back. Nothing here is readable by the server. */
export interface ServerRow {
  readonly collection: CollectionName;
  readonly recordId: string;
  readonly ciphertext: string;
  readonly nonce: string;
  /** The server's version of this record. Bumped on every accepted push. */
  readonly rev: number;
  /**
   * When the server stored it — **the cursor, not the merge input**. A device
   * that has been offline a week would win every conflict on this clock purely
   * by arriving last. The clock that decides is inside the ciphertext.
   */
  readonly updatedAt: IsoTimestamp;
  /** A tombstone. The row stays: a row that vanished would be pushed back. */
  readonly deleted: boolean;
}

/** A row as a device offers it. */
export interface PushRow {
  readonly collection: CollectionName;
  readonly recordId: string;
  readonly ciphertext: string;
  readonly nonce: string;
  /**
   * The rev this push believes it is replacing; `0` for a record the device has
   * never seen on the server.
   *
   * This is the whole of the concurrency control. Two devices that both edit
   * rev 4 send `baseRev: 4`; one becomes rev 5 and the other is refused, which
   * is the only moment either of them learns there was a conflict at all.
   */
  readonly baseRev: number;
  readonly deleted: boolean;
}

export interface AcceptedRow {
  readonly collection: CollectionName;
  readonly recordId: string;
  readonly rev: number;
}

/**
 * What a push did.
 *
 * Conflicts come back as whole rows, not as a list of names, so a device can
 * decrypt both sides and decide immediately. Making it ask again would be a
 * second round trip to learn something the server already had in its hand.
 */
export interface PushResult {
  readonly accepted: AcceptedRow[];
  readonly conflicts: ServerRow[];
}

/**
 * Where a pull left off.
 *
 * Keyset, not a bare timestamp. Two rows can share a millisecond, and with only
 * `updatedAt` a page boundary that fell between them would either skip one
 * forever or hand it back forever. Ordering by the full primary key after the
 * clock makes the boundary exact.
 */
export interface Cursor {
  readonly updatedAt: IsoTimestamp;
  readonly collection: CollectionName;
  readonly recordId: string;
}

export interface PullPage {
  readonly rows: ServerRow[];
  /** Feed this back to continue. `null` only when nothing was returned. */
  readonly cursor: Cursor | null;
  readonly more: boolean;
}

export interface SyncTransport {
  /**
   * Offers rows. Must be safe to repeat: a push that is sent twice because the
   * network dropped the answer has to leave the server in the same state as one
   * that was sent once, which `baseRev` already gives us for free.
   */
  push(rows: PushRow[]): Promise<PushResult>;

  /**
   * Everything stored after `cursor`, oldest first.
   *
   * `null` means from the beginning, and the beginning must always be legal:
   * a device that has lost its cursor, or a brand new one, gets the whole
   * account back and converges to the same place as a device that has been
   * following along. That is the property the tests check.
   */
  pull(cursor: Cursor | null, limit?: number): Promise<PullPage>;
}

/** Small enough to be a couple of pages in the tests, large enough to be real. */
export const PULL_LIMIT = 200;

/**
 * How many rows one push may carry.
 *
 * A first sync of a full account is thousands of records. The device sends them
 * in batches of this size rather than in one request that would be slow to
 * answer and expensive to retry after a dropped connection, and the route
 * refuses a larger one — the server does not get to assume the client is ours.
 */
export const PUSH_LIMIT = 100;
