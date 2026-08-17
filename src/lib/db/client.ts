import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

/**
 * The reference database, over Neon's HTTP driver.
 *
 * HTTP rather than a pooled TCP connection because every query this app makes is
 * a short read of read-mostly data: no pool to exhaust across Fluid Compute
 * instances, no TLS handshake on a cold start, and no transaction support — which
 * is a fit, not a compromise, since reads do not need one. The ingest (#3) opens
 * its own connection precisely because it does.
 *
 * `server-only` is the mirror image of `getRepository()` throwing on the server:
 * personal data must never reach the server, and the connection string must never
 * reach the browser. Importing this from a client component fails the build.
 */

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy env.example to .env.local and point it at " +
        "a Neon branch — see README § Reference database.",
    );
  }
  return url;
}

let cached: ReturnType<typeof create> | undefined;

function create() {
  // Every column names its own SQL identifier in ./schema, so there is no
  // `casing` option here to stay in sync with drizzle.config.ts.
  return drizzle(neon(connectionString()), { schema });
}

/**
 * Resolved on first use, not at import time, so a build or a unit test that
 * merely imports a module in this tree does not require a database to exist.
 */
export function db(): ReturnType<typeof create> {
  cached ??= create();
  return cached;
}
