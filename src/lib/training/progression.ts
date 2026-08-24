import type { LoggedSet, TrainingSession } from "@/lib/storage/types";

/**
 * What to put on the bar today, and why (#80).
 *
 * Logging is bookkeeping. The thing somebody opens a training app twice for is
 * to be told what to load, and to believe it — so this file derives today's
 * numbers from what actually happened, every time it is asked, and hands back
 * the reason along with them.
 *
 * **Nothing is written back into a finished session.** There is no stored
 * "current load" to drift out of step with the log, because there is no stored
 * current load at all: correcting a mistyped set from three weeks ago corrects
 * today's target on the next render. That is the whole argument for recomputing
 * something that could obviously be cached (docs/DECISIONS.md § D20).
 *
 * **Double progression is the rule**, because our splits ship rep *ranges*:
 * work up from the bottom of the range to the top at one load, hold every set
 * there, then add load and drop back to the bottom. openGym (AGPL-3.0, read for
 * what its rules are — no code taken) defaults to linear progression because
 * its data carries a single rep target; `splits.ts` has carried
 * `reps: [min, max]` since #74, so the rule our data was written for is this
 * one.
 *
 * Pure, and unit-agnostic: every rep count crossing this boundary is a *total*
 * across both sides, the same convention `LoggedSet.reps` uses, and the caller
 * says how much one more rep is worth (`Card.repStep`). Nothing here reads the
 * clock, the catalog or storage.
 */

/**
 * The smallest pair of plates in a gym, and the grid every load snaps to.
 *
 * Here rather than beside the stepper that spends it, because this is the file
 * with an opinion about what can physically go on a bar: a suggestion of
 * 53,7 kg is not a suggestion, it is arithmetic somebody has to round in their
 * head while a rack is waiting.
 */
export const LOAD_STEP_KG = 2.5;

/**
 * Sessions of missing the same load in a row before it is backed off.
 *
 * Three, because two is a bad week — a late night, a skipped lunch — and the
 * cost of backing off a working load that was fine is a fortnight of easy
 * sessions.
 */
export const STALL_LIMIT = 3;

/** What a deload takes off, before the result is snapped to the plate grid. */
const DELOAD_FRACTION = 0.9;

/**
 * What the day asks for, in the units the log stores.
 *
 * A translation of `SplitItem`, done by the caller, so that this file never has
 * to know that `splits.ts` writes rep ranges per side while the log stores
 * totals. `repStep` is 2 for a unilateral movement, which is what keeps the
 * number on screen halvable.
 */
export interface Card {
  /** How many sets the day prescribes. Fewer than this is a miss. */
  readonly sets: number;
  /** The range, inclusive, as totals: `[16, 24]` is "8 a 12 por lado". */
  readonly reps: readonly [number, number];
  /** How much one more rep is worth. */
  readonly repStep: number;
}

/**
 * Why today's numbers are today's numbers.
 *
 * A tagged object rather than a sentence: the words are pt-BR and belong in
 * `messages/` (docs/DECISIONS.md § D5), and a reason assembled in `lib` is a
 * reason no test can read the shape of. The view resolves these — and halves
 * any rep count in one, for a unilateral movement, exactly as it does
 * everywhere else.
 */
export type ProgressionReason =
  /** Never logged. Start at the bottom of the range and find out. */
  | { kind: "first" }
  /** Every set closed the top of the range: the load goes up. */
  | { kind: "addLoad"; reps: number }
  /** The range was not closed yet, so the same load carries one more rep. */
  | { kind: "addReps" }
  /** Last time did not go: same load, same target, again. */
  | { kind: "hold" }
  /** Stuck at this load for `sessions` in a row. Back off and climb again. */
  | { kind: "deload"; sessions: number }
  /**
   * The top of the range, with nothing to add to. There is no honest
   * "one more rep" past here — the answer is a belt or a harder variation.
   */
  | { kind: "ceiling" };

export interface Prescription {
  /** Reps per set, as a total across both sides. */
  readonly reps: number;
  /** Absent when the movement carries no external load. Never zero. */
  readonly loadKg?: number;
  readonly reason: ProgressionReason;
}

/**
 * Every session this movement was actually performed in, newest first.
 *
 * Sorts rather than trusting the order it is handed: the repository returns
 * sessions newest first, and a pure function that silently depends on a
 * caller's promise breaks the first time somebody builds an array by hand.
 * A session carrying the movement with no sets is dropped — it was on the card
 * and it did not happen, which is not a performance to reason from.
 */
export function performances(
  history: readonly TrainingSession[],
  slug: string,
): LoggedSet[][] {
  return [...history]
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
    .flatMap((session) => {
      const logged = session.exercises.find(
        (exercise) => exercise.exercise === slug,
      );

      return logged && logged.sets.length > 0
        ? [logged.sets.map((set) => ({ reps: set.reps, ...loadOf(set.loadKg) }))]
        : [];
    });
}

/**
 * Today's numbers for one movement, and the reason for them.
 *
 * Reads only the most recent performance to decide what to do, and the ones
 * behind it only to count a stall. That is deliberate: a rule that averages
 * four weeks is a rule nobody can check against the screen they are holding,
 * and "you closed 12 in every set last time" is a sentence somebody can agree
 * or disagree with on the spot.
 */
