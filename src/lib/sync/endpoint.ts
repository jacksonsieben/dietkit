import { NextResponse } from "next/server";

import type { IsoTimestamp } from "@/lib/storage/types";

import { COLLECTIONS, type CollectionName } from "./collections";
import type { Cursor, PushRow, SyncTransport } from "./transport";
import { PULL_LIMIT, PUSH_LIMIT } from "./transport";

/**
 * `POST /api/sync` without the database or the session attached (#95).
 *
 * The same split as `src/lib/foods/endpoint.ts`, for the same two reasons: the
 * route's own imports (`db()`, `auth()`) are `server-only` and cannot be pulled
 * into a test, and `src/lib/db` is the only tree allowed to know drizzle exists
 * (eslint.config.mjs). What is left here is the part worth testing — what a
 * request body is allowed to be, and what a malformed one gets back.
 *
 * **There is no account id in any of this.** The route reads it from the
 * session and hands in a transport already bound to it. That is not a
 * convention this file could enforce, so it is the one rule stated in both
 * places: `transport.ts` says it, the route says it, and nothing here parses an
 * account out of a body because there is no field to parse it from.
 */

/**
 * The largest sealed record the server will store.
 *
 * Generous — a diet with every meal filled in is a few tens of kilobytes
 * sealed — and finite, because without a limit one device could spend an
 * account's storage on a single row. A record that somehow exceeded it would be
 * a device that could never finish syncing, so the number is deliberately far
 * above anything the app produces rather than tight against it.
 */
export const MAX_CIPHERTEXT = 256 * 1024;

/** Long enough for a UUID and a singleton key, short enough to bound a key. */
const MAX_RECORD_ID = 200;

/** base64url of 12 bytes is 16 characters; the slack is for a future scheme. */
const MAX_NONCE = 64;

export type SyncRequest =
  | { readonly action: "push"; readonly rows: PushRow[] }
  | {
      readonly action: "pull";
      readonly cursor: Cursor | null;
      readonly limit: number;
    };

/** A parse failure, carrying the sentence that goes back to the device. */
export interface SyncRequestError {
  readonly error: string;
}

export function isSyncRequestError(
  value: SyncRequest | SyncRequestError,
): value is SyncRequestError {
  return "error" in value;
}

function isCollection(value: unknown): value is CollectionName {
  return (COLLECTIONS as readonly string[]).includes(value as string);
}

function isText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function parseRow(value: unknown): PushRow | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const row = value as Record<string, unknown>;

  if (!isCollection(row.collection)) return undefined;
  if (!isText(row.recordId, MAX_RECORD_ID)) return undefined;
  if (!isText(row.ciphertext, MAX_CIPHERTEXT)) return undefined;
  if (!isText(row.nonce, MAX_NONCE)) return undefined;
  if (typeof row.deleted !== "boolean") return undefined;
  if (!Number.isInteger(row.baseRev) || (row.baseRev as number) < 0) {
    return undefined;
  }

  return {
    collection: row.collection,
    recordId: row.recordId,
    ciphertext: row.ciphertext,
    nonce: row.nonce,
    baseRev: row.baseRev as number,
    deleted: row.deleted,
  };
}

function parseCursor(value: unknown): Cursor | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return undefined;
  const cursor = value as Record<string, unknown>;

  if (!isCollection(cursor.collection)) return undefined;
  if (!isText(cursor.recordId, MAX_RECORD_ID)) return undefined;
  if (typeof cursor.updatedAt !== "string") return undefined;
  if (Number.isNaN(Date.parse(cursor.updatedAt))) return undefined;

  return {
    updatedAt: cursor.updatedAt as IsoTimestamp,
    collection: cursor.collection,
    recordId: cursor.recordId,
  };
}

/**
 * Turns a body into a request, or into the reason it is not one.
 *
 * Strict about shape and silent about content. Every field it checks is
 * bookkeeping — a collection name, a revision number, a length — because those
 * are the only fields it *can* check: the record itself is a ciphertext, and a
 * server that could validate that would be a server that could read it.
 */
export function parseSyncRequest(
  body: unknown,
): SyncRequest | SyncRequestError {
  if (typeof body !== "object" || body === null) {
    return { error: "Expected a JSON object." };
  }

  const request = body as Record<string, unknown>;

  if (request.action === "push") {
    if (!Array.isArray(request.rows)) return { error: "Expected `rows`." };
    if (request.rows.length > PUSH_LIMIT) {
      return { error: `At most ${PUSH_LIMIT} rows per push.` };
    }

    const rows: PushRow[] = [];
    for (const candidate of request.rows) {
      const row = parseRow(candidate);
      if (!row) return { error: "A row is malformed." };
      rows.push(row);
    }

    return { action: "push", rows };
  }

  if (request.action === "pull") {
    const cursor = parseCursor(request.cursor);
    if (cursor === undefined) return { error: "The cursor is malformed." };

    const limit = request.limit ?? PULL_LIMIT;
    if (!Number.isInteger(limit) || (limit as number) < 1) {
      return { error: "The limit must be a positive integer." };
    }

    return {
      action: "pull",
      cursor,
      limit: Math.min(limit as number, PULL_LIMIT),
    };
  }

  return { error: 'Expected `action` to be "push" or "pull".' };
}

/**
 * `no-store`, always.
 *
 * There is nothing legible in these responses, but they are still one person's
 * rows and a cache keyed on a URL alone would be a way to hand them to the next
 * request. Said here rather than trusted to a default.
 */
const headers = { "cache-control": "no-store" } as const;

export function syncError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers });
}

/** Runs a parsed request against a transport already bound to an account. */
export async function syncResponse(
  transport: SyncTransport,
  body: unknown,
): Promise<NextResponse> {
  const request = parseSyncRequest(body);
  if (isSyncRequestError(request)) return syncError(request.error, 400);

  if (request.action === "push") {
    return NextResponse.json(await transport.push(request.rows), { headers });
  }

  return NextResponse.json(
    await transport.pull(request.cursor, request.limit),
    { headers },
  );
}
