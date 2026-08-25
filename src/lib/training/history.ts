import { plot, type Axis, type ChartBox, type Plot } from "@/lib/chart";
import type { IsoDate, LoggedSet, TrainingSession } from "@/lib/storage/types";

import { exerciseBySlug, isUnilateral } from "./catalog";
import { shownReps } from "./log";

/**
 * What the log says once there is enough of it to say anything (#81).
 *
 * Everything here is derived, every time, from the sessions on the device.
 * There is no stored best, no counter incremented at the finish, no "personal
 * record" field that a deleted session would leave behind pointing at a lift
 * that no longer exists (docs/DECISIONS.md § D20). Delete a workout and the
 * records it set disappear with it, which is the only behaviour that can be
 * defended out loud.
 *
 * Two conventions hold across this file:
 *
 * Reps leave here in the movement's own terms — per side for a unilateral,
 * total for everything else — because every caller is a screen and a screen
 * says "12 por lado". The halving happens once, here, off `isUnilateral`, so
 * no caller can forget it. (`log.ts` stores the total; that is the storage
 * convention and this is the reading convention, and this file is the seam.)
 *
 * Estimates are whole kilos. Epley is a rule of thumb with several percent of
 * slack in it, and printing 133,3 kg off it would dress a guess up as a
 * measurement.
 */

/**
 * Past twelve reps the formula is fiction.
 *
 * Epley was fitted to low-rep work and it drifts badly out at twenty: a set of
 * 60 × 25 comes out claiming a 110 kg single, which nobody who has done that
 * set believes. There is no better formula waiting behind this one, so the app
 * prints nothing rather than a confident wrong number — a curve with a gap in
 * it is honest, and a curve invented out of a burnout set is not.
 */
export const ONE_REP_MAX_LIMIT = 12;

/** One set, read the way the screen says it. */
export interface ReadSet {
  readonly loadKg?: number;
  /** Per side for a unilateral movement, total for everything else. */
  readonly reps: number;
  /** Absent where the set carried no load, or ran past the rep limit. */
  readonly estimateKg?: number;
}

/** A set worth naming: a session's best, or a record. */
export interface Achievement extends ReadSet {
  readonly date: IsoDate;
}

/**
 * Epley, bounded.
 *
 * A single is returned as itself. The formula would add three and a half
 * percent to a 135 kg single and call the result an estimate, which is
 * backwards: a single *is* the measurement, and the one number on this screen
 * that needs no guessing should not be guessed at.
 */
export function estimatedOneRepMax(
  loadKg: number | undefined,
  reps: number,
): number | undefined {
  if (loadKg === undefined || loadKg <= 0) return undefined;
  if (reps < 1 || reps > ONE_REP_MAX_LIMIT) return undefined;
  if (reps === 1) return Math.round(loadKg);

  return Math.round(loadKg * (1 + reps / 30));
}

/**
 * The best set of a session: the highest estimate, not the heaviest bar.
 *
 * 100 × 10 is a better set than 120 × 3 even though the second one is more
 * weight, and a chart drawn off the heaviest load would show a lifter getting
 * worse in the week they started doing volume. Ties go to the heavier load,
 * because between two equal estimates the one under more weight is the one
 * that is less of an extrapolation.
 */
export function bestSet(
  sets: readonly LoggedSet[],
  unilateral: boolean,
): ReadSet | undefined {
  let best: ReadSet | undefined;

  for (const set of sets) {
    const candidate = readSet(set, unilateral);
    if (candidate.estimateKg === undefined) continue;
    if (best === undefined) {
      best = candidate;
      continue;
    }
    if (candidate.estimateKg > (best.estimateKg ?? 0)) best = candidate;
    else if (
      candidate.estimateKg === best.estimateKg &&
      (candidate.loadKg ?? 0) > (best.loadKg ?? 0)
    ) {
      best = candidate;
    }
  }

  return best;
}

export interface MovementSession {
  readonly id: string;
  readonly date: IsoDate;
  readonly dayName: string;
  readonly sets: readonly ReadSet[];
  /** Absent for a movement carrying no load, where nothing can be estimated. */
  readonly best?: ReadSet;
}

/** Every session that touched a movement, newest first. */
export function movementSessions(
  history: readonly TrainingSession[],
  slug: string,
): MovementSession[] {
  const unilateral = isUnilateral(slug);

  return [...history]
    .sort(byDateDescending)
    .flatMap((session) => {
      const logged = session.exercises.find(
        (exercise) => exercise.exercise === slug,
      );
      if (!logged || logged.sets.length === 0) return [];

      return [
        {
          id: session.id,
          date: session.date,
          dayName: session.dayName,
          sets: logged.sets.map((set) => readSet(set, unilateral)),
          best: bestSet(logged.sets, unilateral),
        },
      ];
    });
}

