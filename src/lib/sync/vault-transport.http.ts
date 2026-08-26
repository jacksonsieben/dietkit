import { SyncRequestError } from "./transport.http";
import type { VaultResponse } from "./vault-endpoint";
import type { StoredVault, VaultWrite } from "./vault-store";
import type { Vault } from "./vault";

/**
 * The client half of `POST /api/sync/vault` (#96).
 *
 * Thin, like `./transport.http.ts`, and for the same reason: every rule that
 * matters is either in `vault.ts` above it — where the key is wrapped and
 * unwrapped, on this device, in memory — or in `src/lib/db/vault.ts` below it.
 *
 * It throws `SyncRequestError` rather than an error of its own, because the
 * screen that calls it also calls the sync transport and has to tell "your
 * session expired" from "the server is unhappy" exactly once.
 *
 * No account id, as everywhere on this path: the session cookie decides.
 */

export interface VaultClient {
  /** The account's vault, or `null` if sync has never been turned on. */
  read(): Promise<StoredVault | null>;
  /** Uploads a vault and records consent to `notice`. */
  write(vault: Vault, notice: string): Promise<VaultWrite>;
  /** Turns sync off: deletes the records and the vault. */
  erase(): Promise<{ rows: number }>;
}

interface HttpVaultClientOptions {
  readonly endpoint?: string;
  readonly fetch?: typeof globalThis.fetch;
}

export function createHttpVaultClient(
  options: HttpVaultClientOptions = {},
): VaultClient {
  const endpoint = options.endpoint ?? "/api/sync/vault";
  const call = options.fetch ?? globalThis.fetch.bind(globalThis);

  async function post<T>(body: unknown): Promise<T> {
    const response = await call(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const message = await response
        .json()
        .then((parsed: { error?: string }) => parsed.error)
        .catch(() => undefined);

      throw new SyncRequestError(
        response.status,
        message ?? `Sync failed with ${response.status}.`,
      );
    }

    return (await response.json()) as T;
  }

  return {
    async read(): Promise<StoredVault | null> {
      const answer = await post<VaultResponse>({ action: "get" });
      return answer.stored;
    },

    async write(vault: Vault, notice: string): Promise<VaultWrite> {
      const answer = await post<VaultResponse>({
        action: "put",
        vault,
        notice,
      });

      // The server always answers a `put` with both, and a response missing
      // either is a server this client does not understand — better a thrown
      // error here than a screen that quietly believes sync is on.
      if (!answer.outcome || !answer.stored) {
        throw new SyncRequestError(502, "The server gave no answer.");
      }

      return { outcome: answer.outcome, stored: answer.stored } as VaultWrite;
    },

    erase(): Promise<{ rows: number }> {
      return post<{ rows: number }>({ action: "delete" });
    },
  };
}
