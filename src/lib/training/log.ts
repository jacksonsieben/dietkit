import { todayIsoDate } from "@/lib/date";
import type {
  Id,
  IsoTimestamp,
  LoggedExercise,
  LoggedSet,
  TrainingSession,
} from "@/lib/storage/types";

import { exerciseBySlug } from "./catalog";
import {
  LOAD_STEP_KG,
  nextPrescription,
  type ProgressionReason,
} from "./progression";
import type { CurrentSession } from "./rotation";
import type { SplitDay } from "./splits";

/**
 * Logging a session: what is on the card, what actually happened, and the
 * arithmetic between them (#79).
 *
 * Pure, and out of the component for the usual reason — the rules here are the
 * ones worth being sure about, and a rule that lives inside a `useState` setter
 * cannot have a test. Nothing in this file touches storage or the clock: every
 * function that needs the time is handed it.
 *
 * The shape of the day is a *draft*. It is not persisted anywhere: it exists
 * between the screen opening and the session being saved, which is why it
 * carries a `doneAt` per set and `TrainingSession` does not. A set that was
 * never checked off did not happen, and the record written at the end says so
 * by leaving it out (docs/DECISIONS.md § D19).
 */

export interface DraftSet {
  /**
   * Total reps, across both sides — the same convention as `LoggedSet.reps`.
   * The screen halves it for a unilateral movement; see `shownReps`.
   */
  reps: number;
  /** Absent until somebody records one. Never zero — see `LoggedSet.loadKg`. */
  loadKg?: number;
  /**
   * When this set was checked off, or absent if it has not been.
   *
   * A timestamp rather than a boolean because the session's `startedAt` is the
   * earliest of these: training started when the first set was done, not when
   * the screen was opened on the sofa.
   */
  doneAt?: IsoTimestamp;
}

export interface DraftExercise {
  /** A slug from `catalog.ts`. */
  readonly exercise: string;
  /** Done one side at a time, so what is shown is half what is stored. */
  readonly unilateral: boolean;
  /** What the card prescribes, per side, exactly as `splits.ts` writes it. */
  readonly targetReps: readonly [number, number];
  readonly restSeconds: number;
  /**
   * Why today's numbers are today's numbers (#80), for the view to word.
   *
   * On the draft rather than fetched beside it so that the sentence on screen
   * and the numbers under it cannot come from two different readings of the
   * history.
   */
  readonly reason: ProgressionReason;
  readonly sets: readonly DraftSet[];
}

export type SessionDraft = readonly DraftExercise[];

/** Whether a set has been checked off. */
export function isDone(set: DraftSet): boolean {
  return set.doneAt !== undefined;
}

/** At least one set of anything — what the finish button waits for. */
export function hasAnyDone(draft: SessionDraft): boolean {
  return draft.some((exercise) => exercise.sets.some(isDone));
}

/**
 * The reps to put on screen for a stored total.
 *
 * A unilateral set is stored as the total across both sides and shown halved:
 * "8 por lado". Storing the total is what keeps every sum downstream a sum of
 * comparable numbers, and stepping in twos (`repStep`) is what keeps the number
 * on screen halvable. The rounding is for a total that arrived odd from an
 * older file rather than from this screen.
 */
export function shownReps(reps: number, unilateral: boolean): number {
  return unilateral ? Math.round(reps / 2) : reps;
}

/** How much a rep tap moves the total: two for a unilateral, so both sides. */
export function repStep(unilateral: boolean): number {
  return unilateral ? 2 : 1;
}

/**
 * Today's card, pre-filled with what to do about it.
 *
 * The *number* of sets comes from the card and the *numbers in them* come from
 * `progression.ts`, which derives them from what was actually logged. Those are
 * two different kinds of fact: how many sets to do today is a prescription this
 * build ships, while the load and the reps are a conclusion drawn from
 * measurements. Doing four sets last week of a movement the card asks three of
 * does not change the card — and the extra set is one tap away (`addSet`).
 *
 * Every set opens at the same numbers, because a prescription is a straight
 * one: "3 × 10 a 62,5 kg" is the thing being asked for, and pre-filling last
 * week's ragged 8/7/6 would put a target on screen that nobody prescribed and
 * that the rule then reads back as a session of sixes. The sets are still
 * individually editable — what happened is typed over the top of what was
 * asked for, which is the right way round.
 *
 * The rep range crosses into `progression.ts` doubled for a unilateral
 * movement, because everything downstream of the log is a total across both
 * sides and a rule that had to remember which it was looking at is a rule with
 * a bug in it.
 */
