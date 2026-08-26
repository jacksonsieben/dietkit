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
  /**
   * The address that was typed, handed back so a refused submit does not make
   * somebody retype it — React resets an uncontrolled form once the action
   * resolves, and an empty box is what that looks like on a phone.
   *
   * There is deliberately no password here, and there never will be. Anything
   * in this object is serialised into the response the browser gets back, and
   * a password that has already failed is not worth putting in a payload,
   * a log line or a screenshot to save one person one retype.
   */
  email?: string;
}

export type ErrorKey =
  | "credentials"
  | "exists"
  /**
   * The rare half-done state of a deletion (#97): everything this server held
   * was deleted, and the identity upstream was not. It exists as its own key
   * because the honest sentence is neither "done" nor "nothing happened", and
   * because the person needs to be told what is left and who to write to.
   */
  | "identityRemains"
  | "invalidEmail"
  | "invalidToken"
  | "shortPassword"
  | "throttled"
  | "unavailable"
  | "unexpected";

/** Better Auth's own floor. Named here so the hint on the field can quote it. */
export const MINIMUM_PASSWORD_LENGTH = 8;
