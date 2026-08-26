import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMemoryTransport } from "@/lib/sync/transport.fixture";
import type { PushRow, SyncTransport } from "@/lib/sync/transport";

import {
  createReferenceDatabase,
  type ReferenceDatabase,
} from "./pglite.fixture";
import { createDatabaseTransport } from "./sync";

/**
 * One contract, two servers (#95).
 *
 * `transport.fixture.ts` is the readable statement of the rules and every merge
 * test in `src/lib/sync/` runs against it. That is only worth anything if the
 * Postgres one behaves identically, so the same suite runs over both — the
 * fixture on its own would otherwise be a very well tested description of a
 * server nobody deploys.
 *
 * The PGlite half is a real Postgres running the checked-in migrations, so what
 * is under test here is the SQL: the `WITH updated … inserted` race, the row
 * comparison the keyset cursor is built on, the `deleted_at IS NOT NULL`
 * projection. None of that can be checked against a mock's opinion of Postgres.
 */

let fixture: ReferenceDatabase;

beforeAll(async () => {
  fixture = await createReferenceDatabase();
}, 60_000);

afterAll(async () => {
  await fixture?.pg.close();
});

function makeRow(overrides: Partial<PushRow> = {}): PushRow {
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

/**
 * Blocks until the wall clock has moved on.
 *
 * The Postgres transport stamps a push with `new Date()`, and two pushes issued
 * back to back can land in the same millisecond — which would make a test about
 * *ordering by the clock* pass or fail on how fast the machine is. The memory
 * transport has its own clock and does not need this.
 */
async function nextInstant(): Promise<void> {
  const started = Date.now();
  while (Date.now() === started) await new Promise(setImmediate);
}

const servers: [string, () => SyncTransport][] = [
  ["memory", () => createMemoryTransport()],
  // A fresh account id per test rather than a fresh database: building one
  // takes seconds, and an account is the isolation boundary anyway — if two
  // tests could see each other's rows through it, that is a bug worth failing.
  ["postgres", () => createDatabaseTransport(fixture.db, randomUUID())],
];

describe.each(servers)("%s transport", (_name, makeTransport) => {
  it("stores a row and hands it back", async () => {
    const server = makeTransport();

    const pushed = await server.push([makeRow()]);
    expect(pushed.accepted).toEqual([
      { collection: "weight", recordId: "rec-1", rev: 1 },
    ]);
    expect(pushed.conflicts).toEqual([]);

    const page = await server.pull(null);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({
      collection: "weight",
      recordId: "rec-1",
      ciphertext: "sealed",
      nonce: "AAAAAAAAAAAAAAAA",
      rev: 1,
      deleted: false,
    });
    expect(page.more).toBe(false);
    expect(page.cursor).toMatchObject({
      collection: "weight",
      recordId: "rec-1",
    });
  });

  it("refuses a write that is replacing a revision that has moved on", async () => {
    const server = makeTransport();
    await server.push([makeRow()]);

    // Two devices both hold rev 1 and both edit. The first push wins.
    const winner = await server.push([
      makeRow({ baseRev: 1, ciphertext: "first" }),
    ]);
    expect(winner.accepted).toEqual([
      { collection: "weight", recordId: "rec-1", rev: 2 },
    ]);

    const loser = await server.push([
      makeRow({ baseRev: 1, ciphertext: "second" }),
    ]);
    expect(loser.accepted).toEqual([]);

    // The whole winning row comes back, not just its name: the loser decrypts
    // both sides and settles it now rather than after another round trip.
    expect(loser.conflicts).toHaveLength(1);
    expect(loser.conflicts[0]).toMatchObject({
      collection: "weight",
      recordId: "rec-1",
      ciphertext: "first",
      rev: 2,
    });

    // Nothing was clobbered by the refusal.
    const page = await server.pull(null);
    expect(page.rows[0]?.ciphertext).toBe("first");
  });

  it("accepts the loser's write once it carries the revision it lost to", async () => {
    const server = makeTransport();
    await server.push([makeRow()]);
    await server.push([makeRow({ baseRev: 1, ciphertext: "first" })]);

    const retry = await server.push([
      makeRow({ baseRev: 2, ciphertext: "second" }),
    ]);
    expect(retry.accepted).toEqual([
      { collection: "weight", recordId: "rec-1", rev: 3 },
    ]);

    const page = await server.pull(null);
    expect(page.rows[0]?.ciphertext).toBe("second");
  });

  it("refuses a push that is sent twice", async () => {
    const server = makeTransport();
    const row = makeRow({ baseRev: 0 });

    await server.push([row]);
    // The device never saw the answer and sent it again. `baseRev` is stale now,
    // so the replay is refused instead of being applied a second time. This is
    // the whole of what makes push safe to repeat.
    const replay = await server.push([row]);

    expect(replay.accepted).toEqual([]);
    expect(replay.conflicts[0]?.rev).toBe(1);
    expect((await server.pull(null)).rows).toHaveLength(1);
  });

  it("refuses a write against a record that is not there, and shows no conflict", async () => {
    const server = makeTransport();

    // A device that kept its journal through an account erasure. There is no
    // conflicting record to show it, and saying so is more honest than either
    // inventing one or quietly letting the row back in.
    const result = await server.push([makeRow({ baseRev: 4 })]);

    expect(result.accepted).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect((await server.pull(null)).rows).toEqual([]);
  });

  it("keeps a deletion as a row", async () => {
    const server = makeTransport();
    await server.push([makeRow()]);
    await server.push([makeRow({ baseRev: 1, deleted: true })]);

    const page = await server.pull(null);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({ recordId: "rec-1", deleted: true });
  });

  it("walks rows that share a timestamp without skipping or repeating one", async () => {
    const server = makeTransport();

    // One push, so every row is stamped with the same clock reading. A cursor
    // made of `updatedAt` alone could not land between two of these.
    const rows = Array.from({ length: 7 }, (_, index) =>
      makeRow({ recordId: `rec-${index}` }),
    );
    await server.push(rows);

    const seen: string[] = [];
    let cursor = null as Awaited<ReturnType<SyncTransport["pull"]>>["cursor"];
    let pages = 0;

    for (;;) {
      const page = await server.pull(cursor, 3);
      seen.push(...page.rows.map((row) => row.recordId));
      cursor = page.cursor;
      pages += 1;
      if (!page.more) break;
      expect(pages).toBeLessThan(10);
    }

    expect(pages).toBe(3);
    expect(seen).toEqual(rows.map((row) => row.recordId).sort());
  });

  it("orders by the clock first, and by the key only within one instant", async () => {
    const server = makeTransport();

    await server.push([makeRow({ recordId: "z-written-first" })]);
    await nextInstant();
    await server.push([makeRow({ recordId: "a-written-second" })]);

    const page = await server.pull(null);
    expect(page.rows.map((row) => row.recordId)).toEqual([
      "z-written-first",
      "a-written-second",
    ]);
  });

  it("says there is nothing new, and keeps the cursor where it was", async () => {
    const server = makeTransport();
    await server.push([makeRow()]);

    const first = await server.pull(null);
    const second = await server.pull(first.cursor);

    expect(second.rows).toEqual([]);
    expect(second.more).toBe(false);
    // Not null. A device that pulled an empty page and stored the answer would
    // otherwise re-read its whole account on the next sync.
    expect(second.cursor).toEqual(first.cursor);
  });
});

describe("postgres transport", () => {
  it("never shows one account another's rows", async () => {
    const mine = createDatabaseTransport(fixture.db, randomUUID());
    const theirs = createDatabaseTransport(fixture.db, randomUUID());

    await mine.push([makeRow({ ciphertext: "mine" })]);
    await theirs.push([makeRow({ ciphertext: "theirs" })]);

    // Same collection, same record id, both stored, neither visible to the
    // other. The account id is the entire boundary, and the route fills it from
    // the session so a device cannot name someone else's.
    expect((await mine.pull(null)).rows[0]?.ciphertext).toBe("mine");
    expect((await theirs.pull(null)).rows[0]?.ciphertext).toBe("theirs");
    expect((await mine.pull(null)).rows).toHaveLength(1);
  });

  it("does not let one account bump another's revision", async () => {
    const mine = createDatabaseTransport(fixture.db, randomUUID());
    const theirs = createDatabaseTransport(fixture.db, randomUUID());

    await mine.push([makeRow(), makeRow({ recordId: "rec-2" })]);

    // Their device has never seen this record, so it offers it as new. That
    // must create their own row rather than replacing mine.
    expect(
      (await theirs.push([makeRow({ ciphertext: "theirs" })])).accepted,
    ).toEqual([{ collection: "weight", recordId: "rec-1", rev: 1 }]);

    // And a device that offers a revision it never held here — the same rev
    // mine happens to be at — is refused rather than served someone else's row.
    // Both halves matter: the write must miss, and the refusal must not hand
    // back the ciphertext it missed.
    const collide = await theirs.push([
      makeRow({ recordId: "rec-2", baseRev: 1, ciphertext: "collide" }),
    ]);
    expect(collide.accepted).toEqual([]);
    expect(collide.conflicts).toEqual([]);

    const stored = await mine.pull(null);
    expect(stored.rows).toHaveLength(2);
    for (const row of stored.rows) {
      expect(row).toMatchObject({ rev: 1, ciphertext: "sealed" });
    }
  });
});