export function startDraft(
  day: SplitDay,
  history: readonly TrainingSession[] = [],
): SessionDraft {
  return day.items.map((item) => {
    const unilateral = exerciseBySlug(item.exercise)?.unilateral === true;
    const step = repStep(unilateral);
    const next = nextPrescription(history, item.exercise, {
      sets: item.sets,
      reps: [item.reps[0] * step, item.reps[1] * step],
      repStep: step,
    });

    return {
      exercise: item.exercise,
      unilateral,
      targetReps: item.reps,
      restSeconds: item.restSeconds,
      reason: next.reason,
      sets: Array.from({ length: item.sets }, () => ({
        reps: next.reps,
        ...loadOf(next.loadKg),
      })),
    };
  });
}

/** Replaces one set, leaving the rest of the draft alone. */
export function updateSet(
  draft: SessionDraft,
  exerciseIndex: number,
  setIndex: number,
  change: Partial<DraftSet>,
): SessionDraft {
  return draft.map((exercise, index) => {
    if (index !== exerciseIndex) return exercise;

    return {
      ...exercise,
      sets: exercise.sets.map((set, position) =>
        position === setIndex ? mergeSet(set, change) : set,
      ),
    };
  });
}

/** One tap on the reps of a set. Never below one rep, or one per side. */
export function stepReps(
  draft: SessionDraft,
  exerciseIndex: number,
  setIndex: number,
  direction: 1 | -1,
): SessionDraft {
  const exercise = draft[exerciseIndex];
  const set = exercise?.sets[setIndex];
  if (!exercise || !set) return draft;

  const step = repStep(exercise.unilateral);

  return updateSet(draft, exerciseIndex, setIndex, {
    reps: Math.max(step, set.reps + direction * step),
  });
}

/**
 * One tap on the load of a set.
 *
 * Down from the lightest step lands on blank rather than on zero, and blank
 * steps up to one plate pair. That is the loop somebody doing a bodyweight
 * movement with a belt needs — the field starts empty, one tap puts a weight on
 * it, one tap takes it off — and it keeps zero out of the log, where it would
 * read as having lifted nothing.
 */
export function stepLoad(
  draft: SessionDraft,
  exerciseIndex: number,
  setIndex: number,
  direction: 1 | -1,
): SessionDraft {
  const set = draft[exerciseIndex]?.sets[setIndex];
  if (!set) return draft;

  const next = (set.loadKg ?? 0) + direction * LOAD_STEP_KG;

  return updateSet(draft, exerciseIndex, setIndex, {
    loadKg: next > 0 ? next : undefined,
  });
}

/** Checks a set off, or takes it back. `now` is when the tap happened. */
export function toggleDone(
  draft: SessionDraft,
  exerciseIndex: number,
  setIndex: number,
  now: IsoTimestamp,
): SessionDraft {
  const set = draft[exerciseIndex]?.sets[setIndex];
  if (!set) return draft;

  return updateSet(draft, exerciseIndex, setIndex, {
    doneAt: isDone(set) ? undefined : now,
  });
}

/** A fourth set, weighing what the third one did. */
export function addSet(
  draft: SessionDraft,
  exerciseIndex: number,
): SessionDraft {
  return draft.map((exercise, index) => {
    if (index !== exerciseIndex) return exercise;

    const last = exercise.sets.at(-1);
    const added: DraftSet = last
      ? { reps: last.reps, ...loadOf(last.loadKg) }
      : { reps: exercise.targetReps[0] * repStep(exercise.unilateral) };

    return { ...exercise, sets: [...exercise.sets, added] };
  });
}

/** Drops the last set of a movement. The card asked for one too many. */
export function removeSet(
  draft: SessionDraft,
  exerciseIndex: number,
): SessionDraft {
  return draft.map((exercise, index) =>
    index === exerciseIndex
      ? { ...exercise, sets: exercise.sets.slice(0, -1) }
      : exercise,
  );
}

