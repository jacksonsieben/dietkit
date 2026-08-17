import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";

import { routing, type AppLocale } from "./routing";

/**
 * Narrows a raw `[locale]` segment to a configured locale.
 *
 * The segment behaves like a catch-all — `/unknown.txt` arrives here as a
 * "locale" — so an unrecognised value is a 404, not a cue to fall back to the
 * default and render a page at a URL that shouldn't exist.
 */
export function resolveLocale(segment: string): AppLocale {
  if (!hasLocale(routing.locales, segment)) {
    notFound();
  }

  return segment;
}
