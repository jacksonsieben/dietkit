"use server";

import { headers } from "next/headers";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

import {
  MINIMUM_PASSWORD_LENGTH,
  type AccountState,
  type ErrorKey,
} from "./contract";

import { accountsConfigured, auth } from "./server";
import { RESET, SIGN_IN, allow, network } from "./throttle";

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

/**
 * Runs an upstream call and flattens every way it can go wrong into one key.
 *
 * A thrown error and a returned `error` are the same event to a person reading
 * the screen, and the SDK does both depending on how far the request got.
 */
async function attempt(
  run: () => Promise<{ error?: { message?: string } | null }>,
  onFailure: ErrorKey,
): Promise<AccountState> {
  try {
    const { error } = await run();
    return error ? { error: onFailure } : { done: true };
  } catch {
    // A network failure reaching Neon, or an auth service that is not there.
    return { error: "unavailable" };
  }
}

export async function signIn(
  _state: AccountState,
  form: FormData,
): Promise<AccountState> {
  if (!accountsConfigured()) return { error: "unavailable" };

  const email = field(form, "email");
  const password = form.get("password");

  if (!EMAIL.test(email)) return { error: "invalidEmail" };
  if (typeof password !== "string" || password === "") {
    return { error: "credentials" };
  }

  if (!allow({ subject: email, source: await source() }, SIGN_IN)) {
    return { error: "throttled" };
  }

  // One key for a wrong password and for an address that has no account: the
  // difference is the answer to "does this person use this app", and this app
  // is about what somebody eats and weighs.
  const state = await attempt(
    () => auth().signIn.email({ email, password }),
    "credentials",
  );

  if (state.error) return state;
  return toAccount();
}

export async function signUp(
  _state: AccountState,
  form: FormData,
): Promise<AccountState> {
  if (!accountsConfigured()) return { error: "unavailable" };

  const email = field(form, "email");
  const password = form.get("password");

  if (!EMAIL.test(email)) return { error: "invalidEmail" };
  if (
    typeof password !== "string" ||
    password.length < MINIMUM_PASSWORD_LENGTH
  ) {
    return { error: "shortPassword" };
  }

  if (!allow({ subject: email, source: await source() }, SIGN_IN)) {
    return { error: "throttled" };
  }

  // Better Auth wants a display name. It is not asked for and never shown:
  // § D23 lists `user.name` as a column we do not fill, and an account that
  // knows what somebody is called is a profile field by another route.
  const state = await attempt(
    () => auth().signUp.email({ email, password, name: "" }),
    "exists",
  );

  if (state.error) return state;
  return toAccount();
}

export async function requestPasswordReset(
  _state: AccountState,
  form: FormData,
): Promise<AccountState> {
  if (!accountsConfigured()) return { error: "unavailable" };

  const email = field(form, "email");
  if (!EMAIL.test(email)) return { error: "invalidEmail" };

  if (!allow({ subject: email, source: await source() }, RESET)) {
    // Safe to say out loud: the counter is charged for whatever was typed,
    // real address or not, so being told to wait says nothing about whether
    // an account exists. It is the one honest answer available here, since
    // the alternative is claiming to have sent a link that was never sent.
    return { error: "throttled" };
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
