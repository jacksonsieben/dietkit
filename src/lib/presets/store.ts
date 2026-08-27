import type { PresetCopy } from "@/lib/diet/fromPreset";
import type { Repository } from "@/lib/storage";

import type { PresetCatalogBody } from "./endpoint";

/**
 * The two sides of starting from a preset that the pure copy cannot do:
 * fetching the catalogue, and writing what `copyPreset` produced (#114).
 *
 * `src/lib/import/store.ts` is the same pair for the same reason, and the one
 * place the two deliberately differ is the failure. An import that cannot
 * reach the food search still has a file to import, so it goes on with an
 * empty map and reports the gaps. There is no offline equivalent here: without
 * the catalogue there is nothing to copy, and the screen has to *say* so. A
 * device with no signal being shown an empty list would read as "there are no
 * presets", which is a false statement about the app rather than a true one
 * about the connection.
 */

/** What the fetch needs of `fetch`, so a test can hand it a function. */
type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export type PresetFetch =
  | { readonly status: "ok"; readonly catalog: PresetCatalogBody }
  /** The request never completed: no signal, or nothing listening. */
  | { readonly status: "offline" }
  /** It completed and the answer was not one: a 500, or a body we cannot read. */
  | { readonly status: "unavailable" };

/**
 * The published presets, with the compositions they need.
 *
 * One request, no query string. `/api/presets` takes no parameters on purpose —
 * a route that took `?slug=` would be a route whose access log records which
 * diet somebody picked (docs/DECISIONS.md § D23) — so the whole catalogue
 * arrives and the choosing happens on the device.
 *
 * The two failures are kept apart because they are different sentences on the
 * screen and only one of them is the user's to do anything about.
 */
export async function fetchPresetCatalog(
  request: FetchLike = fetch as unknown as FetchLike,
  signal?: AbortSignal,
): Promise<PresetFetch> {
  let response;
  try {
    response = await request("/api/presets", { signal });
  } catch {
    return { status: "offline" };
  }

  if (!response.ok) return { status: "unavailable" };

  try {
    const body = (await response.json()) as PresetCatalogBody;
    // A body that is not the shape this app asked for is the same event as a
    // 500 to the person reading the screen, and guessing at half of one is how
    // a plan gets built out of nothing.
    if (!Array.isArray(body.presets) || !Array.isArray(body.foods)) {
      return { status: "unavailable" };
    }

    return { status: "ok", catalog: body };
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * Writes the copy to the device.
 *
 * Groups first, on `applyImport`'s rule: the plan's items point at them by id,
 * and a failure part-way should leave a group nobody uses — visible in the
 * group list, removable by hand — rather than a plan with slots behind which
 * there is nothing.
 *
 * Added, never replaced. `diets.put` with a fresh id keeps whatever the user
 * was already working on, and no existing group is touched: starting from a
 * preset is one more plan, not a reset.
 */
export async function applyPresetCopy(
  repository: Repository,
  copy: PresetCopy,
): Promise<void> {
  for (const group of copy.groups) {
    await repository.substitutionGroups.put(group);
  }

  await repository.diets.put(copy.diet);
}
