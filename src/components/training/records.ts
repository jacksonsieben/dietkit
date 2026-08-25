import type { useTranslations } from "next-intl";

import type { ReadSet, RecordKind } from "@/lib/training/history";

/**
 * How a set and a record are worded (#81).
 *
 * Out of both screens because both say it: the history screen lists the three
 * records, and the finish says which of them the session just broke. Two
 * copies of "the rep record has to name the load it was done at" is one copy
 * too many — that rule is the difference between a record and a number.
 *
 * `messages/` does the words and this does the choosing between them, which is
 * the only part with a decision in it: whether a movement is read per side,
 * and whether there is a load to name at all.
 */

/**
 * The namespace's own translator type, borrowed rather than re-declared.
 *
 * A hand-written `(key: string) => string` would compile and would quietly give
 * up the thing that makes these messages safe: a key that is not in
 * `messages/pt-BR.json` is a type error, not a string printed on a screen.
 */
export type Translate = ReturnType<typeof useTranslations<"Training.history">>;

/**
 * The estimate, always naming the set it came from.
 *
 * "137 kg estimado" on its own is not a claim anybody can check. Off a single
 * it is very nearly a measurement, off a set of twelve it is the far end of a
 * formula, and the reader is owed the difference.
 */
export function estimateFrom(
  set: ReadSet,
  unilateral: boolean,
  t: Translate,
): string {
  return t(unilateral ? "estimateFromPerSide" : "estimateFrom", {
    estimate: set.estimateKg ?? 0,
    load: set.loadKg ?? 0,
    reps: set.reps,
  });
}

/** One set, in the terms the movement is done in. */
export function setLine(
  set: ReadSet,
  unilateral: boolean,
  t: Translate,
): string {
  if (set.loadKg === undefined) {
    return t(unilateral ? "records.repsPerSide" : "records.reps", {
      reps: set.reps,
    });
  }

  return t(unilateral ? "records.loadPerSide" : "records.load", {
    load: set.loadKg,
    reps: set.reps,
  });
}

/**
 * A record, in the words its kind deserves.
 *
 * The rep record names the load it was done at, because "14 repetições" alone
 * is not a record: fourteen at sixty kilos and fourteen at twenty are not the
 * same achievement and only one of them belongs on the list.
 */
export function recordLine(
  kind: RecordKind,
  held: ReadSet,
  unilateral: boolean,
  t: Translate,
): string {
  if (kind === "bestEstimate") return estimateFrom(held, unilateral, t);

  if (kind === "mostReps" && held.loadKg !== undefined) {
    return t(unilateral ? "records.repsAtPerSide" : "records.repsAt", {
      reps: held.reps,
      load: held.loadKg,
    });
  }

  return setLine(held, unilateral, t);
}
