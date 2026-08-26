"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { deleteAccount } from "@/lib/auth/actions";
import type { AccountState } from "@/lib/auth/contract";
import { deviceSyncSession } from "@/lib/sync/client";

import { AccountForm } from "../AccountForm";

/**
 * The last question, and the one thing the server cannot do for itself (#97).
 *
 * `deleteAccount` deletes the sealed rows, the wrapped key, the record of
 * consent and the identity — everything that exists on a server. What it cannot
 * reach is this browser, which is still holding the data key that opened those
 * rows and a journal of writes it had not pushed yet. Both are now pointing at
 * an account that does not exist, so they go here, on the way out.
 *
 * `session.disable()` is the wrong call for it and always was: its first act is
 * to ask the vault endpoint to delete a vault, and by this point there is no
 * vault, no endpoint worth calling and no session to call it with. `forget()`
 * is the local half on its own.
 */
export function DeleteForm({ accountId }: { accountId: string }) {
  const t = useTranslations("Account");
  const router = useRouter();

  const action = useCallback(
    async (state: AccountState, form: FormData): Promise<AccountState> => {
      const result = await deleteAccount(state, form);
      if (!result.done) return result;

      try {
        await deviceSyncSession(accountId).forget();
      } catch {
        // The account is already gone; a browser that will not let go of an
        // IndexedDB record is not a reason to tell somebody their deletion
        // failed. The next sign-in clears it anyway — `state()` drops a key
        // that belongs to a different account than the one signing in.
      }

      // Back to `/conta`, which now has no session to read and draws itself
      // signed out. `replace` rather than `push`: there is nothing behind this
      // screen to go back to.
      router.replace("/conta");

      return result;
    },
    [accountId, router],
  );

  return (
    <AccountForm
      action={action}
      fields={["password"]}
      submit={t("deleteSubmit")}
      done={t("deleteDone")}
    />
  );
}
