import type { Repository } from "@/lib/storage";
import type {
  Diet,
  Id,
  IsoTimestamp,
  MacroSet,
  Meal,
} from "@/lib/storage/types";

/**
 * The plan as a stored record: reading the one being worked on, and writing it
 * back (#18).
 *
 * Out of the component for the reason `saveCustomFood` and `saveProfileForm`
 * are: what "the current plan" means, and what a save does to the timestamps,
 * are decisions worth a test, and neither should require rendering a screen to
 * observe.
 */

/**
 * The plan the screen opens on.
 *
 * `list()` is ordered most-recently-updated first, so this is "the one you were
 * last working on". A single diet is all #18 needs, but the store holds a list
 * because plans accumulate — the current one is picked here rather than the
 * repository being narrowed to one row, so a plan picker later is a change to
 * one screen instead of a migration.
 */
export async function loadPlan(
  repository: Repository,
): Promise<Diet | undefined> {
  const [current] = await repository.diets.list();
  return current;
}

/**
 * A plan that has never been saved.
 *
 * Built rather than written: arriving on the screen should not create a record,
 * because a user who opens it once and leaves would otherwise have a diet in
 * their store they never asked for — and on the next visit that empty plan is
 * what `loadPlan` would hand back.
 */
export function newPlan(
  identity: { id: Id; name: string },
  meals: readonly Meal[],
  targets: MacroSet,
  basedOnWeightKg: number,
  now: IsoTimestamp,
): Diet {
  return {
    ...identity,
    targets,
    meals: [...meals],
    basedOnWeightKg,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Writes the plan back with the targets it was built against.
 *
 * The targets are stored on the diet rather than recomputed from the profile
 * every time it is opened, because they are what the meals were divided from:
 * a plan whose targets silently followed a weight change would be a set of
 * meals that no longer add up to anything, and there would be nothing on screen
 * to say why. Keeping the number that was used is also what makes drift
 * visible later (#25) — `basedOnWeightKg` is the same idea for the same reason.
 */
export async function savePlan(
  repository: Repository,
  plan: Diet,
  now: IsoTimestamp,
): Promise<Diet> {
  const saved: Diet = { ...plan, updatedAt: now };
  await repository.diets.put(saved);
  return saved;
}