export function nextPrescription(
  history: readonly TrainingSession[],
  slug: string,
  card: Card,
): Prescription {
  const done = performances(history, slug);
  const last = done[0];
  const [floor, ceiling] = card.reps;

  if (!last) return { reps: floor, reason: { kind: "first" } };

  const reading = readSession(last, card);

  if (reading.hit) {
    if (reading.lowestReps < ceiling) {
      return {
        reps: Math.min(ceiling, reading.lowestReps + card.repStep),
        ...loadOf(reading.loadKg),
        reason: { kind: "addReps" },
      };
    }

    // The top of the range in every set. With a weight on it that is the whole
    // point of the range; with nothing on it there is nothing to add, and
    // proposing a fortieth push-up would be the app pretending otherwise.
    if (reading.loadKg === undefined) {
      return { reps: ceiling, reason: { kind: "ceiling" } };
    }

    return {
      reps: floor,
      loadKg: heavier(reading.loadKg),
      reason: { kind: "addLoad", reps: reading.lowestReps },
    };
  }

  const stalls = stallCount(done, card);
  const backedOff = reading.loadKg === undefined ? undefined : lighter(reading.loadKg);

  if (stalls >= STALL_LIMIT && backedOff !== undefined) {
    return {
      reps: floor,
      loadKg: backedOff,
      reason: { kind: "deload", sessions: stalls },
    };
  }

  // Hold the target that was being aimed at, which is the best set of the
  // session rather than the worst: three sets of twelve was the goal, and the
  // one that came out at six is the reason to repeat it, not a new target.
  return {
    reps: clamp(reading.highestReps, floor, ceiling),
    ...loadOf(reading.loadKg),
    reason: { kind: "hold" },
  };
}

/** One session, read honestly. */
interface Reading {
  /**
   * The load the session was worked at: the first set's.
   *
   * The first rather than the lightest, because dropping the weight for a last
   * set is the definition of not having held it — reading the minimum would
   * turn 60, 60, 55 into "you managed 55 for three sets", which is a session
   * nobody had, and then offer to add weight to it.
   */
  readonly loadKg?: number;
  /** The weakest set, which is what "every set at or above" comes down to. */
  readonly lowestReps: number;
  /** The best set: the target that was being aimed at. */
  readonly highestReps: number;
  /** Every prescribed set, at the working load, at or above the range. */
  readonly hit: boolean;
}

function readSession(sets: readonly LoggedSet[], card: Card): Reading {
  const loadKg = sets[0]?.loadKg;
  const reps = sets.map((set) => set.reps);
  const lowestReps = Math.min(...reps);
  const held = sets.every((set) => (set.loadKg ?? 0) >= (loadKg ?? 0));

  return {
    ...loadOf(loadKg),
    lowestReps,
    highestReps: Math.max(...reps),
    hit: sets.length >= card.sets && held && lowestReps >= card.reps[0],
  };
}

/**
 * How many sessions in a row have missed, at the load being worked now.
 *
 * Counted at that load rather than over the whole history, which is what makes
 * a deload self-clearing: the session after one is worked at a lighter weight,
 * so the misses that caused it are no longer being counted and the next miss
 * starts from one. Without that, three bad weeks would deload again on every
 * subsequent session forever.
 */
function stallCount(
  done: readonly (readonly LoggedSet[])[],
  card: Card,
): number {
  const load = done[0]?.[0]?.loadKg;
  let count = 0;

  for (const sets of done) {
    const reading = readSession(sets, card);
    if (reading.hit || reading.loadKg !== load) break;
    count += 1;
  }

  return count;
}

/** One step up, landed on the plate grid. */
function heavier(loadKg: number): number {
  return snap(loadKg + LOAD_STEP_KG, Math.ceil);
}

/**
 * A deload: a tenth off, snapped *down* onto the plate grid.
 *
 * Down rather than to the nearest, and that is the whole of it. A tenth off
 * 60 kg rounds either way to something real, but a tenth off 5 kg is 4,5 kg,
 * which rounds *up* to the five it started from — the app announcing a change
 * and then not making one. Snapping down always lands at least one pair of
 * plates lower, at every load, which is the guarantee worth having.
 *
 * Below one step there is nowhere left to go, so this gives back nothing and
 * the caller holds instead. An empty bar is not a deload either.
 */
function lighter(loadKg: number): number | undefined {
  const target = snap(loadKg * DELOAD_FRACTION, Math.floor);

  return target >= LOAD_STEP_KG ? target : undefined;
}

function snap(kg: number, round: (value: number) => number): number {
  return round(kg / LOAD_STEP_KG) * LOAD_STEP_KG;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * A load as a field that is either present or absent, never zero.
 *
 * The rule `LoggedSet.loadKg` documents: absent means no external weight, and a
 * zero would be a claim rather than a silence.
 */
function loadOf(loadKg: number | undefined): { loadKg?: number } {
  return loadKg !== undefined && loadKg > 0 ? { loadKg } : {};
}
