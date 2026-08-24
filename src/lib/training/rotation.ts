import type { IsoTimestamp, TrainingRotation } from "@/lib/storage/types";

import { splitBySlug, type Split, type SplitDay } from "./splits";

/**
 * Where you are in a split, and what moves you along it (#78).
 *
 * A rotation, not a calendar. The app knows which split is being run and which
 * of its days has not been done yet; finishing a session moves that pointer on
 * by one and wraps at the end. Nothing here knows what day of the week it is,
 * which is the whole design: a weekday schedule has to decide what a missed
 * Tuesday means, and every answer to that — skip it, push everything, mark it
 * late — is wrong for somebody. A rotation has no opinion about the gap. You
 * were on B before the flu and you are on B after it.
 *
 * Pure, and takes the clock as an argument, so the rule can be read and tested
 * without a device. The split itself comes from `splits.ts`, which is reference
 * data shipped in the bundle; the two facts on the device are a slug and an
 * index (docs/DECISIONS.md § D18).
 */

/** Where the rotation starts on the day a split is chosen: at its first day. */
const FIRST_DAY = 0;

export interface CurrentSession {
  /** The day of the split that has not been done yet. */
  readonly day: SplitDay;
  /** Its position, zero-based, for "treino 2 de 4". */
  readonly index: number;
  readonly split: Split;
}

/**
 * The split a rotation names, or nothing.
 *
 * `undefined` covers a slug this build has dropped — a device holds whatever it
 * was last given, and a build that renamed a split would otherwise be a screen
 * that fails to load in a gym. The caller renders it as "choose again".
 */
export function rotationSplit(rotation: TrainingRotation): Split | undefined {
  return splitBySlug(rotation.splitSlug);
}

/**
 * The session that is next, given a rotation and the split it names.
 *
 * The index is wrapped rather than trusted. `nextDay` is a number off a device
 * and the split beside it is whatever this build ships: a split that has been
 * shortened between two releases would otherwise point past its own last day,
 * and the honest recovery is the one the rotation already does every week —
 * come back round to the start. Refusing to render would throw away the
 * choice over an off-by-one nobody made.
 */
export function currentSession(
  rotation: TrainingRotation,
  split: Split,
): CurrentSession {
  const index = wrap(rotation.nextDay, split.days.length);
  return { day: split.days[index]!, index, split };
}

/** A rotation for a split just chosen, at its first day, never finished. */
export function startRotation(
  splitSlug: string,
  now: IsoTimestamp,
): TrainingRotation {
  return { splitSlug, nextDay: FIRST_DAY, updatedAt: now };
}

/**
 * The rotation after a session is finished: one day on, and stamped.
 *
 * Counted from the day `currentSession` resolved rather than from the raw
 * stored number — the same reading the screen was showing — so the two can
 * never disagree about which session was just finished. The result is wrapped
 * on the way out too, which is what makes the last day of a split lead back to
 * the first instead of off the end.
 */
export function advanceRotation(
  rotation: TrainingRotation,
  split: Split,
  now: IsoTimestamp,
): TrainingRotation {
  const { index } = currentSession(rotation, split);

  return {
    splitSlug: rotation.splitSlug,
    nextDay: wrap(index + 1, split.days.length),
    lastFinishedAt: now,
    updatedAt: now,
  };
}

/**
 * The day's name as the dot panel can show it: `A`, `SUPERIOR A`, `EMPURRAR`.
 *
 * The panel is the one headline object on the screen and it lights exactly the
 * characters it is handed, so what it gets has to be short and has to be in the
 * face. Two things are trimmed here:
 *
 * - Everything after a `·`. "A · Peito, ombros e tríceps" is a title and a
 *   contents list; the contents belong under the panel as ordinary text, and
 *   the middle dot is not a glyph this face has — it would light as a solid
 *   block, which reads as a broken display rather than as punctuation.
 * - A leading "Treino ". On a screen whose heading is already the word for
 *   training, "TREINO A" spends five sixths of the panel saying where you are.
 *
 * What is left is the letter people actually use: *hoje é o B*.
 */
export function sessionLabel(dayName: string): string {
  const head = dayName.split("·")[0]!.trim();
  return head.replace(/^treino\s+/i, "").toUpperCase();
}

/**
 * Positive modulo. `%` in JavaScript keeps the sign of the left operand, so a
 * hand-edited negative index would index off the front of the array.
 */
function wrap(index: number, length: number): number {
  return ((index % length) + length) % length;
}
