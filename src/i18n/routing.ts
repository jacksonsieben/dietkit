import { defineRouting } from "next-intl/routing";

/**
 * pt-BR is the only shipped locale (docs/DECISIONS.md § D5), but the routing is
 * real rather than stubbed: adding a locale is one entry here plus one file in
 * `messages/`.
 *
 * `localePrefix: "as-needed"` keeps the default locale on unprefixed paths, so
 * today every URL is `/perfil` rather than `/pt-BR/perfil`. That matters beyond
 * aesthetics — the service worker in #9 precaches these paths, and a prefix we
 * would have to strip back out is a cost paid for a locale that doesn't exist.
 */
export const routing = defineRouting({
  locales: ["pt-BR"],
  defaultLocale: "pt-BR",
  localePrefix: "as-needed",
});

export type AppLocale = (typeof routing.locales)[number];
