import type { IsoTimestamp } from "@/lib/storage/types";

import type { MemoryTransport } from "./transport.fixture";
import type { StoredVault, VaultStore, VaultWrite } from "./vault-store";
import type { Vault } from "./vault";

/**
 * The vault half of the server, in memory (#96).
 *
 * Same job as `transport.fixture.ts`: the readable statement of what
 * `src/lib/db/vault.ts` is allowed to do, short enough that the two can be
 * compared by reading them. `src/lib/db/vault.test.ts` runs this and the
 * Postgres one through the same assertions.
 *
 * It is handed the record store rather than keeping its own, because on the
 * server they are one account's worth of rows and one account's vault, and
 * "turn sync off" has to empty both. A fixture where erasing the vault left the
 * records behind would test a system nobody is building.
 */

interface MemoryVaultStoreOptions {
  /** The records this vault opens. `erase()` deletes them. */
  rows?: MemoryTransport;
  clock?: () => IsoTimestamp;
}

/** The consent row: what survives being erased, and all it ever holds. */
interface Consent {
  notice: string;
  consentedAt: IsoTimestamp;
  revokedAt: IsoTimestamp | null;
}

export interface MemoryVaultStore extends VaultStore {
  /**
   * The consent record as the server holds it, withdrawal included.
   *
   * Read by the tests that check the one thing `read()` deliberately cannot
   * show: that turning sync off leaves a stamped row rather than nothing.
   */
  consent(): Consent | undefined;
}

export function createMemoryVaultStore(
  options: MemoryVaultStoreOptions = {},
): MemoryVaultStore {
  let tick = 0;
  const clock =
    options.clock ??
    (() =>
      new Date(
        Date.UTC(2026, 0, 1, 0, 0, ++tick),
      ).toISOString() as IsoTimestamp);

  let vault: Vault | undefined;
  let consent: Consent | undefined;

  const stored = (): StoredVault | undefined =>
    vault && consent
      ? { vault, notice: consent.notice, consentedAt: consent.consentedAt }
      : undefined;

  return {
    async read(): Promise<StoredVault | undefined> {
      return stored();
    },

    async write(incoming: Vault, notice: string): Promise<VaultWrite> {
      // The one check a server can make about a key it cannot read: a rewrap
      // keeps the salt, a new vault draws a new one. See `vault-store.ts`.
      if (vault && vault.salt !== incoming.salt) {
        return { outcome: "conflict", stored: stored()! };
      }

      const replaced = vault !== undefined;
      vault = incoming;

      // A rewrap is not a consent event: changing a passphrase agrees to
      // nothing new, so the date stands. A different notice is a different
      // agreement and moves it. Either way there is one row, not a pile —
      // consenting again after a withdrawal clears the withdrawal, because what
      // the controller has to be able to state is what is true now.
      consent =
        consent && consent.notice === notice && consent.revokedAt === null
          ? { ...consent }
          : { notice, consentedAt: clock(), revokedAt: null };

      return { outcome: replaced ? "replaced" : "created", stored: stored()! };
    },

    async erase(): Promise<{ rows: number }> {
      const rows = options.rows?.erase() ?? 0;
      vault = undefined;
      if (consent) consent.revokedAt = clock();
      return { rows };
    },

    consent() {
      return consent;
    },
  };
}
