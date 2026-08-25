import { accountsConfigured, auth } from "@/lib/auth/server";

/**
 * The account endpoints, proxied to Neon Auth (docs/DECISIONS.md § D24).
 *
 * Sign in, sign out, verify an email, reset a password. Everything here is
 * about the account itself — never about a weight, a diet or a set, which never
 * leave the device at all (§ D1) and reach the server only as ciphertext once
 * sync exists (#95).
 *
 * The segment has to be called `path`: the SDK reads `params.path` to rebuild
 * the upstream URL, so renaming it to `[...all]` gives a handler that 404s on
 * every request with nothing in the log to explain why.
 *
 * `src/proxy.ts` skips `/api`, so these routes carry no locale prefix and no
 * middleware runs in front of them.
 */

/** Cookies are read and set per request; there is nothing here to cache. */
export const dynamic = "force-dynamic";

type Handlers = ReturnType<ReturnType<typeof auth>["handler"]>;

let cached: Handlers | undefined;

function handlers(): Handlers {
  cached ??= auth().handler();
  return cached;
}

/**
 * A deployment without an auth service is a supported state, not a broken one —
 * the app is entirely usable signed out (#93). Say so with a status code
 * instead of a stack trace.
 */
const unconfigured = () =>
  new Response(null, { status: 503, headers: { "cache-control": "no-store" } });

type Method = keyof Handlers;
type Context = { params: Promise<{ path: string[] }> };

function proxy(method: Method) {
  return async (request: Request, context: Context): Promise<Response> =>
    accountsConfigured()
      ? handlers()[method](request, context)
      : unconfigured();
}

export const GET = proxy("GET");
export const POST = proxy("POST");
export const PUT = proxy("PUT");
export const PATCH = proxy("PATCH");
export const DELETE = proxy("DELETE");
