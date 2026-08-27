import { db } from "@/lib/db/client";
import { dietPresetCatalog } from "@/lib/db/presets";
import { presetCatalogResponse } from "@/lib/presets/endpoint";

/**
 * The diet presets, as published (#114).
 *
 * Reference data in both directions, and more one-sided than food search is:
 * the request carries nothing at all — no query, no id, no session — and the
 * response is the same for every device that asks. Nothing on this path can
 * reach a profile, a weight or a diet, which live in IndexedDB and have no
 * route to a server (docs/DECISIONS.md § D1).
 *
 * Deliberately unmeasured. There is no counter, no per-preset endpoint and
 * nothing tying a fetch to a person: § D23 is the published list of what this
 * server learns, and this route adds no line to it. The platform records the
 * address like any other request, which is why the address names no preset.
 *
 * Not cached by Next — route handlers no longer are by default — but cacheable
 * downstream, which is what the `cache-control` in `presetCatalogResponse` is
 * for.
 */
export async function GET() {
  return presetCatalogResponse(() => dietPresetCatalog(db()));
}
