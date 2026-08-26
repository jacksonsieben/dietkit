import {
  deviceEnrollment,
  deviceJournal,
  installRepository,
  uninstallRepository,
} from "@/lib/storage";
import { LEGAL_EFFECTIVE_DATE } from "@/lib/legal";

import { createSyncRepository } from "./repository";
import { createSyncSession, type SyncSession } from "./session";
import { createHttpTransport } from "./transport.http";
import { createHttpVaultClient } from "./vault-transport.http";

/**
 * The session as the browser actually gets one (#96).
 *
 * Everything in `./session.ts` takes its collaborators as arguments so that it
 * can be tested against memory doubles. This is the one file that names the
 * real ones, and it is deliberately the whole of the wiring: IndexedDB for the
 * journal and the key, `fetch` for the rows and the vault, and the seam in
 * `src/lib/storage` for the decorator.
 *
 * Memoised per account, because a React screen builds this on every render and
 * two sessions over one journal would push the same record twice. Signing into
 * a different account on the same device replaces it, and `state()` on the new
 * one is what clears the old key -- see `session.ts`.
 */

let cached: { accountId: string; session: SyncSession } | undefined;

export function deviceSyncSession(accountId: string): SyncSession {
  if (cached?.accountId === accountId) return cached.session;

  const journal = deviceJournal();
  const transport = createHttpTransport();

  const session = createSyncSession({
    accountId,
    notice: LEGAL_EFFECTIVE_DATE,
    vaults: createHttpVaultClient(),
    enrollment: deviceEnrollment(),
    journal,
    install: installRepository,
    uninstall: uninstallRepository,
    decorate: ({ inner, dataKey, deviceId }) =>
      createSyncRepository({ inner, journal, transport, dataKey, deviceId }),
  });

  cached = { accountId, session };
  return session;
}
