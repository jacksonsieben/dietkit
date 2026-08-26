import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createMemoryTransport } from "@/lib/sync/transport.fixture";
import { createMemoryVaultStore } from "@/lib/sync/vault-store.fixture";
import { createVault, openWithPassphrase } from "@/lib/sync/vault";
import type { SyncTransport } from "@/lib/sync/transport";
import type { VaultStore } from "@/lib/sync/vault-store";
import type { Vault } from "@/lib/sync/vault";

import {
  createReferenceDatabase,
  type ReferenceDatabase,
} from "./pglite.fixture";
import { createDatabaseTransport } from "./sync";
import { createDatabaseVaultStore } from "./vault";

/**
 * One contract, two servers — the vault half (#96).
 *
 * The same arrangement as `./sync.test.ts` and for the same reason: the memory
 * store is the readable statement of the rules, and it is only worth something
 * if Postgres agrees. What is under test here is mostly SQL that has no
 * equivalent in the fixture — an `ON CONFLICT … WHERE` that decides whether a
 * vault may be written over, and a delete of three things in one statement
 * because there are no transactions on this driver.
 *
 * Two of these rules are load-bearing beyond the usual sense of the word:
 * a wrong answer to "may this vault replace that one" makes every record in an
 * account permanently unreadable, and a wrong answer to "did erase delete the
 * rows" leaves sealed personal data on a server the person told to forget it.
 */

let fixture: ReferenceDatabase;

beforeAll(async () => {
  fixture = await createReferenceDatabase();
}, 60_000);

afterAll(async () => {
  await fixture?.pg.close();
});

const NOTICE = "2026-08-18";

/**
 * A vault-shaped object. The blobs are not real ciphertext, because none of
 * these rules involve opening anything — except the one test that does, which
 * uses `createVault` for exactly that reason.
 */
function makeVault(overrides: Partial<Vault> = {}): Vault {
  return {
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: 600_000,
    salt: "c2FsdC1vbmU",
    passphrase: { nonce: "cGFzcy1u", ciphertext: "cGFzcy1j" },
    recovery: { nonce: "cmVjLW4", ciphertext: "cmVjLWM" },
    ...overrides,
  };
}

interface Server {
  readonly store: VaultStore;
  readonly transport: SyncTransport;
  /** Set only for Postgres, where a test may look at the row directly. */
  readonly accountId?: string;
}

const servers: [string, () => Server][] = [
  [
    "memory",
    () => {
      const transport = createMemoryTransport();
      return { store: createMemoryVaultStore({ rows: transport }), transport };
    },
  ],
  [
    "postgres",
    () => {
      // A fresh account rather than a fresh database, as in ./sync.test.ts.
      const accountId = randomUUID();
      return {
        store: createDatabaseVaultStore(fixture.db, accountId),
        transport: createDatabaseTransport(fixture.db, accountId),
        accountId,
      };
    },
  ],
];

async function seal(transport: SyncTransport, count: number): Promise<void> {
  await transport.push(
    Array.from({ length: count }, (_, index) => ({
      collection: "weight" as const,
      recordId: `rec-${index}`,
      ciphertext: "sealed",
      nonce: "AAAAAAAAAAAAAAAA",
      baseRev: 0,
      deleted: false,
    })),
  );
}

