import {
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/**
 * One row per successful ingest of a published dataset.
 *
 * TACO's licence condition is that the source is cited (docs/TACO-LICENSING.md),
 * so provenance is a column, not a comment: the file's SHA-256, its size, where
 * it came from, and the citation itself travel with the rows they produced.
 * Anyone holding a copy of this database can answer "which file is this number
 * from?" in SQL, and #3 refuses to ingest a file whose hash is not the pinned
 * one.
 */
export const datasetVersions = pgTable(
  "dataset_versions",
  {
    id: serial("id").primaryKey(),
    /** Which dataset — `taco` today, room for another later. */
    dataset: text("dataset").notNull(),
    /** As the publication names itself, e.g. `4ª edição revisada e ampliada`. */
    edition: text("edition").notNull(),
    sha256: text("sha256").notNull(),
    fileBytes: integer("file_bytes").notNull(),
    /** Rows this ingest wrote, so a truncated parse is visible without a diff. */
    rowCount: integer("row_count").notNull(),
    sourceUrl: text("source_url").notNull(),
    /** Full attribution, so an export of this table carries its own credit. */
    citation: text("citation").notNull(),
    /** When the file was downloaded — a URL can change under a fixed citation. */
    retrievedAt: date("retrieved_at").notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Re-running the seed on the same file updates one row rather than
    // appending a near-duplicate. A genuinely different file gets its own.
    unique("dataset_versions_dataset_sha256_key").on(
      table.dataset,
      table.sha256,
    ),
  ],
);

export type DatasetVersion = typeof datasetVersions.$inferSelect;
export type NewDatasetVersion = typeof datasetVersions.$inferInsert;
