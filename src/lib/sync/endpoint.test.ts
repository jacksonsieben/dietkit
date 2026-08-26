import { describe, expect, it } from "vitest";

import {
  MAX_CIPHERTEXT,
  isSyncRequestError,
  parseSyncRequest,
  syncResponse,
} from "./endpoint";
import { createMemoryTransport } from "./transport.fixture";
import { PULL_LIMIT, PUSH_LIMIT } from "./transport";

/**
 * The request-to-response half of `POST /api/sync` (#95).
 *
 * The store is a memory transport here on purpose: what the SQL does is settled
 * in src/lib/db/sync.test.ts against a real Postgres, and what is left is the
 * part a database cannot tell you about — what a body is allowed to be, and
 * what a device gets back when it is not.
 *
 * Read as a whole, this file is also the answer to "what could a signed-in
 * device ask for that it should not get". The answer is nothing about anybody
 * else, because there is no field in any of these shapes that names an account.
 */

function row(overrides: Record<string, unknown> = {}) {
  return {
    collection: "weight",
    recordId: "rec-1",
    ciphertext: "sealed",
    nonce: "AAAAAAAAAAAAAAAA",
    baseRev: 0,
    deleted: false,
    ...overrides,
  };
}

function errorOf(body: unknown): string | undefined {
  const parsed = parseSyncRequest(body);
  return isSyncRequestError(parsed) ? parsed.error : undefined;
}

describe("parsing a sync request", () => {
  it("takes a push", () => {
    const parsed = parseSyncRequest({ action: "push", rows: [row()] });

    expect(isSyncRequestError(parsed)).toBe(false);
    expect(parsed).toEqual({ action: "push", rows: [row()] });
  });

  it("takes a pull from the beginning", () => {
    expect(parseSyncRequest({ action: "pull", cursor: null })).toEqual({
      action: "pull",
      cursor: null,
      limit: PULL_LIMIT,
    });
  });

  it("caps the page size a device may ask for", () => {
    // Not an error, because there is nothing wrong with wanting more — the
    // device is simply told less, and its cursor loop asks again.
    expect(
      parseSyncRequest({ action: "pull", cursor: null, limit: 10_000 }),
    ).toMatchObject({ limit: PULL_LIMIT });
  });

  it("refuses a body that is not a request", () => {
    expect(errorOf(null)).toBeDefined();
    expect(errorOf("push")).toBeDefined();
    expect(errorOf({})).toBeDefined();
    expect(errorOf({ action: "delete" })).toBeDefined();
  });

  it("refuses a collection nobody declared", () => {
    // The collection name is the one field on this path that is *not* opaque,
    // and it is the field an attacker would use to write rows that no client
    // will ever read back and no delete will ever find.
    expect(
      errorOf({ action: "push", rows: [row({ collection: "audit" })] }),
    ).toBe("A row is malformed.");
  });

  it("refuses a row with a revision that is not a revision", () => {
    for (const baseRev of [-1, 1.5, "1", null, undefined]) {
      expect(errorOf({ action: "push", rows: [row({ baseRev })] })).toBe(
        "A row is malformed.",
      );
    }
  });

  it("refuses a row with nothing sealed in it", () => {
    expect(errorOf({ action: "push", rows: [row({ ciphertext: "" })] })).toBe(
      "A row is malformed.",
    );
    expect(errorOf({ action: "push", rows: [row({ nonce: "" })] })).toBe(
      "A row is malformed.",
    );
  });

  it("refuses a record larger than the cap", () => {
    const oversized = "x".repeat(MAX_CIPHERTEXT + 1);

    expect(
      errorOf({ action: "push", rows: [row({ ciphertext: oversized })] }),
    ).toBe("A row is malformed.");
    expect(
      errorOf({
        action: "push",
        rows: [row({ ciphertext: "x".repeat(MAX_CIPHERTEXT) })],
      }),
    ).toBeUndefined();
  });

  it("refuses more rows than one request may carry", () => {
    const rows = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        row({ recordId: `rec-${index}` }),
      );

    expect(errorOf({ action: "push", rows: rows(PUSH_LIMIT) })).toBeUndefined();
    expect(errorOf({ action: "push", rows: rows(PUSH_LIMIT + 1) })).toBe(
      `At most ${PUSH_LIMIT} rows per push.`,
    );
  });

  it("refuses a cursor that is not one", () => {
    const cursor = {
      updatedAt: "2026-04-01T00:00:01.000Z",
      collection: "weight",
      recordId: "rec-1",
    };

    expect(parseSyncRequest({ action: "pull", cursor })).toMatchObject({
      cursor,
    });
    expect(
      errorOf({ action: "pull", cursor: { ...cursor, updatedAt: "soon" } }),
    ).toBe("The cursor is malformed.");
    expect(
      errorOf({ action: "pull", cursor: { ...cursor, collection: "audit" } }),
    ).toBe("The cursor is malformed.");
  });
});

describe("answering a sync request", () => {
  it("stores a push and reads it back", async () => {
    const transport = createMemoryTransport();

    const pushed = await syncResponse(transport, {
      action: "push",
      rows: [row()],
    });
    expect(pushed.status).toBe(200);
    await expect(pushed.json()).resolves.toEqual({
      accepted: [{ collection: "weight", recordId: "rec-1", rev: 1 }],
      conflicts: [],
    });

    const pulled = await syncResponse(transport, {
      action: "pull",
      cursor: null,
    });
    const page = (await pulled.json()) as { rows: unknown[] };
    expect(page.rows).toHaveLength(1);
  });

  it("answers a malformed body with 400 and nothing else", async () => {
    const response = await syncResponse(createMemoryTransport(), {
      action: "push",
      rows: [row({ collection: "audit" })],
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "A row is malformed.",
    });
  });

  it("is never cached", async () => {
    // Nothing in a sync response is legible, but it is still one person's rows,
    // and a shared cache keyed on the URL alone would hand them to whoever
    // asked next — the URL is the same for everybody.
    const response = await syncResponse(createMemoryTransport(), {
      action: "pull",
      cursor: null,
    });

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