describe.each(servers)("the vault store (%s)", (_name, make) => {
  it("holds nothing until somebody turns sync on", async () => {
    await expect(make().store.read()).resolves.toBeUndefined();
  });

  it("stores a vault and hands it back unchanged", async () => {
    const { store } = make();
    const vault = makeVault();

    const written = await store.write(vault, NOTICE);
    expect(written.outcome).toBe("created");

    const stored = await store.read();
    expect(stored?.vault).toEqual(vault);
    expect(stored?.notice).toBe(NOTICE);
    expect(Date.parse(stored!.consentedAt)).not.toBeNaN();
  });

  it("gives back a key that still opens after the round trip", async () => {
    // The one test here that uses real crypto, and it is worth its runtime: it
    // is the only thing that would catch the passphrase blob being written to
    // the recovery columns, which type-checks perfectly and locks the person
    // out of their own account.
    const { store } = make();
    const created = await createVault("uma frase longa o bastante");

    await store.write(created.vault, NOTICE);
    const stored = await store.read();

    await expect(
      openWithPassphrase(stored!.vault, "uma frase longa o bastante"),
    ).resolves.toBeDefined();
  });

  it("lets a rewrap through, because a rewrap keeps the salt", async () => {
    const { store } = make();
    await store.write(makeVault(), NOTICE);

    // What `changePassphrase` produces: same salt, same recovery blob, a new
    // passphrase blob. Refusing this would mean a passphrase can never change.
    const rewrapped = makeVault({
      passphrase: { nonce: "bmV3LW4", ciphertext: "bmV3LWM" },
    });

    const written = await store.write(rewrapped, NOTICE);
    expect(written.outcome).toBe("replaced");
    expect((await store.read())?.vault).toEqual(rewrapped);
  });

  it("refuses a vault that would orphan every record in the account", async () => {
    const { store } = make();
    const first = makeVault();
    await store.write(first, NOTICE);

    // A second device that ran `createVault` instead of unlocking. Its salt is
    // new, so its data key is new, so writing it would leave every row already
    // on the server sealed under a key nobody has any more.
    const stranger = makeVault({ salt: "c2FsdC10d28" });

    const written = await store.write(stranger, NOTICE);
    expect(written.outcome).toBe("conflict");
    expect(written.stored.vault).toEqual(first);
    expect((await store.read())?.vault).toEqual(first);
  });

  it("leaves the date of consent alone when only the passphrase changed", async () => {
    const { store } = make();
    await store.write(makeVault(), NOTICE);
    const first = await store.read();

    await store.write(
      makeVault({ passphrase: { nonce: "bmV3LW4", ciphertext: "bmV3LWM" } }),
      NOTICE,
    );

    // Changing a passphrase agrees to nothing. A record of consent that moved
    // its date every time a key was rewrapped would be a record of the last
    // rewrap, which is not what art. 8 § 2 asks the controller to keep.
    expect((await store.read())?.consentedAt).toBe(first?.consentedAt);
  });

  it("records the new notice when the notice has changed", async () => {
    const { store } = make();
    await store.write(makeVault(), NOTICE);

    await store.write(makeVault(), "2026-12-01");

    const stored = await store.read();
    expect(stored?.notice).toBe("2026-12-01");
  });

  it("turns sync off by deleting the records and the vault", async () => {
    const { store, transport } = make();
    await store.write(makeVault(), NOTICE);
    await seal(transport, 3);

    const erased = await store.erase();

    // Off means gone, not a flag (#96). Both halves, or the account is either
    // unreadable or still holding data somebody asked to have deleted.
    expect(erased.rows).toBe(3);
    await expect(store.read()).resolves.toBeUndefined();
    await expect(transport.pull(null)).resolves.toMatchObject({ rows: [] });
  });

  it("says nothing was deleted when there was nothing to delete", async () => {
    // Turning off something that was never on is not an error. A device that
    // lost its local state and asks anyway should get a plain answer.
    await expect(make().store.erase()).resolves.toEqual({ rows: 0 });
  });

  it("treats turning sync back on as a new agreement", async () => {
    const { store } = make();
    await store.write(makeVault(), NOTICE);
    const before = await store.read();
    await store.erase();

    await store.write(makeVault({ salt: "c2FsdC10d28" }), NOTICE);

    // This is the withdrawal being visible through the front door: the notice
    // did not change, so the only reason the date moves is that consent had
    // been withdrawn and is now being given again.
    expect((await store.read())?.consentedAt).not.toBe(before?.consentedAt);
  });

  it("cannot be reached from another account", async () => {
    const mine = make();
    const theirs = make();
    await mine.store.write(makeVault(), NOTICE);

    await expect(theirs.store.read()).resolves.toBeUndefined();
  });
});

describe("the consent record (postgres)", () => {
  it("keeps the withdrawal rather than the row disappearing", async () => {
    // GDPR art. 7(3): withdrawal is something that happened. A controller who
    // answers "was consent withdrawn?" with an absent row cannot tell that from
    // "never given" — so this is the one place the row is read directly, since
    // the interface deliberately has no way to ask.
    const accountId = randomUUID();
    const store = createDatabaseVaultStore(fixture.db, accountId);

    await store.write(makeVault(), NOTICE);
    await store.erase();

    const result = await fixture.pg.query<{
      notice: string;
      revoked_at: Date | null;
    }>("SELECT notice, revoked_at FROM sync.consent WHERE account_id = $1", [
      accountId,
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.notice).toBe(NOTICE);
    expect(result.rows[0]?.revoked_at).not.toBeNull();
  });
});
