import { compositionFromResult } from "@/lib/diet/composition";
import type { FoodSearchBody } from "@/lib/foods/endpoint";
import type { Repository } from "@/lib/storage";
import type { FoodComposition } from "@/lib/storage/types";

import type { ImportResult } from "./import";

/**
 * The two sides of the import the pure part cannot do: fetching the TACO rows
 * it needs, and writing what it produced (#22).
 *
 * `importPlan` is a function from a file to records and takes no I/O, which is
 * what makes it testable at all. That leaves two jobs here, and they are worth
 * their own module for the same reason `plan.ts` and `groupStore.ts` are: what
 * an import overwrites is a decision, not a detail of a screen.
 */

/** What the fetch needs of `fetch`, so a test can hand it a function. */
type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean;
  json: () => Promise<unknown>;
}>;

/**
 * The compositions for the rows the catalogue can reach, by id.
 *
 * An empty map on any failure rather than a thrown error: the import is still
 * worth doing offline. Every row that did not arrive becomes a
 * `compositionMissing` note and an item the plan screen shows as unresolved,
 * which is the same state a plan written on a plane is already in — and it is
 * the honest one. Filling those grams in from anywhere else would be inventing
 * the numbers this whole app exists to quote.
 */
export async function fetchCompositions(
  ids: readonly number[],
  request: FetchLike = fetch as unknown as FetchLike,
  signal?: AbortSignal,
): Promise<ReadonlyMap<number, FoodComposition>> {
  const found = new Map<number, FoodComposition>();
  if (ids.length === 0) return found;

  try {
    const response = await request(`/api/foods?ids=${ids.join(",")}`, {
      signal,
    });
    if (!response.ok) throw new Error(String(response.ok));

    const body = (await response.json()) as FoodSearchBody;
    for (const result of body.foods) {
      const composition = compositionFromResult(result);
      // A row TACO withheld the macros of is a row this app cannot put in a
      // plan — `compositionFromResult` says why. Leaving it out of the map is
      // what turns it into a `compositionMissing` note instead of a zero.
      if (composition) found.set(composition.tacoId, composition);
    }
  } catch {
    return new Map();
  }

  return found;
}

/** What is already on the device that an import would replace. */
export interface ImportConflicts {
  readonly profile: boolean;
  readonly goal: boolean;
  /** Plans already stored. The import adds one; it never replaces these. */
  readonly diets: number;
}

/**
 * Read before the confirm step, so the screen can say what is about to change.
 *
 * Asked of the repository rather than assumed from an empty-store default,
 * because the one irreversible thing an import does is overwrite the profile
 * and the goal — and a user who has been using this app for a month and then
 * imports an old file is exactly the person who needs to be told that first.
 */
export async function importConflicts(
  repository: Repository,
): Promise<ImportConflicts> {
  const [profile, settings, diets] = await Promise.all([
    repository.profile.get(),
    repository.settings.get(),
    repository.diets.list(),
  ]);

  return {
    profile: profile !== undefined,
    goal: settings.goal !== undefined,
    diets: diets.length,
  };
}

/**
 * Writes an import to the device.
 *
 * The order is the one that never leaves a record pointing at something that
 * is not there yet: the foods and the groups the plan's items refer to go in
 * before the plan does. A failure part-way then leaves foods nobody uses —
 * visible in "meus alimentos", removable by hand — rather than a plan with
 * holes in it.
 *
 * The plan is added, not merged: `diets.put` with a fresh id keeps whatever
 * the user was already working on. The profile and the goal are replaced,
 * because there is only one of each and the file is the user saying which one
 * they mean; `importConflicts` is how they are told before it happens.
 */
export async function applyImport(
  repository: Repository,
  result: ImportResult,
): Promise<void> {
  for (const food of result.customFoods) {
    await repository.customFoods.put(food);
  }
  for (const group of result.groups) {
    await repository.substitutionGroups.put(group);
  }

  await repository.diets.put(result.diet);
  await repository.weight.put(result.weight);
  await repository.profile.save(result.profile);
  await repository.settings.patch({ goal: result.goal });
}
