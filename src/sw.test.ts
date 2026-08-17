import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");

const OFFLINE_URL = "/~offline";

function read(file: string) {
  return fs.readFileSync(path.join(ROOT, file), "utf-8");
}

/**
 * The offline fallback only works if three files that never import each other
 * happen to name the same URL: the worker's `fallbacks` entry, the precache
 * entry that puts a copy of that page in the cache before it is ever needed,
 * and the route that actually renders it. Rename any one of them and nothing
 * fails — until a plane, where the fallback resolves to a page the cache does
 * not have and the user gets the browser's dinosaur instead.
 */
describe("offline fallback wiring", () => {
  it("has a route to fall back to", () => {
    const route = path.join(
      ROOT,
      "src/app/[locale]",
      OFFLINE_URL.slice(1),
      "page.tsx",
    );

    expect(fs.existsSync(route), `${OFFLINE_URL} has no page.tsx`).toBe(true);
  });

  it("is the URL the service worker serves for failed navigations", () => {
    // Read as text rather than imported: `src/sw.ts` is written against the
    // service worker global scope, so evaluating it here would throw.
    expect(read("src/sw.ts")).toContain(`url: "${OFFLINE_URL}"`);
  });

  it("is precached, so it exists before the network is gone", () => {
    expect(read("serwist.config.mjs")).toContain(`url: "${OFFLINE_URL}"`);
  });
});
