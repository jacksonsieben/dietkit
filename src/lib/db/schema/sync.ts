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
