import { compositionFromResult } from "@/lib/diet/composition";
import { isMacroGoal } from "@/lib/energy/goal";
import { loadEnergySummary } from "@/lib/energy/summary";
import type { FoodSearchBody } from "@/lib/foods/endpoint";
import type { Repository } from "@/lib/storage";
import type { FoodComposition, IsoDate } from "@/lib/storage/types";

import type { ImportBody, ImportResult } from "./import";

/**
 * The three sides of the import the pure part cannot do: fetching the TACO rows
 * it needs, reading the body it is built for, and writing what it produced
 * (#22, #123).
 *
 * `importPlan` is a function from a file to records and takes no I/O, which is
 * what makes it testable at all. That leaves these jobs here, and they are
 * worth their own module for the same reason `plan.ts` and `groupStore.ts` are:
 * what an import reads and what it writes are decisions, not details of a
 * screen.
 */

/** What the fetch needs of `fetch`, so a test can hand it a function. */
type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal },
) => Promise<{
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

/**
 * What the device already holds that the user should hear about first.
 *
 * One field, since #123: an import writes a plan, some foods and some groups,
 * and nothing else. It used to replace the profile and the goal too, which is
 * what this type existed to warn about — now there is nothing personal to
 * overwrite, and the only thing left to say is how many plans the new one is
 * joining. Kept as a record rather than flattened to a number because what an
 * import touches is exactly the kind of thing that grows again.
 */
export interface ImportConflicts {
  /** Plans already stored. The import adds one; it never replaces these. */
  readonly diets: number;
}

/** Read before the confirm step, so the screen can say what is about to change. */
export async function importConflicts(
  repository: Repository,
): Promise<ImportConflicts> {
  const diets = await repository.diets.list();
  return { diets: diets.length };
}

/**
 * The body the import will size its plan against, or the screen the user has
 * to fill first.
 *
 * `missing` is a first-class answer here for the same reason it is in
 * `loadEnergySummary`, and then one reason more: arriving at the import screen
 * on a brand-new device is not just ordinary, it is the *likely* path — someone
 * whose only DietKit data is a file from the old app. Refusing them, in words,
 * with the screen to open, is the whole of #123's user-facing half. The
 * alternative is falling back to the numbers in the file, which are the numbers
 * we stopped trusting.
 *
 * The goal is read straight rather than through `loadGoal`, which never reports
 * a missing one: it substitutes `DEFAULT_MACRO_GOAL`, which is right for a
 * screen that has to show something and wrong here, where a maintenance preset
 * nobody chose would be silently baked into an imported plan.
 */
export type ImportBodyState =
  | { status: "ready"; body: ImportBody }
  | { status: "missing"; needs: "profile" | "weight" | "goal" };

export async function loadImportBody(
  repository: Repository,
  today: IsoDate,
): Promise<ImportBodyState> {
  const [energy, settings] = await Promise.all([
    loadEnergySummary(repository, today),
    repository.settings.get(),
  ]);

  if (energy.status === "missing") {
    return { status: "missing", needs: energy.needs };
  }
  if (!isMacroGoal(settings.goal)) {
    return { status: "missing", needs: "goal" };
  }

  return {
    status: "ready",
    body: {
      totalDailyEnergyExpenditure: energy.summary.totalDailyEnergyExpenditure,
      weightKg: energy.summary.weightKg,
      goal: settings.goal,
    },
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
 * The plan is added, not merged: `diets.put` with a fresh id keeps whatever the
 * user was already working on. Nothing else on the device is touched — no
 * profile, no weighing, no goal (#123). What the file actually knows is which
 * foods were on the plate and how they were grouped; the body it also carries
 * is years out of date, and the device has a current one.
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
}
