import type { Repository } from "@/lib/storage";
import type { IsoDate, IsoTimestamp, WeightEntry } from "@/lib/storage/types";

import type { WeightFormInput } from "./validation";

/**
 * Moving weight entries between the screen and the device's store (#23).
 *
 * Out of the component because the one rule worth stating lives here — what
 * happens when a day already has a weight — and a rule that important should
 * not only be observable by clicking Save twice in a browser. Every function
 * takes a `Repository`, so the tests run against a real adapter instead of a
 * mock that agrees with whatever the code does.
 */

/**
 * The log, newest first.
 *
 * `WeightRepository.list()` is ascending, which is the order the chart wants
 * (#24). A list of entries is read the other way round: the day you just
 * weighed yourself is the row you are looking for, and it should not be at the
 * bottom of two years of scrolling.
 */
export async function loadWeightLog(
  repository: Repository,
): Promise<WeightEntry[]> {
  const entries = await repository.weight.list();
  return entries.slice().reverse();
}

/** The entry already filed under `date`, if there is one. */
export function entryOn(
  entries: readonly WeightEntry[],
  date: IsoDate,
): WeightEntry | undefined {
  return entries.find((entry) => entry.date === date);
}

export interface SavedWeight {
  entry: WeightEntry;
  /** True when the day already had a weight and this one took its place. */
  replaced: boolean;
}

/**
 * Writes one day's weight — the answer to "what does logging the same day
 * twice do".
 *
 * It edits that day rather than stacking a second row. One weight per calendar
 * day is what makes the log a series that can be averaged (#24) and what lets
 * "my latest weight" (#25) be a single unambiguous number; two rows for a
 * Tuesday would leave every consumer picking one, and picking differently.
 *
 * The existing row's `id` is kept rather than a new one minted, so a correction
 * is the same record with a better number in it. `recordedAt` moves, because it
 * records when the value was written and the value has just been rewritten —
 * that is also what tells the two apart: `date` is the day the body was
 * weighed, `recordedAt` the moment someone typed it, and a backfilled entry has
 * every right to be days apart.
 *
 * `now` is a parameter for the usual reason: a function that reads the clock
 * cannot be tested against a specific instant.
 */
export async function saveWeightEntry(
  repository: Repository,
  input: WeightFormInput,
  now: IsoTimestamp,
): Promise<SavedWeight> {
  const existing = await repository.weight.getByDate(input.date);

  const entry: WeightEntry = {
    id: existing?.id ?? crypto.randomUUID(),
    date: input.date,
    weightKg: input.weightKg,
    // Explicitly not falling back to the old note. An edit that cleared the box
    // meant to clear it, and a note that reappeared under a new weight would be
    // describing a measurement it was never written about.
    note: input.note,
    recordedAt: now,
  };

  await repository.weight.put(entry);

  return { entry, replaced: existing !== undefined };
}

/** Deletes one entry. Nothing else refers to a weight by id, so it just goes. */
export async function removeWeightEntry(
  repository: Repository,
  id: string,
): Promise<void> {
  await repository.weight.remove(id);
}

export interface ImportedWeights {
  added: number;
  /** Days that already had a weight, now holding the file's one instead. */
  replaced: number;
}

/**
 * Writes a whole imported file (#57).
 *
 * Here rather than in the component for the same reason `saveWeightEntry` is:
 * the interesting part is what an import does to days that already have a
 * weight, and the answer has to be the same one the form gives — the day is a
 * slot, so the imported row takes it. A file is how someone brings years of
 * history over from another app, and a history that refused to overwrite would
 * quietly keep whatever three days they had typed here first.
 *
 * One `put` per row, in order, rather than a bulk write: the repository has no
 * bulk, and the number of rows is bounded by how many mornings a person has
 * stood on a scale. `replaced` is counted so the screen can say what it did
 * rather than only that it finished.
 */
export async function importWeightEntries(
  repository: Repository,
  rows: readonly WeightFormInput[],
  now: IsoTimestamp,
): Promise<ImportedWeights> {
  let added = 0;
  let replaced = 0;

  for (const row of rows) {
    const saved = await saveWeightEntry(repository, row, now);
    if (saved.replaced) replaced += 1;
    else added += 1;
  }

  return { added, replaced };
}
