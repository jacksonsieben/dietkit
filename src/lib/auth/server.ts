import "server-only";

import { createNeonAuth, type NeonAuth } from "@neondatabase/auth/next/server";

/**
 * The account, and the only door to it (docs/DECISIONS.md § D24).
 *
 * Neon Auth is a managed Better Auth. This module is the one place the SDK is
 * imported: `src/account-optional.test.ts` fails the build if any screen that
 * is not about accounts reaches past it, because a screen that cannot ask
 * whether somebody is signed in cannot start behaving differently when they
 * are. An account moves data between devices. It is not the price of using the
 * app.
 *
 * Only the server entry — never `@neondatabase/auth/react` or its UI package.
 * The install drags in captcha vendors and an analytics SDK we will not let
 * near a browser (§ D9); this entry reaches `better-auth`, `jose`, `zod` and
 * `@supabase/auth-js` and nothing else. The `Account.*` screens are ours.
 *
 * `server-only` for the same reason `db()` has it: the cookie secret must never
 * reach the browser. Importing this from a client component fails the build.
 */

/** Better Auth signs session cookies with this and refuses anything shorter. */
const MINIMUM_SECRET_LENGTH = 32;

type Configuration = { baseUrl: string; secret: string };

function configuration(): Configuration | undefined {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;

  if (!baseUrl || !secret) return undefined;
  return { baseUrl, secret };
}

/**
 * Whether this deployment has an auth service behind it at all.
 *
 * Local checkouts and the test suite have neither variable, and that has to
 * stay a working state rather than a broken one — every screen except the
 * account screens is built to never ask. The account screens ask this first and
 * say so plainly instead of throwing a stack trace at somebody.
 */
export function accountsConfigured(): boolean {
  return configuration() !== undefined;
}

let cached: NeonAuth | undefined;

function create(): NeonAuth {
  const resolved = configuration();
  if (!resolved) {
    throw new Error(
      "NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET are not set. Enable Auth " +
        "on the Neon branch and copy env.example — see README § Accounts.",
    );
  }

  if (resolved.secret.length < MINIMUM_SECRET_LENGTH) {
    throw new Error(
      `NEON_AUTH_COOKIE_SECRET must be at least ${MINIMUM_SECRET_LENGTH} ` +
        "characters. Generate one with: openssl rand -base64 32",
    );
  }

  return createNeonAuth({
    baseUrl: resolved.baseUrl,
    cookies: {
      secret: resolved.secret,
      // Neon's default. Named here because it is the window in which a signed
      // out session still looks signed in, and that is a privacy fact, not a
      // performance knob.
      sessionDataTtl: 300,
    },
  });
}

/**
 * Resolved on first use, not at import time, so a build or a unit test that
 * merely imports a module in this tree does not require an auth service to
 * exist (mirroring `db()` in ../db/client.ts).
 */
export function auth(): NeonAuth {
  cached ??= create();
  return cached;
}
