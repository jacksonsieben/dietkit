import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getRepository,
  installRepository,
  resetRepository,
  uninstallRepository,
} from ".";
import type { Repository } from "./repository";

afterEach(() => {
  vi.unstubAllGlobals();
  resetRepository();
});

describe("getRepository", () => {
  it("refuses to run where IndexedDB does not exist", () => {
    // Standing in for the server, where personal data must never be read.
    vi.stubGlobal("indexedDB", undefined);

    expect(() => getRepository()).toThrow(/device-only/);
  });

  it("returns one shared instance", () => {
    expect(getRepository()).toBe(getRepository());
  });

  it("builds a fresh instance after a reset", () => {
    const first = getRepository();
    resetRepository();

    expect(getRepository()).not.toBe(first);
  });
});

describe("installing a decorator", () => {
  /** Stands in for `createSyncRepository`: something that is not the adapter. */
  const wrap = (inner: Repository): Repository => ({ ...inner });

  it("hands out the decorator once it is installed", () => {
    const real = getRepository();
    const decorated = installRepository(wrap);

    expect(decorated).not.toBe(real);
    expect(getRepository()).toBe(decorated);
  });

  it("wraps the adapter, never the wrapper", () => {
    // Sync being turned off and on again, or a second provider mounting. A
    // decorator over a decorator would journal every write twice and push the
    // second copy as a conflict with itself.
    const real = getRepository();
    installRepository(wrap);

    const wrapped: Repository[] = [];
    installRepository((inner) => {
      wrapped.push(inner);
      return wrap(inner);
    });

    expect(wrapped).toHaveLength(1);
    expect(wrapped[0]).toBe(real);
  });

  it("gives the adapter back when sync is turned off", () => {
    const real = getRepository();
    installRepository(wrap);
    uninstallRepository();

    expect(getRepository()).toBe(real);
  });
});
