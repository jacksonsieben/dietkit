import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryRepository } from "@/lib/storage/memory";
import type { Repository } from "@/lib/storage/repository";
import type { IsoDate, IsoTimestamp } from "@/lib/storage/types";

import { createMemoryEnrollmentStore } from "./enrollment";
import type { EnrollmentStore } from "./enrollment";
import { createMemoryJournal } from "./journal";
import type { Journal } from "./journal";
import { createSyncRepository } from "./repository";
import type { SyncRepository } from "./repository";
import { createSyncSession } from "./session";
import type { SyncSession } from "./session";
import { createMemoryTransport } from "./transport.fixture";
import type { MemoryTransport } from "./transport.fixture";
import { WrongKeyError } from "./sealed";
import { createMemoryVaultStore } from "./vault-store.fixture";
import type { MemoryVaultStore } from "./vault-store.fixture";
import type { VaultClient } from "./vault-transport.http";

/**
 * Turning sync on and off, with two devices and one server (#96).
 *
 * The pieces are all tested on their own; what this file is about is the order
 * they are used in, because every mistake available here is a bad one — an
 * account that arrives empty on the second device, a conflict for every record
 * somebody owns, or a key deleted while the rows it opens are still on a
 * server.
 *
 * The server is the memory pair from #95/#96, sharing one row store with the
 * vault store, so "turn sync off" really does have to empty both.
 */

const NOTICE = "2026-08-18";
const PASSPHRASE = "cavalo bateria grampo correto";

/** The client the session talks to, over the memory store instead of HTTP. */
function clientOver(store: MemoryVaultStore): VaultClient {
  return {
    async read() {
      return (await store.read()) ?? null;
    },
    write: (vault, notice) => store.write(vault, notice),
    erase: () => store.erase(),
  };
}

interface Device {
  readonly session: SyncSession;
  readonly inner: Repository;
  readonly journal: Journal;
  readonly enrollment: EnrollmentStore;
  /** What the app would get from `getRepository()` on this device. */
  repository(): Repository;
}

/**
 * Long, and deliberately so.
 *
 * Nearly every test here creates or opens a vault, and a vault is 600 000
 * PBKDF2 iterations by design (`vault.ts`). Two devices in one test is four
 * derivations, and on a loaded worker pool that has run past the default five
 * seconds — a different test each time, which is the signature of a timeout
 * rather than of a bug. Lowering the iteration count for tests would be testing
 * a cheaper vault than the one people get, so the clock moves instead.
 */
