import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getRepository, resetRepository } from ".";

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
