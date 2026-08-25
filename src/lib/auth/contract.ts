/**
 * What the account forms and the account actions agree on (#93).
 *
 * Split out of `./actions.ts` because that file is a `"use server"` module and
 * one of those may only export async functions — a constant beside them is a
 * build error rather than a style opinion. Types are erased and would have been
 * fine; the password floor is not, and keeping the pair together is what stops
 * the hint on the field and the check on the server drifting apart.
 */

/** What a form gets back. `done` is for the screens that stay put on success. */
export interface AccountState {
  error?: ErrorKey;
  done?: boolean;
}

export type ErrorKey =
  | "credentials"
  | "exists"
  | "invalidEmail"
  | "invalidToken"
  | "shortPassword"
  | "throttled"
  | "unavailable"
  | "unexpected";

/** Better Auth's own floor. Named here so the hint on the field can quote it. */
export const MINIMUM_PASSWORD_LENGTH = 8;