describe("a sync session", { timeout: 30_000 }, () => {
  let rows: MemoryTransport;
  let vaults: MemoryVaultStore;
  let minute: number;

  beforeEach(() => {
    rows = createMemoryTransport();
    vaults = createMemoryVaultStore({ rows });
    minute = 0;
  });

  /**
   * A clock that moves a minute every time it is read.
   *
   * The real one can be read twice inside the same millisecond, which would let
   * a stamp written at the wrong moment pass for one written at the right one.
   */
  function clock(): IsoTimestamp {
    return new Date(
      Date.UTC(2026, 0, 1, 9, minute++),
    ).toISOString() as IsoTimestamp;
  }

  function device(accountId = "account-1"): Device {
    const inner = createMemoryRepository();
    const journal = createMemoryJournal();
    const enrollment = createMemoryEnrollmentStore();
    let decorated: SyncRepository | undefined;

    const session = createSyncSession({
      accountId,
      notice: NOTICE,
      vaults: clientOver(vaults),
      enrollment,
      journal,
      install: (wrap) => {
        decorated = wrap(inner);
        return decorated;
      },
      uninstall: () => {
        decorated = undefined;
      },
      now: clock,
      decorate: ({ inner: store, dataKey, deviceId }) =>
        createSyncRepository({
          inner: store,
          journal,
          transport: rows,
          dataKey,
          deviceId,
        }),
    });

    return {
      session,
      inner,
      journal,
      enrollment,
      repository: () => decorated ?? inner,
    };
  }

  function weight(id: string, date: string, kg: number) {
    return {
      id,
      date: date as IsoDate,
      weightKg: kg,
      recordedAt: `${date}T07:00:00.000Z` as IsoTimestamp,
    };
  }

  it("is off before anybody turns it on", async () => {
    await expect(device().session.state()).resolves.toEqual({ status: "off" });
  });

  it("turns on, and says what was agreed to", async () => {
    const first = device();
    const enabled = await first.session.enable(PASSPHRASE);

    expect(enabled).toMatchObject({ outcome: "enabled" });
    await expect(first.session.state()).resolves.toMatchObject({
      status: "on",
      notice: NOTICE,
    });

    // The recovery code is shown once, here, and never stored anywhere this
    // code can reach it again — see `vault.ts`.
    expect(enabled.outcome === "enabled" && enabled.recoveryCode).toMatch(
      /[a-z0-9-]{10,}/i,
    );
  });

  it("takes what was already on the device with it", async () => {
    const first = device();
    await first.inner.weight.put(weight("w-1", "2026-01-02", 72.4));

    await first.session.enable(PASSPHRASE);
    const outcome = await first.session.sync();

    // The weight was written long before sync existed. If enabling did not
    // seed the journal, this would be zero and the second device would find an
    // empty account.
    expect(outcome.pushed).toBeGreaterThanOrEqual(2);
  });

  it("hands the account to a second device that has the passphrase", async () => {
    const first = device();
    await first.inner.weight.put(weight("w-1", "2026-01-02", 72.4));
    await first.session.enable(PASSPHRASE);
    await first.session.sync();

    const second = device();
    await expect(second.session.state()).resolves.toMatchObject({
      status: "elsewhere",
      notice: NOTICE,
    });

    await expect(
      second.session.unlock({ passphrase: PASSPHRASE }),
    ).resolves.toEqual({ outcome: "unlocked" });

    const entries = await second.inner.weight.list();
    expect(entries.map((entry) => entry.id)).toEqual(["w-1"]);
  });

  it("takes the recovery code instead, for the passphrase nobody remembers", async () => {
    const first = device();
    const enabled = await first.session.enable(PASSPHRASE);
    const recoveryCode =
      enabled.outcome === "enabled" ? enabled.recoveryCode : "";
    // Through the decorator, the way the app writes: a record made after sync
    // was turned on is journalled rather than seeded.
    await first.repository().weight.put(weight("w-2", "2026-01-03", 72.1));
    await first.session.sync();

    const second = device();
    await second.session.unlock({ recoveryCode });

    const entries = await second.inner.weight.list();
    expect(entries.map((entry) => entry.id)).toEqual(["w-2"]);
  });

  it("keeps what the second device already had of its own", async () => {
    const first = device();
    await first.inner.weight.put(weight("w-1", "2026-01-02", 72.4));
    await first.session.enable(PASSPHRASE);
    await first.session.sync();

    // A phone that has been used offline for a week before anybody thought to
    // turn sync on. Its week is not a conflict with the laptop's week, and it
    // is not something to throw away either.
    const second = device();
    await second.inner.weight.put(weight("w-5", "2026-01-06", 71.2));
    await second.session.unlock({ passphrase: PASSPHRASE });

    const here = await second.inner.weight.list();
    expect(here.map((entry) => entry.id).sort()).toEqual(["w-1", "w-5"]);

    // And it reached the server, so the laptop gets it too -- which is only
    // true because unlock seeds *after* the first pull and pushes afterwards.
    const third = device();
    await third.session.unlock({ passphrase: PASSPHRASE });
    const there = await third.inner.weight.list();
    expect(there.map((entry) => entry.id).sort()).toEqual(["w-1", "w-5"]);
  });

  it("does not enroll a device that got the passphrase wrong", async () => {
    await device().session.enable(PASSPHRASE);

    const second = device();
    await expect(
      second.session.unlock({ passphrase: "não é essa" }),
    ).rejects.toBeInstanceOf(WrongKeyError);

    // Nothing half-written: no key, no journal, and the screen still shows the
    // unlock form rather than a sync that will never work.
    await expect(second.enrollment.read()).resolves.toBeUndefined();
    await expect(second.session.state()).resolves.toMatchObject({
      status: "elsewhere",
    });
  });

  it("refuses to enroll over an account that already syncs", async () => {
    const first = device();
    await first.session.enable(PASSPHRASE);
    await first.inner.weight.put(weight("w-1", "2026-01-02", 72.4));
    await first.session.sync();

    // A second device pressing "turn on" instead of "unlock" -- because the
    // screen was loaded before the first device enrolled. Writing its vault
    // would leave every row above sealed under a key nobody has.
    const second = device();
    await expect(second.session.enable("outra frase longa")).resolves.toEqual({
      outcome: "conflict",
    });

    await expect(second.enrollment.read()).resolves.toBeUndefined();
    await expect(first.session.sync()).resolves.toMatchObject({ pushed: 0 });
  });

  describe("the readout", () => {
    it("counts what is still waiting, and says nothing has synced yet", async () => {
      const first = device();
      await first.inner.weight.put(weight("w-1", "2026-01-02", 72.4));
      await first.session.enable(PASSPHRASE);

      const before = await first.session.readings();
      expect(before.pending).toBeGreaterThanOrEqual(2);
      expect(before.lastSyncedAt).toBeUndefined();
    });

    it("goes level, and remembers when", async () => {
      const first = device();
      await first.session.enable(PASSPHRASE);
      await first.session.sync();

      const after = await first.session.readings();
      expect(after.pending).toBe(0);
      expect(after.lastSyncedAt).toEqual(expect.any(String));
    });

    it("keeps the old time when a round trip fails", async () => {
      const first = device();
      await first.session.enable(PASSPHRASE);
      await first.session.sync();
      const { lastSyncedAt } = await first.session.readings();

      // The plane, the lift, the hotel wifi. "Last synced Tuesday" is the whole
      // value of the reading; a clock that moved on every attempt would show
      // today's time on a device that has not reached the server all week.
      rows.pull = () => Promise.reject(new Error("Sync failed with 502."));
      await expect(first.session.sync()).rejects.toThrow(/502/);

      await expect(first.session.readings()).resolves.toMatchObject({
        lastSyncedAt,
      });
    });
  });

  it("deletes the server copy when it is turned off", async () => {
    const first = device();
    await first.inner.weight.put(weight("w-1", "2026-01-02", 72.4));
    await first.session.enable(PASSPHRASE);
    await first.session.sync();

    await expect(first.session.disable()).resolves.toMatchObject({
      rows: expect.any(Number) as number,
    });

    // Off means gone, not a flag: no vault, no rows, nothing left to sign in
    // to. What survives is the consent row, stamped withdrawn.
    await expect(first.session.state()).resolves.toEqual({ status: "off" });
    await expect(vaults.read()).resolves.toBeUndefined();
    expect(vaults.consent()?.revokedAt).not.toBeNull();
    expect((await rows.pull(null)).rows).toEqual([]);
  });

  it("keeps the key when the server will not let go of the rows", async () => {
    const first = device();
    await first.session.enable(PASSPHRASE);
    await first.session.sync();

    const offline = createSyncSession({
      accountId: "account-1",
      notice: NOTICE,
      vaults: {
        ...clientOver(vaults),
        erase: () => Promise.reject(new Error("Sync failed with 502.")),
      },
      enrollment: first.enrollment,
      journal: first.journal,
      install: (wrap) => wrap(first.inner),
      uninstall: () => {},
      decorate: ({ inner, dataKey, deviceId }) =>
        createSyncRepository({
          inner,
          journal: first.journal,
          transport: rows,
          dataKey,
          deviceId,
        }),
    });

    await expect(offline.disable()).rejects.toThrow(/502/);

    // The delete did not happen, so the key must still be here: forgetting it
    // now would leave sealed rows on a server with nothing left that opens
    // them. Pressing the button again on a working connection is the fix.
    await expect(first.enrollment.read()).resolves.toMatchObject({
      accountId: "account-1",
    });
    await expect(first.session.state()).resolves.toMatchObject({
      status: "on",
    });
  });

  it("forgets this device without asking the server for anything", async () => {
    // What is left to do after the account is deleted (#97). There is no vault
    // endpoint to call by then and no session to call it with, so this drops
    // the local half on its own -- and the memory server below, still holding
    // everything it held before, is what makes that assertion mean something.
    const first = device();
    await first.inner.weight.put(weight("w-1", "2026-01-02", 72.4));
    await first.session.enable(PASSPHRASE);
    await first.session.sync();

    await first.session.forget();

    await expect(first.journal.pending()).resolves.toEqual([]);
    await expect(first.enrollment.read()).resolves.toBeUndefined();

    await expect(vaults.read()).resolves.toBeDefined();
    expect((await rows.pull(null)).rows).not.toEqual([]);

    // This device is now indistinguishable from one that never had the key:
    // the account syncs, just not from here.
    await expect(first.session.state()).resolves.toMatchObject({
      status: "elsewhere",
    });
  });

  it("stops journalling writes once it is off", async () => {
    const first = device();
    await first.session.enable(PASSPHRASE);
    await first.session.disable();

    await first.repository().weight.put(weight("w-3", "2026-01-04", 71.9));

    // The decorator is uninstalled, so this is a plain local write again --
    // and there is nowhere to send it anyway.
    await expect(first.journal.pending()).resolves.toEqual([]);
  });

  it("is still on after a reload", async () => {
    const inner = createMemoryRepository();
    const journal = createMemoryJournal();
    const enrollment = createMemoryEnrollmentStore();
    let decorated: SyncRepository | undefined;

    const build = () =>
      createSyncSession({
        accountId: "account-1",
        notice: NOTICE,
        vaults: clientOver(vaults),
        enrollment,
        journal,
        install: (wrap) => (decorated = wrap(inner)),
        uninstall: () => {
          decorated = undefined;
        },
        decorate: ({ inner: store, dataKey, deviceId }) =>
          createSyncRepository({
            inner: store,
            journal,
            transport: rows,
            dataKey,
            deviceId,
          }),
      });

    const first = build();
    await first.enable(PASSPHRASE);
    await first.sync();
    decorated = undefined;

    // A new tab: the same IndexedDB, a session object that has never run. The
    // key is on the device, so this must not ask for a passphrase again, and
    // the decorator has to come back or writes would stop being journalled.
    const reloaded = build();
    await expect(reloaded.state()).resolves.toMatchObject({ status: "on" });

    await decorated!.weight.put(weight("w-4", "2026-01-05", 71.5));
    expect(await journal.pending()).toHaveLength(1);
  });

  it("drops the key when a different account signs in here", async () => {
    const first = device();
    await first.session.enable(PASSPHRASE);

    // Same device, same IndexedDB, somebody else's account. The old key seals
    // nothing this account can read, and the old journal would push one
    // account's dirty list into another's rows.
    const other = createSyncSession({
      accountId: "account-2",
      notice: NOTICE,
      vaults: clientOver(vaults),
      enrollment: first.enrollment,
      journal: first.journal,
      install: (wrap) => wrap(first.inner),
      uninstall: () => {},
      decorate: ({ inner, dataKey, deviceId }) =>
        createSyncRepository({
          inner,
          journal: first.journal,
          transport: rows,
          dataKey,
          deviceId,
        }),
    });

    await other.state();
    await expect(first.enrollment.read()).resolves.toBeUndefined();
  });
});
