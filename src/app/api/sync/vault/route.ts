import { auth, accountsConfigured } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { createDatabaseVaultStore } from "@/lib/db/vault";
import { vaultError, vaultResponse } from "@/lib/sync/vault-endpoint";

/**
 * The wrapped key, and the record of what was agreed to (#96).
 *
 * Sibling of `../route.ts` and the same shape: a session, a store bound to the
 * account it names, and a body that has no way to name a different one.
 *
 * What it holds is the account's data key sealed twice — once under the
 * passphrase, once under the recovery code — and neither of those has a column
 * anywhere (docs/DECISIONS.md § D25). This handler cannot open a vault it is
 * storing any more than `../route.ts` can read a row.
 *
 * Its third action is the one that makes the privacy notice true: `delete`
 * removes every sealed row *and* the vault, and stamps the withdrawal on the
 * consent record. Turning sync off is a deletion, not a flag (#96).
 *
 * `src/proxy.ts` skips `/api`, so this carries no locale prefix.
 */

/** A session is read on every request; there is nothing here to cache. */
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  // A deployment without an auth service is a supported state (#93).
  if (!accountsConfigured()) {
    return vaultError("Accounts are not configured.", 503);
  }

  const { data } = await auth().getSession();
  const user = data?.user;
  if (!user) return vaultError("Sign in to sync.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return vaultError("Expected a JSON body.", 400);
  }

  return vaultResponse(createDatabaseVaultStore(db(), user.id), body);
}
