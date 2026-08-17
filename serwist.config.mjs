import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { serwist } from "@serwist/next/config";

/**
 * Builds `public/sw.js` from `src/sw.ts`, after `next build` has produced the
 * assets it needs to list.
 *
 * This is Serwist's "configurator" mode rather than the `withSerwist` webpack
 * plugin the docs lead with. The plugin hooks Next's webpack config, and Next
 * 16 builds with Turbopack — `@serwist/next` prints a warning and produces no
 * service worker at all. Compiling the worker as a separate esbuild step after
 * the Next build sidesteps the bundler question entirely.
 */
// `||`, not `??`: a `git` that is absent (Vercel's build container) exits with
// an empty stdout rather than a missing one, and an empty revision would pin
// the precache to a version that never changes.
const revision =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  randomUUID();

export default serwist({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",

  // The prerendered HTML on disk is named by the locale segment — `/pt-BR`,
  // `/pt-BR/fontes` — but the app is served from unprefixed URLs, because
  // `localePrefix` is `as-needed` (src/i18n/routing.ts). Precaching those files
  // would fill the cache with URLs no request ever asks for, so the two pages
  // that have to survive a cold start are named directly instead and fetched
  // through the proxy, the same way a browser would.
  precachePrerendered: false,
  additionalPrecacheEntries: [
    { url: "/", revision },
    { url: "/~offline", revision },
  ],
});
