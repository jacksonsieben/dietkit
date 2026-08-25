import { createHash, randomBytes } from "node:crypto";

/**
 * The rate limit on sign-in and password reset (#93).
 *
 * Neon Auth's beta has no built-in rate limiting, so this is ours. It is a
 * fixed window in the process's own memory, and the honest description is that
 * it is a speed bump rather than a wall: Fluid Compute runs several instances,
 * each with its own counters, so the real ceiling is the limit times however
 * many instances happen to be warm.
 *
 * It stays in memory on purpose. The alternative is a table, and a table of
 * "this address tried to sign in at this time" is exactly the record
 * docs/DECISIONS.md § D23 says the server may not hold — `src/lib/db/
 * boundary.test.ts` would reject a column named `ip` or `email`, and it would
 * be right to. A counter that dies with the instance is not a log.
 *
 * Two buckets rather than one, because they fail differently. A per-address
 * limit alone lets anybody lock a stranger out of their own account by getting
 * their password wrong five times; a per-network limit alone lets a slow attack
 * spread across enough addresses to never trip it. Neither is sufficient and
 * both are cheap.
 */

/**
 * Salted per process, so a counter key cannot be turned back into an email
 * address or an address block by anybody who gets a heap dump. Random rather
 * than configured: nothing needs these keys to survive a restart, and a fixed
 * salt would make them comparable across deployments.
 */
const SALT = randomBytes(32);

function key(kind: string, value: string): string {
  return createHash("sha256")
    .update(SALT)
    .update(`${kind}:${value.trim().toLowerCase()}`)
    .digest("base64url");
}

export interface Limit {
  /** How many attempts the window allows. */
  readonly attempts: number;
  /** How long the window is, in milliseconds. */
  readonly windowMs: number;
}

const MINUTE = 60_000;

/**
 * Sign-in is generous per address and tight per network. Somebody who has
 * genuinely forgotten which password they used gets ten tries in ten minutes;
 * a script working through a list gets a hundred requests an hour from one
 * place, which is not enough to be worth building.
 */
export const SIGN_IN: { subject: Limit; source: Limit } = {
  subject: { attempts: 10, windowMs: 10 * MINUTE },
  source: { attempts: 100, windowMs: 60 * MINUTE },
};

/**
 * Reset is tight everywhere, because every attempt sends an email to somebody
 * who did not ask for one. Three an hour per address is more than anybody needs
 * and few enough that the inbox stays usable.
 */
export const RESET: { subject: Limit; source: Limit } = {
  subject: { attempts: 3, windowMs: 60 * MINUTE },
  source: { attempts: 20, windowMs: 60 * MINUTE },
};

interface Window {
  count: number;
  /** When the window opened, so the whole thing expires at once. */
  openedAt: number;
}

/** Exported for the test, which needs a store it can reason about. */
export type Counters = Map<string, Window>;

const counters: Counters = new Map();

/**
 * Dropped whenever the map is consulted, which is often enough: nothing else
 * runs on a schedule here, and an expired window costs one entry until then.
 */
function sweep(store: Counters, now: number): void {
  for (const [name, window] of store) {
    if (now - window.openedAt >= 60 * MINUTE) store.delete(name);
  }
}

function take(
  store: Counters,
  name: string,
  limit: Limit,
  now: number,
): boolean {
  const window = store.get(name);

  if (!window || now - window.openedAt >= limit.windowMs) {
    store.set(name, { count: 1, openedAt: now });
    return true;
  }

  if (window.count >= limit.attempts) return false;

  window.count += 1;
  return true;
}

export interface Request {
  /** What is being protected: the email address somebody is signing in as. */
  subject: string;
  /** Where it came from, already reduced to a network — see `network()`. */
  source: string;
}

/**
 * Whether this attempt may proceed, counting it if so.
 *
 * Both buckets are charged even when the first one refuses, so an attacker
 * cannot use a locked subject as a free probe of the source counter.
 */
export function allow(
  request: Request,
  limits: { subject: Limit; source: Limit },
  now: number = Date.now(),
  store: Counters = counters,
): boolean {
  sweep(store, now);

  const subject = take(
    store,
    key("subject", request.subject),
    limits.subject,
    now,
  );
  const source = take(store, key("source", request.source), limits.source, now);

  return subject && source;
}

/**
 * The caller's address, reduced to a network and never stored.
 *
 * A /24 for IPv4 and a /48 for IPv6, which is roughly "one connection" in both:
 * limiting on the exact address is defeated by any residential v6 allocation,
 * where a single subscriber has more addresses than we have counters.
 *
 * Returns a constant when there is no forwarded-for header, so a local run
 * shares one bucket rather than getting an unlimited one.
 */
export function network(forwardedFor: string | null): string {
  const first = forwardedFor?.split(",")[0]?.trim();
  if (!first) return "unknown";

  if (first.includes(":")) return first.split(":").slice(0, 3).join(":");
  return first.split(".").slice(0, 3).join(".");
}

/** For the test, which must not inherit counts from the test before it. */
export function reset(store: Counters = counters): void {
  store.clear();
}
