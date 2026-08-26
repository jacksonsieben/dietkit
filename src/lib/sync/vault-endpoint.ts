import { NextResponse } from "next/server";

import { LEGAL_EFFECTIVE_DATE } from "@/lib/legal";

import type { StoredVault, VaultStore } from "./vault-store";
import type { Vault } from "./vault";

/**
 * `POST /api/sync/vault` without the database or the session attached (#96).
 *
 * The same split as `./endpoint.ts`, for the same two reasons: `db()` and
 * `auth()` are `server-only`, and `src/lib/db` is the only tree allowed to know
 * drizzle exists. What is left is the part worth testing — what a body may be,
 * and what a malformed one gets back.
 *
 * **No account id in any of it.** The route reads it from the session and hands
 * in a store already bound to it.
 *
 * This endpoint is separate from `/api/sync` rather than a fourth action on it
 * because the two have different lifetimes. A device syncs every few seconds
 * and touches the vault three times ever: when sync is turned on, when a
 * passphrase changes, and when it is turned off.
 */

/** base64url of 48 sealed bytes is 64 characters; the slack is for a rewrite. */
const MAX_BLOB = 512;

/** Long enough for any KDF name worth having. */
const MAX_KDF = 64;

/**
 * A floor under the work factor, so a client bug cannot quietly store a vault
 * that is cheap to attack.
 *
 * Not a real defence — a device that wanted to weaken its own vault could send
 * exactly this number — and not the server's business in general: the vault is
 * opaque here and the person it protects is the person sending it. It is a
 * guard against the accident, not the attack.
 */
const MIN_ITERATIONS = 100_000;

export type VaultRequest =
  | { readonly action: "get" }
  | { readonly action: "put"; readonly vault: Vault; readonly notice: string }
  | { readonly action: "delete" };

export interface VaultRequestError {
  readonly error: string;
}

export function isVaultRequestError(
  value: VaultRequest | VaultRequestError,
): value is VaultRequestError {
  return "error" in value;
}

function isText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function parseSealed(
  value: unknown,
): { nonce: string; ciphertext: string } | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const sealed = value as Record<string, unknown>;

  if (!isText(sealed.nonce, MAX_BLOB)) return undefined;
  if (!isText(sealed.ciphertext, MAX_BLOB)) return undefined;

  return { nonce: sealed.nonce, ciphertext: sealed.ciphertext };
}

/**
 * Checks the shape of a vault and nothing else.
 *
 * Everything in it is opaque here by design. The server cannot tell a real
 * wrapping from random bytes of the same length, which is the property that
 * makes the whole scheme worth having — so this checks lengths and types, and
 * refuses to have an opinion about the contents.
 */
function parseVault(value: unknown): Vault | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const vault = value as Record<string, unknown>;

  if (!Number.isInteger(vault.version) || (vault.version as number) < 1) {
    return undefined;
  }
  if (!isText(vault.kdf, MAX_KDF)) return undefined;
  if (
    !Number.isInteger(vault.iterations) ||
    (vault.iterations as number) < MIN_ITERATIONS
  ) {
    return undefined;
  }
  if (!isText(vault.salt, MAX_BLOB)) return undefined;

  const passphrase = parseSealed(vault.passphrase);
  const recovery = parseSealed(vault.recovery);
  if (!passphrase || !recovery) return undefined;

  return {
    version: vault.version as number,
    kdf: vault.kdf as Vault["kdf"],
    iterations: vault.iterations as number,
    salt: vault.salt,
    passphrase,
    recovery,
  };
}

/**
 * The version of the notice the device says it displayed.
 *
 * Taken from the device rather than stamped by the server, which looks
 * backwards until you remember this is an offline-first app: a screen served
 * out of the service worker can be a version behind, and a server that stamped
 * its own constant would record an agreement to a page the person never saw.
 *
 * The one thing refused is a version *later* than the server's own, which no
 * honest client can have displayed.
 */
function parseNotice(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  if (value > LEGAL_EFFECTIVE_DATE) return undefined;
  return value;
}

export function parseVaultRequest(
  body: unknown,
): VaultRequest | VaultRequestError {
  if (typeof body !== "object" || body === null) {
    return { error: "Expected a JSON object." };
  }

  const request = body as Record<string, unknown>;

  if (request.action === "get") return { action: "get" };
  if (request.action === "delete") return { action: "delete" };

  if (request.action === "put") {
    const vault = parseVault(request.vault);
    if (!vault) return { error: "The vault is malformed." };

    const notice = parseNotice(request.notice);
    if (!notice) return { error: "The notice version is malformed." };

    return { action: "put", vault, notice };
  }

  return { error: 'Expected `action` to be "get", "put" or "delete".' };
}

/** `no-store`, always — for the same reason as `./endpoint.ts`. */
const headers = { "cache-control": "no-store" } as const;

export function vaultError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers });
}

/** What `get` and `put` answer with. `null` means sync was never turned on. */
export interface VaultResponse {
  readonly stored: StoredVault | null;
  /** Present on `put`. `conflict` means the write did not happen. */
  readonly outcome?: "created" | "replaced" | "conflict";
}

/** Runs a parsed request against a store already bound to an account. */
export async function vaultResponse(
  store: VaultStore,
  body: unknown,
): Promise<NextResponse> {
  const request = parseVaultRequest(body);
  if (isVaultRequestError(request)) return vaultError(request.error, 400);

  if (request.action === "get") {
    const stored = (await store.read()) ?? null;
    return NextResponse.json({ stored } satisfies VaultResponse, { headers });
  }

  if (request.action === "put") {
    const written = await store.write(request.vault, request.notice);

    // A conflict is not a client error — the request was perfectly well formed
    // and the server understood it. It is a statement about the state of the
    // account, so it comes back as a 200 with an outcome the screen can act on
    // rather than an error it would have to guess at.
    return NextResponse.json(
      {
        stored: written.stored,
        outcome: written.outcome,
      } satisfies VaultResponse,
      { headers },
    );
  }

  return NextResponse.json(await store.erase(), { headers });
}