/**
 * The record of what happened, from the draft and the session it came from.
 *
 * Only checked-off sets survive. A movement nobody touched stays in the list
 * with no sets, which is the honest shape of "it was on the card and it did not
 * happen" — dropping it would make a skipped session and a shorter one read
 * the same later on.
 *
 * `date` is the calendar day of the finish *in the device's timezone*, not the
 * UTC day: a session finished at half past nine on a Tuesday evening in Brazil
 * belongs to that Tuesday, and `toISOString().slice(0, 10)` would file it under
 * Wednesday.
 */
export function finishedSession(
  session: CurrentSession,
  draft: SessionDraft,
  id: Id,
  finishedAt: IsoTimestamp,
): TrainingSession {
  const exercises: LoggedExercise[] = draft.map((exercise) => ({
    exercise: exercise.exercise,
    sets: exercise.sets.filter(isDone).map(copySet),
  }));

  return {
    id,
    date: todayIsoDate(new Date(finishedAt)),
    splitSlug: session.split.slug,
    dayIndex: session.index,
    dayName: session.day.name,
    exercises,
    startedAt: firstDoneAt(draft) ?? finishedAt,
    finishedAt,
  };
}

export interface SessionSummary {
  /** Movements with at least one set done. Not the length of the card. */
  exercises: number;
  sets: number;
  /** Total reps, across both sides for a unilateral. */
  reps: number;
  /**
   * Kilograms moved: load × reps, summed. Zero when nothing carried a weight,
   * which is a real session — the screen leaves the line out rather than
   * printing a zero.
   */
  volumeKg: number;
  durationMinutes: number;
}

/**
 * What to say when the session is saved.
 *
 * Reads the record rather than the draft so the summary is a summary of what
 * was written, and cannot drift from it.
 *
 * Anything under half a minute reads as one minute rather than as none. "0 min"
 * on a finished session reads as a broken screen, and the number is there to
 * say how long it took, not to be a stopwatch.
 */
export function summarise(session: TrainingSession): SessionSummary {
  const performed = session.exercises.filter(
    (exercise) => exercise.sets.length > 0,
  );
  const sets = performed.flatMap((exercise) => exercise.sets);
  const elapsedMs =
    new Date(session.finishedAt).getTime() -
    new Date(session.startedAt).getTime();

  return {
    exercises: performed.length,
    sets: sets.length,
    reps: sets.reduce((total, set) => total + set.reps, 0),
    volumeKg: sets.reduce(
      (total, set) => total + (set.loadKg ?? 0) * set.reps,
      0,
    ),
    durationMinutes: Math.max(1, Math.round(elapsedMs / 60_000)),
  };
}

/**
 * A rest countdown as a gym clock reads it: `1:30`, `0:45`, `2:00`.
 *
 * Seconds are padded and minutes are not, which is how every clock face people
 * already read a rest off works. The colon is in the dot face
 * (`src/components/dot/glyphs.ts`), so this can go straight into the panel.
 */
export function restClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);

  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * One set with a change applied, with anything set to `undefined` *removed*
 * rather than left holding an undefined.
 *
 * Spreading a change cannot take a key away, and both optional fields here mean
 * something by their absence: no load recorded, not checked off. A `loadKg`
 * present and undefined would satisfy the type and then be written into the
 * record as a key nobody put there, so the deletion happens once, here, instead
 * of at each of the two call sites that can clear a field.
 */
function mergeSet(set: DraftSet, change: Partial<DraftSet>): DraftSet {
  const next: DraftSet = { ...set, ...change };

  if (next.loadKg === undefined) delete next.loadKg;
  if (next.doneAt === undefined) delete next.doneAt;

  return next;
}

/**
 * A load as a field that is either present or absent, never zero.
 *
 * One place, because three callers need the same rule and the rule is the one
 * `LoggedSet.loadKg` documents: absent means no external weight, and zero would
 * be a claim rather than a silence.
 */
function loadOf(loadKg: number | undefined): { loadKg?: number } {
  return loadKg !== undefined && loadKg > 0 ? { loadKg } : {};
}

function copySet(set: LoggedSet | DraftSet): LoggedSet {
  return { reps: set.reps, ...loadOf(set.loadKg) };
}

/** The earliest set anybody checked off — when training actually started. */
function firstDoneAt(draft: SessionDraft): IsoTimestamp | undefined {
  const stamps = draft
    .flatMap((exercise) => exercise.sets)
    .map((set) => set.doneAt)
    .filter((stamp): stamp is IsoTimestamp => stamp !== undefined);

  return stamps.length > 0 ? stamps.sort()[0] : undefined;
}
