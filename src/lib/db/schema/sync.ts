import {
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * The one table on the server that holds anything belonging to a person — and
 * it holds it as bytes the server cannot read (#95).
 *
 * Everything else in this database is reference data: TACO, the exercise
 * catalog, the presets. This schema is the exception docs/DECISIONS.md § D1
 * always said would come, and the terms are in § D23 and § D25: a record is
 * sealed on the device with a key the server never sees, and what arrives here
 * is a nonce, a ciphertext, and the bookkeeping needed to put the right blob on
 * the right device.
 *
 * **Its own schema, not `public`.** `src/lib/db/boundary.test.ts` holds `public`
 * to an allowlist of reference tables and rejects any column whose name sounds
 * like a person. This table is neither — so it gets the opposite rule: the eight
 * column names below are the *only* ones `sync` may have. A ninth is a failing
 * test, because a name is data. `collection_name` would tell the server that
 * this person tracks weight without ever storing one.
 *
 * There is no `device_id` either, though an earlier draft of this table had one.
 * Nothing on the server reads it: the merge runs on the device, on a device id
 * sealed *inside* the ciphertext (src/lib/sync/envelope.ts). Left in the table
 * it would have been a column recording how many devices somebody owns and which
 * of them wrote each record — metadata about a person, kept for nobody.
 *
 * There is no foreign key to `neon_auth.user`. Neon owns that schema and our
 * migrations do not create it, so a reference from here would be a migration
 * that fails on a fresh database and a fixture that cannot be built. Deleting an
 * account therefore has to delete these rows explicitly — which is #97's job,
 * and is written down there rather than left to a cascade that does not exist.
 */
export const sync = pgSchema("sync");

export const syncRows = sync.table(
  "rows",
  {
    /** The Better Auth user id. The only link between a blob and an account. */
    accountId: text("account_id").notNull(),
    /**
     * Which set of rows — "weight", "diets", "settings". Opaque to the server
     * by policy rather than by construction: it is a string the client chooses,
     * and the client chooses names that are already in `Snapshot`.
     */
    collection: text("collection").notNull(),
    /** The record's own id, generated on the device. A UUID, or a singleton key. */
    recordId: text("record_id").notNull(),
    /** The record, sealed. Never null — a deletion is a sealed tombstone, not an empty row. */
    ciphertext: text("ciphertext").notNull(),
    /** 96 bits, fresh for every write. See src/lib/sync/sealed.ts. */
    nonce: text("nonce").notNull(),
    /**
     * The server clock, stamped on every accepted write.
     *
     * This is the pull cursor, not the merge input. Last-writer-wins compares
     * timestamps that are *inside* the ciphertext, because the server cannot
     * read those and a device that syncs a week late would otherwise win purely
     * by arriving last. Here it answers one question — "what changed since I
     * last looked" — and answering it needs no ability to read anything.
     */
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * Bumped on every accepted write. A push carries the rev it believes it is
     * replacing, so two devices writing at once produce a rejection rather than
     * a silent clobber — the loser pulls, decrypts both, and decides.
     */
    rev: integer("rev").notNull().default(1),
    /**
     * Set when the record was deleted. The row stays, because a delete has to
     * reach the other device — a row that simply vanished here would be pushed
     * straight back by whoever still had it.
     */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({
      columns: [table.accountId, table.collection, table.recordId],
    }),
    // The only query this table serves: "everything of mine since t". Leading
    // with `account_id` means one account's pull never scans another's rows.
    index("rows_account_updated_idx").on(table.accountId, table.updatedAt),
  ],
);

/**
 * The wrapped data key, so a second device can be let in (#96).
 *
 * It is the one thing on this server that *looks* like a secret and is not.
 * What is stored is the key to the account's records sealed twice over — once
 * under a key derived from a passphrase, once under a key derived from a
 * recovery code — and neither the passphrase nor the code has a column
 * anywhere (docs/DECISIONS.md § D25). Handing this row to a stranger buys them
 * a PBKDF2 attack against 600 000 iterations and nothing else, which is exactly
 * why it can be kept here at all: without it a second device could never be
 * enrolled, and "end-to-end encrypted" would mean "one device or nothing".
 *
 * The KDF parameters are stored beside the blobs rather than assumed, because
 * the day `KDF_ITERATIONS` goes up, every vault written before it still has to
 * open. `src/lib/sync/vault.ts` refuses a version it does not understand
 * instead of guessing.
 *
 * One row per account, and no row at all until somebody turns sync on. Turning
 * it off deletes it along with the records (#96); deleting the account deletes
 * it too, explicitly, because there is no cascade (#97).
 */
export const syncVault = sync.table("vault", {
  /** The Better Auth user id, as in `rows`. */
  accountId: text("account_id").primaryKey(),
  /** The envelope format. `1` today; a future one is refused, not guessed at. */
  version: integer("version").notNull(),
  /** `PBKDF2-SHA256`. Stored so a later scheme can coexist with this one. */
  kdf: text("kdf").notNull(),
  iterations: integer("iterations").notNull(),
  /** Public by construction: a salt is not a secret, it is an anti-rainbow-table. */
  salt: text("salt").notNull(),
  passphraseNonce: text("passphrase_nonce").notNull(),
  passphraseCiphertext: text("passphrase_ciphertext").notNull(),
  recoveryNonce: text("recovery_nonce").notNull(),
  recoveryCiphertext: text("recovery_ciphertext").notNull(),
});

/**
 * What was agreed to, and when (#96).
 *
 * Health data is *dado pessoal sensível* under LGPD art. 5º II and a special
 * category under GDPR art. 9, so uploading it needs consent that is specific
 * and highlighted (LGPD art. 11, I) / explicit (GDPR art. 9(2)(a)). A
 * controller who cannot say *what* was agreed to has not got a record of
 * consent, so `notice` holds the effective date of the privacy notice that was
 * on screen — the version, in the only vocabulary this project versions notices
 * in (`LEGAL_EFFECTIVE_DATE`).
 *
 * `revoked_at` is here rather than the row being deleted, because GDPR art.
 * 7(3) makes withdrawal a thing that *happens* — and a controller who answers
 * "was consent withdrawn?" with an absent row cannot tell that from "never
 * given". The records and the vault are deleted when sync is turned off; this
 * one row survives, holding two dates and a version string and nothing else
 * about anybody. It goes when the account goes (#97).
 */
export const syncConsent = sync.table("consent", {
  accountId: text("account_id").primaryKey(),
  /** The `LEGAL_EFFECTIVE_DATE` of the notice that was displayed. */
  notice: text("notice").notNull(),
  consentedAt: timestamp("consented_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** Set when sync was turned off. Cleared if it is turned back on. */
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
