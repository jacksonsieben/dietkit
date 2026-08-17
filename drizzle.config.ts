import { defineConfig } from "drizzle-kit";

/**
 * Migrations are checked in as SQL under `drizzle/`, generated from
 * `src/lib/db/schema`. Nothing pushes a schema at a database directly: a
 * reviewer should be able to read the DDL in the diff, and `db:migrate` should
 * apply exactly what was reviewed.
 *
 * `DATABASE_URL_UNPOOLED` first, because DDL over a pooler is a bad idea — Neon's
 * Vercel integration provides both, and the pooled URL is for the app's reads.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
