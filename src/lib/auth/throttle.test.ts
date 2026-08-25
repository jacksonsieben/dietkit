import { beforeEach, describe, expect, it } from "vitest";

import {
  RESET,
  SIGN_IN,
  allow,
  network,
  reset,
  type Counters,
} from "./throttle";

/**
 * The limiter is a speed bump with a specific shape, and the shape is the part
 * worth pinning: two buckets, both charged, and a window that opens on the
 * first attempt rather than sliding.
 */

let store: Counters;

beforeEach(() => {
  store = new Map();
  reset(store);
});

function attempt(subject: string, source: string, at: number): boolean {
  return allow({ subject, source }, SIGN_IN, at, store);
}

describe("the sign-in rate limit", () => {
  it("lets the allowed number of attempts through and then stops", () => {
    const results = Array.from({ length: SIGN_IN.subject.attempts + 1 }, () =>
      attempt("someone@example.test", "203.0.113.7", 0),
    );

    expect(results.slice(0, SIGN_IN.subject.attempts)).not.toContain(false);
    expect(results.at(-1)).toBe(false);
  });

  it("opens a fresh window once the old one has run out", () => {
    for (let i = 0; i < SIGN_IN.subject.attempts; i += 1) {
      attempt("someone@example.test", "203.0.113.7", 0);
    }

    expect(attempt("someone@example.test", "203.0.113.7", 0)).toBe(false);
    expect(
      attempt("someone@example.test", "203.0.113.7", SIGN_IN.subject.windowMs),
    ).toBe(true);
  });

  it("does not let one address lock out another", () => {
    for (let i = 0; i <= SIGN_IN.subject.attempts; i += 1) {
      attempt("target@example.test", "203.0.113.7", 0);
    }

    expect(attempt("someone.else@example.test", "203.0.113.8", 0)).toBe(true);
  });

  it("treats an address as the same address whatever its casing and spacing", () => {
    for (let i = 0; i < SIGN_IN.subject.attempts; i += 1) {
      attempt("Someone@Example.test", "203.0.113.7", 0);
    }

    expect(attempt("  someone@example.TEST  ", "203.0.113.7", 0)).toBe(false);
  });

  it("charges the source even when the subject is already refused", () => {
    // Otherwise a locked address is a free probe: an attacker holds one subject
    // at its limit and spends the source budget without ever paying for it.
    const spent = SIGN_IN.subject.attempts * 3;

    for (let i = 0; i < spent; i += 1) {
      attempt("target@example.test", "203.0.113.7", 0);
    }

    const remaining = SIGN_IN.source.attempts - spent;
    for (let i = 0; i < remaining; i += 1) {
      expect(attempt(`other-${i}@example.test`, "203.0.113.7", 0)).toBe(true);
    }

    expect(attempt("one.more@example.test", "203.0.113.7", 0)).toBe(false);
  });
});

describe("the reset rate limit", () => {
  it("is tighter than sign-in, because every attempt sends somebody an email", () => {
    expect(RESET.subject.attempts).toBeLessThan(SIGN_IN.subject.attempts);
    expect(RESET.source.attempts).toBeLessThan(SIGN_IN.source.attempts);
  });

  it("keeps its own count, so signing in does not spend the reset budget", () => {
    // Found by using the app: sign up, sign in wrong, sign in right, then ask
    // for a reset link and be told to wait. One counter per address meant the
    // tightest limit was charged for every attempt any of them had ever seen.
    for (let i = 0; i < SIGN_IN.subject.attempts; i += 1) {
      attempt("someone@example.test", "203.0.113.7", 0);
    }

    expect(
      allow(
        { subject: "someone@example.test", source: "203.0.113.7" },
        RESET,
        0,
        store,
      ),
    ).toBe(true);
  });
});

describe("reducing an address to a network", () => {
  it("groups an IPv4 address by its /24", () => {
    expect(network("203.0.113.7")).toBe(network("203.0.113.200"));
    expect(network("203.0.113.7")).not.toBe(network("203.0.114.7"));
  });

  it("groups an IPv6 address by its /48, not by the exact address", () => {
    // A residential v6 subscriber has more addresses than we have counters, so
    // limiting on the full address is the same as not limiting at all.
    expect(network("2001:db8:abcd:0001::1")).toBe(
      network("2001:db8:abcd:beef::9"),
    );
    expect(network("2001:db8:abcd:0001::1")).not.toBe(
      network("2001:db8:abce::1"),
    );
  });

  it("reads only the first hop, which is the only one the caller cannot forge", () => {
    expect(network("203.0.113.7, 198.51.100.1, 192.0.2.1")).toBe(
      network("203.0.113.9"),
    );
  });

  it("shares one bucket when there is no header, rather than handing out none", () => {
    expect(network(null)).toBe("unknown");
    expect(network("")).toBe("unknown");
    expect(network("  ")).toBe("unknown");
  });
});
