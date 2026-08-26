import { describe, expect, it } from "vitest";

import { LEGAL_EFFECTIVE_DATE } from "@/lib/legal";

import { createMemoryTransport } from "./transport.fixture";
import { createMemoryVaultStore } from "./vault-store.fixture";
import {
  isVaultRequestError,
  parseVaultRequest,
  vaultResponse,
} from "./vault-endpoint";
import type { Vault } from "./vault";

/**
 * The request-to-response half of `POST /api/sync/vault` (#96).
 *
 * What the store does is settled in `src/lib/db/vault.test.ts` against a real
 * Postgres. What is left is what a database cannot tell you: what a body is
 * allowed to be, and what a device gets back when it is not.
 *
 * As with `./endpoint.test.ts`, read whole this is also the answer to "what
 * could a signed-in device ask for that it should not get". Nothing about
 * anybody else, because no shape here has a field naming an account.
 */

function vault(overrides: Partial<Vault> = {}): Vault {
  return {
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: 600_000,
    salt: "c2FsdA",
    passphrase: { nonce: "cGFzcy1u", ciphertext: "cGFzcy1j" },
    recovery: { nonce: "cmVjLW4", ciphertext: "cmVjLWM" },
    ...overrides,
  };
}

function put(overrides: Record<string, unknown> = {}) {
  return {
    action: "put",
    vault: vault(),
    notice: LEGAL_EFFECTIVE_DATE,
    ...overrides,
  };
}

function errorOf(body: unknown): string | undefined {
  const parsed = parseVaultRequest(body);
  return isVaultRequestError(parsed) ? parsed.error : undefined;
}

function store() {
  return createMemoryVaultStore({ rows: createMemoryTransport() });
}

describe("parsing a vault request", () => {
  it("takes the three things a device can ask for", () => {
    expect(parseVaultRequest({ action: "get" })).toEqual({ action: "get" });
    expect(parseVaultRequest({ action: "delete" })).toEqual({
      action: "delete",
    });
    expect(parseVaultRequest(put())).toMatchObject({ action: "put" });
  });

  it("refuses a body that is not a request", () => {
    expect(errorOf(null)).toBeDefined();
    expect(errorOf("get")).toBeDefined();
    expect(errorOf({})).toBeDefined();
    expect(errorOf({ action: "drop" })).toBeDefined();
  });

  it("refuses a vault with a piece missing", () => {
    for (const missing of [
      "version",
      "kdf",
      "iterations",
      "salt",
      "passphrase",
      "recovery",
    ]) {
      const broken = { ...vault() } as Record<string, unknown>;
      delete broken[missing];
      expect(errorOf(put({ vault: broken })), missing).toBe(
        "The vault is malformed.",
      );
    }
  });

  it("refuses a sealed blob that is not one", () => {
    expect(
      errorOf(put({ vault: vault({ passphrase: { nonce: "n" } as never }) })),
    ).toBe("The vault is malformed.");
    expect(
      errorOf(
        put({
          vault: vault({ recovery: { nonce: "n", ciphertext: "" } as never }),
        }),
      ),
    ).toBe("The vault is malformed.");
  });

  it("refuses a work factor low enough to be an accident", () => {
    // Not a defence against a device that wants to weaken its own vault — it
    // could send the floor exactly. It catches the client bug that ships a
    // development constant.
    expect(errorOf(put({ vault: vault({ iterations: 1000 }) }))).toBe(
      "The vault is malformed.",
    );
    expect(
      errorOf(put({ vault: vault({ iterations: 600_000 }) })),
    ).toBeUndefined();
  });

  it("takes a notice a version behind, and refuses one from the future", () => {
    // A screen served out of the service worker can be a version behind, and
    // that is the version the person actually read. One from the future is a
    // version no honest client can have displayed.
    expect(errorOf(put({ notice: "2020-01-01" }))).toBeUndefined();
    expect(errorOf(put({ notice: "2099-01-01" }))).toBe(
      "The notice version is malformed.",
    );
    expect(errorOf(put({ notice: "ontem" }))).toBe(
      "The notice version is malformed.",
    );
  });
});

describe("answering a vault request", () => {
  it("says there is nothing when sync was never turned on", async () => {
    const response = await vaultResponse(store(), { action: "get" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ stored: null });
  });

  it("stores a vault and reads it back", async () => {
    const shared = store();

    const written = await vaultResponse(shared, put());
    await expect(written.json()).resolves.toMatchObject({
      outcome: "created",
    });

    const read = await vaultResponse(shared, { action: "get" });
    const body = (await read.json()) as { stored: { vault: Vault } };
    expect(body.stored.vault).toEqual(vault());
  });

  it("reports a conflict as an answer, not as an error", async () => {
    const shared = store();
    await vaultResponse(shared, put());

    const response = await vaultResponse(
      shared,
      put({ vault: vault({ salt: "b3V0cm8" }) }),
    );

    // The request was well formed and the server understood it. What happened
    // is a fact about the account — another device enrolled first — and the
    // screen has to be able to say so and offer to unlock instead.
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      outcome: "conflict",
    });
  });

  it("deletes on request and says how much it deleted", async () => {
    const rows = createMemoryTransport();
    const shared = createMemoryVaultStore({ rows });
    await vaultResponse(shared, put());
    await rows.push([
      {
        collection: "weight",
        recordId: "rec-1",
        ciphertext: "sealed",
        nonce: "AAAAAAAAAAAAAAAA",
        baseRev: 0,
        deleted: false,
      },
    ]);

    const response = await vaultResponse(shared, { action: "delete" });

    await expect(response.json()).resolves.toEqual({ rows: 1 });
    await expect(
      (await vaultResponse(shared, { action: "get" })).json(),
    ).resolves.toEqual({ stored: null });
  });

  it("answers a malformed body with 400 and nothing else", async () => {
    const response = await vaultResponse(store(), { action: "put" });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "The vault is malformed.",
    });
  });

  it("is never cached", async () => {
    // A vault is not readable, but it is one account's key material and a
    // shared cache keyed on the URL alone would hand it to whoever asked next.
    const response = await vaultResponse(store(), { action: "get" });

    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("names no account, in either direction", async () => {
    const shared = store();
    const written = await vaultResponse(shared, put());
    const read = await vaultResponse(shared, { action: "get" });

    for (const response of [written, read]) {
      expect(JSON.stringify(await response.json())).not.toMatch(/account/i);
    }
  });
});
