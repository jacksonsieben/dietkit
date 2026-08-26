"use server";

import { headers } from "next/headers";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db/client";
import { eraseAccount } from "@/lib/db/erasure";

import {
  MINIMUM_PASSWORD_LENGTH,
  type AccountState,
  type ErrorKey,
} from "./contract";

import { accountsConfigured, auth } from "./server";
import { RESET, SIGN_IN, allow, network } from "./throttle";
import { configurationProblem, type UpstreamError } from "./upstream";

/**
 * Everything the account screens can ask the server to do (#93).
 *
 * All of it is about the account itself. Nothing here reads a weight, a diet or
 * a set: those live in IndexedDB and never leave the device (§ D1), and once
 * sync exists they reach the server already encrypted (#95). An account is how
 * two devices find each other, not a place the data goes.
 *
 * Every failure comes back as a message key rather than a sentence, so the text
 * stays in messages/pt-BR.json with the rest of the app and the server never
 * decides what language somebody reads. It also stops an upstream error string
 * — which we do not control and which may name an internal detail — from being
 * printed to a browser.
 */

/**
 * Deliberately permissive: one `@`, something either side, no whitespace. The
 * real check is whether the verification email arrives, and a stricter pattern
 * only ever rejects an address that works.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * next-intl's redirect rather than Next's, so the path picks up a locale prefix
 * the day a second locale gets one. Today pt-BR is unprefixed and this is the
 * same string either way, which is exactly when the wrong one gets written.
 */
async function toAccount(): Promise<never> {
  // Returned rather than called as a statement so the compiler can see that
  // nothing after it runs: `redirect` throws, but an awaited call is not
  // something TypeScript treats as an end to control flow.
  return redirect({ href: "/conta", locale: await getLocale() });
}

async function source(): Promise<string> {
  return network((await headers()).get("x-forwarded-for"));
}

/** Who the cookie says this is, or nobody. Never throws at the caller. */
async function currentAccount(): Promise<
  { id: string; email: string } | undefined
