import type { IsoTimestamp } from "@/lib/storage/types";

import type { Vault } from "./vault";

/**
 * Where the wrapped key and the record of consent live, on the server (#96).
 *
 * The same shape of thing as `transport.ts` and for the same reason: the rules
 * worth testing are not the SQL. `vault-store.fixture.ts` is the readable
 * statement of them, `src/lib/db/vault.ts` is the one that runs against Neon,
 * and `src/lib/db/vault.test.ts` runs both through the same contract.
 *
 * Also like `transport.ts`: **no account id anywhere in here.** A store is
 * created already bound to one, by a route that read it from the session.
 *
 * Two things share this interface because they are one act. Turning sync on
 * uploads a vault *and* records a consent; turning it off deletes the records
 * and the vault *and* stamps the withdrawal. Splitting them across two stores
 * would make it possible to do one without the other, and the failure that
 * produces — sealed rows on a server with no record of anyone agreeing to
 * them — is the exact thing LGPD art. 8 § 2 asks the controller to be able to
 * disprove.
 */

/** A vault as it comes back, with what was agreed to in order to store it. */
export interface StoredVault {
  readonly vault: Vault;
  /** The `LEGAL_EFFECTIVE_DATE` of the notice that was on screen. */
  readonly notice: string;
  readonly consentedAt: IsoTimestamp;
}

/**
 * What happened when a device offered a vault.
 *
 * `conflict` is the one worth reading twice. A vault already exists, and the
 * incoming one is not a rewrap of it — so writing it would leave every sealed
 * row on the server unopenable by anybody, including the person who wrote them.
 * The server cannot check a passphrase, but it can check this, and it is the
 * difference between "change my passphrase" and "silently destroy my account".
 */
export type VaultWrite =
  | { readonly outcome: "created" | "replaced"; readonly stored: StoredVault }
  | { readonly outcome: "conflict"; readonly stored: StoredVault };

export interface VaultStore {
  /** The vault for this account, or nothing if sync was never turned on. */
  read(): Promise<StoredVault | undefined>;

  /**
   * Stores a vault and records the consent that permits it.
   *
   * Writing over an existing vault is allowed only when the salt matches, which
   * is precisely when the incoming vault is a rewrap of the stored one:
   * `changePassphrase` keeps the salt and `createVault` draws a new one. That
   * one comparison is the whole guard against a second device enrolling over
   * the first and orphaning every record in the account.
   */
  write(vault: Vault, notice: string): Promise<VaultWrite>;

  /**
   * Turns sync off: deletes every sealed row and the vault, and stamps the
   * withdrawal on the consent record.
   *
   * Off means gone, not a flag (#96). What survives is one row holding two
   * dates and the version of a public web page, because GDPR art. 7(3) makes
   * withdrawal a thing that happened, and a controller answering "was consent
   * withdrawn?" with no row cannot tell that from "never given".
   *
   * Returns how many sealed rows were deleted, so the screen that asked for
   * this can say what it did rather than "done".
   */
  erase(): Promise<{ readonly rows: number }>;
}