export interface CurvePoint extends ReadSet {
  readonly date: IsoDate;
  readonly estimateKg: number;
}

/**
 * The curve: one point per calendar day, oldest first.
 *
 * Per *day* rather than per session because two sessions on one date would
 * otherwise sit on the same vertical line and read as a drop, and because a
 * chart's horizontal axis is dates — that is what makes a gap in it mean a
 * fortnight off rather than a workout skipped in the list.
 *
 * Days whose sets could not be estimated — no load recorded, or every set past
 * the rep limit — are absent rather than zero. The line joins what is left,
 * which is the true shape of what is known.
 */
export function strengthCurve(
  history: readonly TrainingSession[],
  slug: string,
): CurvePoint[] {
  const best = new Map<IsoDate, CurvePoint>();

  for (const session of movementSessions(history, slug)) {
    const top = session.best;
    if (!top || top.estimateKg === undefined) continue;

    const standing = best.get(session.date);
    if (standing && standing.estimateKg >= top.estimateKg) continue;

    best.set(session.date, {
      date: session.date,
      loadKg: top.loadKg,
      reps: top.reps,
      estimateKg: top.estimateKg,
    });
  }

  return [...best.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface Records {
  /** Most weight moved for at least one rep. */
  readonly heaviest?: Achievement;
  /** Best estimated single. */
  readonly bestEstimate?: Achievement;
  /** Most reps in one set, and the load they were done at. */
  readonly mostReps?: Achievement;
}

export type RecordKind = keyof Records;

export const RECORD_KINDS: readonly RecordKind[] = [
  "heaviest",
  "bestEstimate",
  "mostReps",
];

/**
 * The three records, derived from the whole log every time it is asked.
 *
 * Three rather than one because they answer different questions and a single
 * "best" would have to pick which question mattered: the heaviest bar is what
 * somebody tells their friends, the estimate is what a program is written off,
 * and the rep record is the one a bodyweight movement can hold at all.
 */
export function movementRecords(
  history: readonly TrainingSession[],
  slug: string,
): Records {
  let heaviest: Achievement | undefined;
  let bestEstimate: Achievement | undefined;
  let mostReps: Achievement | undefined;

  for (const session of movementSessions(history, slug)) {
    for (const set of session.sets) {
      const dated: Achievement = { ...set, date: session.date };

      if (set.loadKg !== undefined && set.reps >= 1) {
        if (
          heaviest === undefined ||
          set.loadKg > (heaviest.loadKg ?? 0) ||
          (set.loadKg === heaviest.loadKg && set.reps > heaviest.reps)
        ) {
          heaviest = dated;
        }
      }

      if (
        set.estimateKg !== undefined &&
        (bestEstimate === undefined ||
          set.estimateKg > (bestEstimate.estimateKg ?? 0))
      ) {
        bestEstimate = dated;
      }

      if (
        mostReps === undefined ||
        set.reps > mostReps.reps ||
        (set.reps === mostReps.reps &&
          (set.loadKg ?? 0) > (mostReps.loadKg ?? 0))
      ) {
        mostReps = dated;
      }
    }
  }

  return { heaviest, bestEstimate, mostReps };
}

export interface LoggedMovement {
  readonly slug: string;
  readonly name: string;
  readonly lastDate: IsoDate;
  readonly sessions: number;
}

/**
 * Every movement the log has ever seen, most recently trained first.
 *
 * Off the log rather than off the catalog, so the picker holds the fifteen
 * movements somebody actually does instead of two hundred they might. A
 * movement this build has since dropped from the catalog keeps its slug as its
 * name: the log is the record, and a session that happened does not stop
 * having happened because a table changed.
 */
export function loggedMovements(
  history: readonly TrainingSession[],
): LoggedMovement[] {
  const seen = new Map<string, { lastDate: IsoDate; sessions: number }>();

  for (const session of [...history].sort(byDateDescending)) {
    for (const exercise of session.exercises) {
      if (exercise.sets.length === 0) continue;

      const standing = seen.get(exercise.exercise);
      seen.set(exercise.exercise, {
        lastDate: standing?.lastDate ?? session.date,
        sessions: (standing?.sessions ?? 0) + 1,
      });
    }
  }

  return [...seen.entries()].map(([slug, counted]) => ({
    slug,
    name: exerciseBySlug(slug)?.name ?? slug,
    lastDate: counted.lastDate,
    sessions: counted.sessions,
  }));
}

export interface BrokenRecord {
  readonly exercise: string;
  readonly name: string;
  readonly kind: RecordKind;
  readonly set: ReadSet;
}

/**
 * What the session that just finished beat (#81).
 *
 * Computed by asking for the records twice — once from the log as it stood
 * before, once with the new session added — rather than by comparing the new
 * session against a stored best. The comparison is the same arithmetic that
 * draws the records screen, so the two can never disagree about what a record
 * is, and there is still nothing on the device that can drift.
 */
export function brokenRecords(
  before: readonly TrainingSession[],
  session: TrainingSession,
): BrokenRecord[] {
  // Both sides drop any copy of the session already in the log, so the answer
  // is the same whether the caller passes the history as it stood before the
  // finish or as it stands after it. A function whose result depends on which
  // one it was handed is a bug waiting for the day somebody reorders two lines
  // in a component.
  const without = before.filter((old) => old.id !== session.id);
  const after = [...without, session];
  const broken: BrokenRecord[] = [];

  for (const exercise of session.exercises) {
    if (exercise.sets.length === 0) continue;

    const was = movementRecords(without, exercise.exercise);
    const now = movementRecords(after, exercise.exercise);

    for (const kind of RECORD_KINDS) {
      const standing = was[kind];
      const fresh = now[kind];
      if (!fresh || fresh.date !== session.date) continue;
      // Nothing was broken the first time a movement is done: there was no
      // record to beat, and an app that calls a first attempt three personal
      // records is an app whose congratulations stop meaning anything.
      if (!standing || !improved(kind, standing, fresh)) continue;

      broken.push({
        exercise: exercise.exercise,
        name: exerciseBySlug(exercise.exercise)?.name ?? exercise.exercise,
        kind,
        set: fresh,
      });
    }
  }

  return broken;
}

/**
 * Whether the fresh record actually beats the standing one.
 *
 * The guard matters because `movementRecords` breaks ties toward the newer
 * session, so equalling a record puts today's date on it. Equalling is not
 * breaking, and an app that congratulates somebody for repeating last week is
 * an app whose congratulations mean nothing.
 */
function improved(
  kind: RecordKind,
  standing: Achievement,
  fresh: Achievement,
): boolean {
  if (kind === "bestEstimate") {
    return (fresh.estimateKg ?? 0) > (standing.estimateKg ?? 0);
  }
  if (kind === "heaviest") return (fresh.loadKg ?? 0) > (standing.loadKg ?? 0);
  return fresh.reps > standing.reps;
}

function readSet(set: LoggedSet, unilateral: boolean): ReadSet {
  const reps = shownReps(set.reps, unilateral);

  return {
    loadKg: set.loadKg,
    reps,
    estimateKg: estimatedOneRepMax(set.loadKg, reps),
  };
}

/** Newest first, and within a day the session that finished last. */
function byDateDescending(a: TrainingSession, b: TrainingSession): number {
  return b.date.localeCompare(a.date) || b.finishedAt.localeCompare(a.finishedAt);
}

/**
 * Two and a half kilos is the smallest plate on the rack, and five is the
 * smallest jump worth drawing a chart about.
 *
 * The floor does for strength what `MIN_RANGE_KG` does for body weight: without
 * it, a month of holding the same load fills the box with the rounding on an
 * estimate. The step is what keeps the two axis labels readable as loads —
 * "82,5" is a bar somebody can build and "81,5" is not.
 */
export const STRENGTH_AXIS: Axis = { minRange: 5, step: 2.5 };

/**
 * The curve, as coordinates.
 *
 * Two series, in the same grammar the weight chart uses: what was measured
 * drawn as faint dots, what was derived from it drawn as the line. Here the
 * measurement is the load that was actually on the bar in the best set, and
 * the derivation is the estimate off it — so the gap between the dots and the
 * line is visibly the reps, which is the honest way to show an extrapolation.
 */
export function strengthGeometry(
  curve: readonly CurvePoint[],
  box: ChartBox,
): Plot | undefined {
  return plot(
    curve.map((point) => ({
      date: point.date,
      values: [point.loadKg ?? point.estimateKg, point.estimateKg],
    })),
    box,
    STRENGTH_AXIS,
  );
}