> {
  try {
    const { data } = await auth().getSession();
    const user = data?.user;

    return user?.email ? { id: user.id, email: user.email } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Runs an upstream call and flattens every way it can go wrong into one key.
 *
 * A thrown error and a returned `error` are the same event to a person reading
 * the screen, and the SDK does both depending on how far the request got.
 */
async function attempt(
  run: () => Promise<{ error?: UpstreamError | null }>,
  onFailure: ErrorKey,
): Promise<AccountState> {
  try {
    const { error } = await run();
    if (!error) return { done: true };

    // Before flattening: some refusals are about this deployment rather than
    // about the person on the screen, and telling them apart is the difference
    // between a five-minute fix and somebody being told their new address
    // already has an account (./upstream.ts).
    const misconfigured = configurationProblem(error);
    if (misconfigured) {
      console.error(
        `Neon Auth refused this deployment: ${misconfigured}. Add this ` +
          `origin to the branch's trusted domains -- see .env.example.`,
      );
      return { error: "unavailable" };
    }

    return { error: onFailure };
  } catch {
    // A network failure reaching Neon, or an auth service that is not there.
    return { error: "unavailable" };
  }
}

export async function signIn(
  _state: AccountState,
  form: FormData,
): Promise<AccountState> {
  // Read before anything can refuse, because every refusal below hands it
  // back: the address is the one thing on these forms worth not losing.
  const email = field(form, "email");

  if (!accountsConfigured()) return { error: "unavailable", email };

  const password = form.get("password");

  if (!EMAIL.test(email)) return { error: "invalidEmail", email };
  if (typeof password !== "string" || password === "") {
    return { error: "credentials", email };
  }

  if (!allow({ subject: email, source: await source() }, SIGN_IN)) {
    return { error: "throttled", email };
  }

  // One key for a wrong password and for an address that has no account: the
  // difference is the answer to "does this person use this app", and this app
  // is about what somebody eats and weighs.
  const state = await attempt(
    () => auth().signIn.email({ email, password }),
    "credentials",
  );

  if (state.error) return { ...state, email };
  return toAccount();
}

export async function signUp(
  _state: AccountState,
  form: FormData,
): Promise<AccountState> {
  const email = field(form, "email");

  if (!accountsConfigured()) return { error: "unavailable", email };

  const password = form.get("password");

  if (!EMAIL.test(email)) return { error: "invalidEmail", email };
  if (
    typeof password !== "string" ||
    password.length < MINIMUM_PASSWORD_LENGTH
  ) {
    return { error: "shortPassword", email };
  }

  if (!allow({ subject: email, source: await source() }, SIGN_IN)) {
    return { error: "throttled", email };
  }

  // Better Auth wants a display name. It is not asked for and never shown:
  // § D23 lists `user.name` as a column we do not fill, and an account that
  // knows what somebody is called is a profile field by another route.
  const state = await attempt(
    () => auth().signUp.email({ email, password, name: "" }),
    "exists",
  );

  if (state.error) return { ...state, email };
  return toAccount();
}

export async function requestPasswordReset(
  _state: AccountState,
  form: FormData,
): Promise<AccountState> {
  const email = field(form, "email");

  if (!accountsConfigured()) return { error: "unavailable", email };
  if (!EMAIL.test(email)) return { error: "invalidEmail", email };

  if (!allow({ subject: email, source: await source() }, RESET)) {
    // Safe to say out loud: the counter is charged for whatever was typed,
    // real address or not, so being told to wait says nothing about whether
    // an account exists. It is the one honest answer available here, since
    // the alternative is claiming to have sent a link that was never sent.
    return { error: "throttled", email };
  }

  await attempt(
    () =>
      auth().requestPasswordReset({
        email,
        redirectTo: "/conta/redefinir",
      }),
    "unexpected",
  );

  // Always the same answer, whether or not the address has an account. "No
  // account with that email" is a membership check anybody can run.
  return { done: true };
}

export async function resetPassword(
  _state: AccountState,
  form: FormData,
): Promise<AccountState> {
  if (!accountsConfigured()) return { error: "unavailable" };

  const token = field(form, "token");
  const password = form.get("password");

  if (token === "") return { error: "invalidToken" };
  if (
    typeof password !== "string" ||
    password.length < MINIMUM_PASSWORD_LENGTH
  ) {
    return { error: "shortPassword" };
  }

  return attempt(
    () => auth().resetPassword({ token, newPassword: password }),
    "invalidToken",
  );
}

/**
 * Deletes the account: the sealed rows, the wrapped key, the record of consent,
 * and then the identity itself (#97).
 *
 * The order is the design. The data goes first, from our own database, in one
 * statement that names every table holding an `account_id`
 * (`src/lib/db/erasure.ts`); the identity goes second, upstream, where we have
 * no way to reach anything else. Reversed, a failure between the two would
 * leave sealed rows keyed to an id that no longer belongs to anybody -- rows
 * nobody can ask about, delete, or open.
 *
 * The password is checked *before* either. `signIn.email` is the check, because
 * the Neon Auth server client has no `verifyPassword`: it either succeeds or it
 * does not, and a wrong one has to stop here rather than after the data is
 * gone. It also leaves the session freshly minted, which is the state
 * `deleteUser` wants to be called in.
 *
 * Not a soft delete, and no grace period: there is no `deleted_at` on anything
 * this touches, and nothing waits for a cron.
 */
export async function deleteAccount(
  _state: AccountState,
  form: FormData,
): Promise<AccountState> {
  if (!accountsConfigured()) return { error: "unavailable" };

  const password = form.get("password");
  if (typeof password !== "string" || password === "") {
    return { error: "credentials" };
  }

  // The account comes from the session, never from the form. A body that could
  // name an account is a body that could name somebody else's.
  const account = await currentAccount();
  if (!account) return { error: "unavailable" };

  if (!allow({ subject: account.email, source: await source() }, SIGN_IN)) {
    return { error: "throttled" };
  }

  const proved = await attempt(
    () => auth().signIn.email({ email: account.email, password }),
    "credentials",
  );
  if (proved.error) return proved;

  try {
    await eraseAccount(db(), account.id);
  } catch (error) {
    // Nothing was deleted: it is one statement, so it either ran or it did not.
    console.error("Deleting an account's data failed.", error);
    return { error: "unexpected" };
  }

  const removed = await attempt(
    () => auth().deleteUser({ password }),
    "unexpected",
  );

  if (removed.error) {
    // The half-done state, said out loud rather than reported as success. The
    // likeliest cause by far is that account deletion is switched off on the
    // Neon Auth branch, which answers 404 -- a deployment problem, and one the
    // person on the screen cannot do anything about except write to us.
    console.error(
      "The account's data was deleted but the identity was not. Check that " +
        "user deletion is enabled for this Neon Auth branch.",
    );
    return { error: "identityRemains" };
  }

  // `done` rather than a redirect, because there is one more thing to do and
  // only the browser can do it: this device still holds the data key and the
  // journal for an account that no longer exists (`./excluir/DeleteForm.tsx`).
  // The upstream call already cleared the session cookie on its way out.
  return { done: true };
}

export async function signOut(): Promise<void> {
  if (accountsConfigured()) {
    try {
      await auth().signOut();
    } catch {
      // The cookie is what makes somebody signed in here. If telling the
      // upstream failed, the session still ends on this device, which is what
      // the person pressing the button asked for.
    }
  }

  await toAccount();
}
