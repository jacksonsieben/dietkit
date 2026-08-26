import { auth, accountsConfigured } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { createDatabaseTransport } from "@/lib/db/sync";
import { syncError, syncResponse } from "@/lib/sync/endpoint";

/**
 * The one endpoint that stores something belonging to a person (#95).
 *
 * It stores it sealed. What arrives is a nonce, a ciphertext and enough
 * bookkeeping to put the right blob on the right device; the key never leaves
 * the device (docs/DECISIONS.md § D25), so this handler cannot read a single
 * weight it is holding and neither can anybody who reaches the database behind
 * it.
 *
 * **The account id comes from the session and from nowhere else.** There is no
 * field for it in the body and `parseSyncRequest` has no branch that would read
 * one — that is the entire boundary between one person's rows and another's,
 * and it is why the transport is constructed here rather than passed in.
 *
 * `src/proxy.ts` skips `/api`, so this carries no locale prefix.
 */

/** A session is read on every request; there is nothing here to cache. */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  // A deployment without an auth service is a supported state (#93): the app is
  // entirely usable signed out, and sync is the one feature that is not.
  if (!accountsConfigured()) {
    return syncError("Accounts are not configured.", 503);
  }

  const { data } = await auth().getSession();
  const user = data?.user;
  if (!user) return syncError("Sign in to sync.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return syncError("Expected a JSON body.", 400);
  }

  return syncResponse(createDatabaseTransport(db(), user.id), body);
}
