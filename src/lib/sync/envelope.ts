import { SNAPSHOT_SCHEMA_VERSION } from "@/lib/storage/types";
import type { IsoTimestamp } from "@/lib/storage/types";

import type { CollectionName } from "./collections";
import { open, seal } from "./sealed";
import type { Sealed } from "./sealed";

/**
 * What actually goes inside the ciphertext (#95).
 *
 * The server row has nine columns and every one of them is metadata: which
 * account, which collection, which record, when the *server* saw it. None of
 * that is the merge input. The merge input is in here, where the server cannot
 * read it — which is the whole point, and also the reason this file exists
 * instead of a few more columns.
 */
export interface Envelope {
  /** The record itself, or `null` for a tombstone. */
  readonly record: unknown;
  /** When the device wrote it. The first half of last-writer-wins. */
  readonly updatedAt: IsoTimestamp;
  /** Which device wrote it. The tiebreak, and the echo filter. */
  readonly deviceId: string;
  /**
   * The `Snapshot` version the record was written against.
   *
   * Not decoration. Two devices on two app versions is the normal state of an
   * app that updates itself, and without this an old build would open a record
   * shaped for a newer schema, fail to find a field it needs, and write the
   * damage back. `openEnvelope` refuses anything newer than it understands, so
   * the old device leaves that record alone until it updates.
   */
  readonly schemaVersion: number;
}

/**
 * Binds the ciphertext to the row it is stored in.
 *
 * Passed to GCM as additional authenticated data, so a server that moved a blob
 * from one record to another — or from one collection to another — produces a
 * `WrongKeyError` rather than a weight entry appearing as a training session.
 * The account id is deliberately not in here: the same account is the only
 * thing that can hold the key, and including it would break every row the day
 * an account is ever migrated.
 */
export function context(collection: CollectionName, recordId: string): string {
  return `dietkit/v1/sync ${collection}:${recordId}`;
}

export async function sealEnvelope(
  key: CryptoKey,
  collection: CollectionName,
  recordId: string,
  envelope: Omit<Envelope, "schemaVersion">,
): Promise<Sealed> {
  const complete: Envelope = {
    ...envelope,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
  };

  return seal(key, JSON.stringify(complete), context(collection, recordId));
}

/**
 * Opens one row, or returns `undefined` for a row this build must not touch.
 *
 * `undefined` rather than a throw for the one recoverable case — a record from
 * a newer schema — because a pull that hit one of those should skip that record
 * and keep going, not abandon the sync. Everything else still throws
 * `WrongKeyError`, because a row that will not open with the right key is not a
 * record this device should be quietly ignoring.
 */
export async function openEnvelope(
  key: CryptoKey,
  collection: CollectionName,
  recordId: string,
  sealed: Sealed,
): Promise<Envelope | undefined> {
  const envelope = JSON.parse(
    await open(key, sealed, context(collection, recordId)),
  ) as Envelope;

  return envelope.schemaVersion > SNAPSHOT_SCHEMA_VERSION
    ? undefined
    : envelope;
}

/**
 * Last write wins, and a coin flip that lands the same way on both devices.
 *
 * The timestamp comes first because it is what a person would say happened
 * last. `deviceId` breaks the tie, and it is a string compare rather than
 * anything cleverer for one reason: both devices must reach the *same* answer
 * without talking to each other, or they push each other's records back and
 * forth forever. A random tiebreak, or "whoever asked", would do exactly that.
 *
 * An incumbent that is missing (nothing local yet) loses to anything.
 */
export function wins(
  candidate: Pick<Envelope, "updatedAt" | "deviceId">,
  incumbent: Pick<Envelope, "updatedAt" | "deviceId"> | undefined,
): boolean {
  if (!incumbent) return true;
  if (candidate.updatedAt !== incumbent.updatedAt) {
    return candidate.updatedAt > incumbent.updatedAt;
  }
  return candidate.deviceId > incumbent.deviceId;
}
