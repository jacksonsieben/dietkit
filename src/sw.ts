/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

/**
 * The service worker.
 *
 * Not bundled by Next: `serwist build` compiles this file with esbuild after
 * `next build` and writes `public/sw.js` (see `serwist.config.mjs`). That split
 * is deliberate — the webpack plugin the Serwist docs lead with does not work
 * under Turbopack, which is Next 16's default bundler.
 *
 * Offline is not a nice-to-have here. Everything personal already lives in
 * IndexedDB on this device (docs/DECISIONS.md § D1), so an app that goes blank
 * without a network is hiding data the user is standing on top of.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Filled in at build time with the precache manifest.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // The device holds the only copy of the user's data, so a half-updated app
  // is a worse risk than an abrupt one: take over as soon as a new version
  // lands rather than leaving two versions writing to the same database.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
