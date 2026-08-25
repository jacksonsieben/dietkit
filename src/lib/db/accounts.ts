/**
 * What Neon Auth is allowed to keep, and the reason next to each column.
 *
 * Neon Auth is a **managed beta**. Its schema is created and upgraded by Neon,
 * not by our migrations, so it can grow a column in a release we did not
 * perform and would not be told about. This list is the expectation that turns
 * such a change from a quiet expansion of what the server knows into something
 * a person has to read and sign off — a `full_name` appearing upstream should
 * fail before it holds anybody's name.
 *
 * It is checked in two places, because neither is sufficient alone:
 *
 *  - `boundary.test.ts` runs it against the PGlite fixture, where `neon_auth`
 *    is empty. That check is vacuous today and stays honest anyway: it is a
 *    subset check, so it fires the moment anything appears there.
 *  - `scripts/db/audit-accounts.ts` runs it against a real Neon branch, which
 *    is the only place the real schema exists. CI has no branch to point it at,
 *    so this is a command somebody runs — see README § Reference database.
 *
 * The names are camelCase, unlike everything in `public`. That is Better Auth's
 * convention and it is quoted in the DDL, so `user.emailVerified` is a distinct
 * identifier from `emailverified`. Written the way the catalog reports it.
 *
 * The whole point of this file is docs/DECISIONS.md § D23: the account exists
 * to move encrypted rows between devices, so the server may know an address, a
 * password hash and how many devices are signed in, and nothing else. Anything
 * about a weight, a diet or a set lives in IndexedDB and reaches the server as
 * ciphertext (#95) or not at all.
 */

/**
 * Tables the platform provisions that no screen in this app writes to.
 *
 * We use four: `user`, `session`, `account`, `verification`. These three arrive
 * with the organization plugin, which Neon enables platform-wide and this app
 * has no screen for. They are listed rather than excused because one of them,
 * `invitation.email`, would hold a *third party's* address: somebody who never
 * used this app at all. The audit counts their rows rather than trusting that
 * sentence — which is how `jwks` came off this list: Neon generates a signing
 * key pair, so that table has a row in it and "unused" was our word, not a
 * fact.
 */
export const UNUSED_TABLES = ["invitation", "member", "organization"] as const;

/** Every column, as `table.column`, that may exist in `neon_auth`. */
export const NEON_AUTH_COLUMNS = new Set([
  // user — one row per account. Its email is the whole of what § D23 permits.
  "user.id", // Opaque server-generated key. Names nothing about the person.
  "user.email", // The identifier, and the only personal field D23 allows.
  "user.emailVerified", // Whether the address was confirmed. A boolean.
  "user.name", // Required by Better Auth and written as "". Never asked for,
  // never shown: an account that knows what somebody is called is a profile
  // field by another route (src/lib/auth/actions.ts).
  "user.image", // For social avatars. There is no social login.
  "user.createdAt", // When the account was made.
  "user.updatedAt", // When the row last changed.
  // The four below are the admin plugin's, enabled by Neon rather than by us.
  // Nothing in this app writes them, and `role` being null is what "everybody
  // is the same kind of user here" looks like in the database.
  "user.role",
  "user.banned",
  "user.banReason",
  "user.banExpires",

  // session — one row per signed-in device, which is where "how many devices"
  // in § D23 comes from. Also where Better Auth's schema costs the most.
  "session.id", // Opaque key.
  "session.userId", // Which account. The join, nothing more.
  "session.token", // The session secret. Rotated, expiring, never exported.
  "session.expiresAt", // When it stops working.
  "session.ipAddress", // Personal data under the GDPR. Declared in #98.
  "session.userAgent", // Same: declared rather than quietly excused.
  "session.createdAt",
  "session.updatedAt",
  // Admin and organization plugins again. `impersonatedBy` is the honest one:
  // the platform can, by design, mint a session on a user's behalf, and this
  // column is where that would be recorded. It is also why end-to-end
  // encryption is the load-bearing control and the login is not (#94): a
  // session obtained any way at all still only reaches ciphertext.
  "session.impersonatedBy",
  "session.activeOrganizationId",

  // account — the credential itself, one row per sign-in method.
  "account.id", // Opaque key.
  "account.userId", // Which account.
  "account.accountId", // The identifier at the provider. For us, the user id.
  "account.providerId", // Which method. `credential` for email + password.
  "account.password", // A hash of the sign-in password. Never the sync
  // passphrase, which has no column anywhere on the server (#94).
  "account.accessToken", // OAuth fields, unused while there is no OAuth.
  "account.refreshToken",
  "account.idToken",
  "account.accessTokenExpiresAt",
  "account.refreshTokenExpiresAt",
  "account.scope",
  "account.createdAt",
  "account.updatedAt",

  // verification — short-lived proofs: address confirmation, password reset.
  "verification.id", // Opaque key.
  "verification.identifier", // What is being proven. An email address.
  "verification.value", // The one-time secret. Deleted once used.
  "verification.expiresAt", // Short. That is the point of the table.
  "verification.createdAt",
  "verification.updatedAt",

  // invitation — the organization plugin's, and the only unused table that
  // holds personal data if it is ever written to. It is not: there is no
  // organization in this app to be invited to. Asserted empty by the audit.
  "invitation.id",
  "invitation.organizationId",
  "invitation.email",
  "invitation.role",
  "invitation.status",
  "invitation.expiresAt",
  "invitation.createdAt",
  "invitation.inviterId",

  // jwks — the signing keys for the tokens Better Auth issues. Written by the
  // service itself, so this table is not empty. Not personal data either way;
  // `privateKey` is a server secret and never leaves Neon.
  "jwks.id",
  "jwks.publicKey",
  "jwks.privateKey",
  "jwks.createdAt",
  "jwks.expiresAt",

  // member, organization — the rest of the organization plugin. Unused, empty.
  "member.id",
  "member.organizationId",
  "member.userId",
  "member.role",
  "member.createdAt",
  "organization.id",
  "organization.name",
  "organization.slug",
  "organization.logo",
  "organization.createdAt",
  "organization.metadata",

  // project_config — our own settings, in snake_case because it is Neon's
  // table rather than Better Auth's: which origins may be redirected to, which
  // sign-in methods are on, who sends the email. One row, no person in it.
  "project_config.id",
  "project_config.name",
  "project_config.endpoint_id",
  "project_config.created_at",
  "project_config.updated_at",
  "project_config.trusted_origins",
  "project_config.social_providers",
  "project_config.email_provider",
  "project_config.email_and_password",
  "project_config.allow_localhost",
  "project_config.plugin_configs",
  "project_config.webhook_config",
]);

export interface Drift {
  /** Present upstream, named nowhere above. The failure that matters. */
  unexplained: string[];
  /** Named above, absent upstream. A stale list, or a schema that shrank. */
  missing: string[];
}

/**
 * Compares what a database actually has against what this file says it may.
 *
 * Both directions, because they mean different things. An unexplained column
 * is the server holding something nobody declared; a missing one is this file
 * describing a database that no longer exists, which is how a list like this
 * rots into a comment. Only the caller knows which of the two it can act on —
 * the PGlite fixture is legitimately missing all of them.
 */
export function compare(present: readonly string[]): Drift {
  const seen = new Set(present);

  return {
    unexplained: present
      .filter((column) => !NEON_AUTH_COLUMNS.has(column))
      .sort(),
    missing: [...NEON_AUTH_COLUMNS]
      .filter((column) => !seen.has(column))
      .sort(),
  };
}
