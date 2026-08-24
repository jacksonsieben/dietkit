"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { displayFontSize, DotText } from "@/components/dot/DotText";
import { ActionButton, Ghost, Legend, Rule } from "@/components/nd/kit";
import { exerciseBySlug } from "@/lib/training/catalog";
import {
  addSet,
  finishedSession,
  hasAnyDone,
  isDone,
  removeSet,
  restClock,
  shownReps,
  startDraft,
  stepLoad,
  stepReps,
  summarise,
  toggleDone,
  type DraftExercise,
  type DraftSet,
  type SessionDraft,
  type SessionSummary,
} from "@/lib/training/log";
import type { ProgressionReason } from "@/lib/training/progression";
import { sessionLabel, type CurrentSession } from "@/lib/training/rotation";
import { SPLITS, type Split } from "@/lib/training/splits";
import {
  chooseSplit,
  finishSession,
  loadHistory,
  loadTraining,
  stopTraining,
  type TrainingState,
} from "@/lib/training/store";
import { getRepository } from "@/lib/storage";
import type { TrainingSession } from "@/lib/storage/types";

/**
 * The training screen: which session is next, what was lifted in it, and the
 * button that finishes it (#78, #79).
 *
 * A rotation, not a calendar (docs/DECISIONS.md § D18). There is no week on
 * this screen and no weekday anywhere behind it — the app holds a split and a
 * pointer into its days, and the pointer moves when somebody says they trained.
 * Missing Tuesday moves nothing, because nothing here ever knew about Tuesday.
 *
 * It renders one of three things, and none of them is a spinner over an empty
 * layout: the chooser on a device that has never picked a split, the same
 * chooser with a line of explanation when the split it was holding is gone from
 * this build, and otherwise the session. The headline is the letter people
 * actually say — *hoje é o B* — drawn in dots, because standing in a gym
 * holding a phone is the one thing the screen is for.
 *
 * What gets logged is a *draft* until the finish (§ D19): the sets on screen
 * are held in this component and written once, as one record, when somebody
 * says the session is over. Nothing is persisted mid-workout, so a session
 * abandoned on the bus home leaves no half-record claiming to be a workout.
 *
 * Every rule about what is next, what a set means and what the finish writes
 * lives in `lib/training/store.ts`, `lib/training/rotation.ts` and
 * `lib/training/log.ts`, which are testable without a browser. This file is
 * the paint.
 */

/** What the last write did, for the one polite line under the actions. */
type Status = "idle" | "working" | "finished" | "saveFailed";

export function Training() {
  const t = useTranslations("Training");
  const [state, setState] = useState<TrainingState | "loading" | "loadFailed">(
    "loading",
  );
  /** Everything logged so far, for the pre-fill. Newest first. */
  const [history, setHistory] = useState<TrainingSession[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  /**
   * The last finish, in numbers — undefined when the finish logged nothing,
   * which is its own sentence rather than a summary of zeroes.
   */
  const [summary, setSummary] = useState<SessionSummary>();
  /**
   * Whether the chooser is open over a rotation that already exists. Local,
   * and not a fourth `TrainingState`: it is a thing about this visit to the
   * screen, not a fact about the device, and putting it in the store would
   * make "was looking at the list" survive a reload.
   */
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    // Nothing here is on the server — a rotation and a training log are the
    // user's own data and live in IndexedDB — so the first paint is the
    // loading line.
    let live = true;

    void (async () => {
      try {
        const repository = getRepository();
        const [next, logged] = await Promise.all([
          loadTraining(repository),
          loadHistory(repository),
        ]);

        if (live) {
          setState(next);
          setHistory(logged);
        }
      } catch {
        if (live) setState("loadFailed");
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  const choose = async (splitSlug: string) => {
    setStatus("working");

    try {
      const repository = getRepository();
      await chooseSplit(repository, splitSlug, new Date().toISOString());
      // Read back rather than assume: the same discipline as the weight log,
      // and the only way the screen and the device cannot disagree.
      setState(await loadTraining(repository));
      setPicking(false);
      setStatus("idle");
    } catch {
      setStatus("saveFailed");
    }
  };

  /**
   * `record` is absent when nothing was checked off. That is not a failed
   * finish: the rotation moves and the log stays empty, because nothing
   * happened (`finishSession` in store.ts).
   */
  const finish = async (record?: TrainingSession) => {
    setStatus("working");

    try {
      const repository = getRepository();
      setState(await finishSession(repository, new Date().toISOString(), record));
      // The next session pre-fills from history, and the session that was just
      // written is the newest thing in it.
      setHistory(await loadHistory(repository));
      setSummary(record ? summarise(record) : undefined);
      setStatus("finished");
    } catch {
      setStatus("saveFailed");
    }
  };

  const stop = async () => {
    setStatus("working");

    try {
      const repository = getRepository();
      await stopTraining(repository);
      setState(await loadTraining(repository));
      setPicking(false);
      setStatus("idle");
    } catch {
      setStatus("saveFailed");
    }
  };

  if (state === "loading") {
    return <p className="text-sm text-nd-dim">{t("loading")}</p>;
  }

  if (state === "loadFailed") {
    return <p className="text-sm text-nd-red-ink">{t("loadError")}</p>;
  }

  const training = state.status === "ready" && !picking;

  return (
    <div className="flex flex-col gap-10">
      {state.status === "unknownSplit" ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold tracking-tight">
            {t("unknown.title")}
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("unknown.body")}
          </p>
        </section>
      ) : null}

      <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
        {status === "finished" ? <Finished summary={summary} /> : null}
        {status === "saveFailed" ? (
          <p className="text-sm text-nd-red-ink">{t("saveError")}</p>
        ) : null}
      </div>

      {training ? (
        <Session
          // The draft is seeded once, from the day and the history, and a new
          // day is a new draft. Remounting is what says so — a `useEffect`
          // resetting state on a prop change is the same thing written twice.
          key={`${state.session.split.slug}-${state.session.index}`}
          session={state.session}
          history={history}
          lastFinishedAt={state.rotation.lastFinishedAt}
          busy={status === "working"}
          onFinish={(record) => void finish(record)}
          onChange={() => {
            setPicking(true);
            setStatus("idle");
          }}
        />
      ) : (
        <Chooser
          busy={status === "working"}
          running={state.status === "ready"}
          onChoose={(slug) => void choose(slug)}
          onCancel={() => {
            setPicking(false);
            setStatus("idle");
          }}
          onStop={() => void stop()}
        />
      )}
    </div>
  );
}

/**
 * What the finish wrote.
 *
 * The numbers come from the record rather than from the draft (`summarise`),
 * so this cannot say anything the file does not. Volume is left out when it is
 * zero: a session of bodyweight work moved a body, and "0 kg" is the screen
 * calling that nothing.
 */
function Finished({ summary }: { summary: SessionSummary | undefined }) {
  const t = useTranslations("Training");

  if (!summary) {
    return <p className="text-sm text-nd-dim">{t("summary.nothing")}</p>;
  }

  return (
    <>
      <p className="text-sm text-nd-dim">{t("session.done")}</p>
      <p className="text-sm" data-numeric="">
        {[
          t("summary.exercises", { count: summary.exercises }),
          t("summary.sets", { count: summary.sets }),
          t("summary.reps", { count: summary.reps }),
          t("summary.duration", { minutes: summary.durationMinutes }),
        ].join(" · ")}
      </p>
      {summary.volumeKg > 0 ? (
        <p className="text-sm text-nd-dim" data-numeric="">
          {t("summary.volume", { volume: summary.volumeKg })}
        </p>
      ) : null}
    </>
  );
}

function Session({
  session,
  history,
  lastFinishedAt,
  busy,
  onFinish,
  onChange,
}: {
  session: CurrentSession;
  history: readonly TrainingSession[];
  lastFinishedAt?: string;
  busy: boolean;
  onFinish: (record?: TrainingSession) => void;
  onChange: () => void;
}) {
  const t = useTranslations("Training");
  const format = useFormatter();
  const label = sessionLabel(session.day.name);

  const [draft, setDraft] = useState<SessionDraft>(() =>
    startDraft(session.day, history),
  );
  /** When the current rest is up, in epoch milliseconds. */
  const [restUntil, setRestUntil] = useState<number>();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (restUntil === undefined) return;

    // Twice a second: the panel counts whole seconds, and a one-second tick
    // drifts against the wall clock badly enough to skip one. It stops itself
    // at zero rather than ticking behind a number that has stopped moving.
    const tick = setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (at >= restUntil) clearInterval(tick);
    }, 500);

    return () => clearInterval(tick);
  }, [restUntil]);

  /**
   * Checking a set off is also what starts the rest: the clock belongs to the
   * set that was just done, so it is seeded from that movement's own
   * `restSeconds`. Taking a check back is a correction and does not restart
   * anything.
   */
  const check = (exerciseIndex: number, setIndex: number) => {
    const exercise = draft[exerciseIndex];
    const set = exercise?.sets[setIndex];
    if (!exercise || !set) return;

    // One instant for both, so the rest a set started and the moment it was
    // done are the same moment rather than two calls to a moving clock.
    const at = new Date();
    setDraft(toggleDone(draft, exerciseIndex, setIndex, at.toISOString()));

    if (!isDone(set)) {
      setNow(at.getTime());
      setRestUntil(at.getTime() + exercise.restSeconds * 1000);
    }
  };

  return (
    <>
      {/* The one headline panel on this screen, and the shortest string the app
          ever lights: a letter. `sessionLabel` is what guarantees it fits and
          that no middle dot reaches a face that has no glyph for one. */}
      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("session.legend")}</Legend>
        <DotText className="block" style={{ fontSize: displayFontSize(label) }}>
          {label}
        </DotText>
        <p className="text-lg font-semibold tracking-tight">
          {session.day.name}
        </p>
        <p className="text-sm text-nd-dim">
          {t("session.position", {
            split: session.split.name,
            index: session.index + 1,
            total: session.split.days.length,
          })}
        </p>
      </section>

      {restUntil === undefined ? null : (
        <Rest
          seconds={(restUntil - now) / 1000}
          onStop={() => setRestUntil(undefined)}
        />
      )}

      <Rule />

      <section className="flex flex-col gap-4">
        <Legend as="h2">{t("session.exercises")}</Legend>
        <ul className="flex flex-col">
          {draft.map((exercise, exerciseIndex) => (
            <Exercise
              key={exercise.exercise}
              exercise={exercise}
              prescribed={session.day.items[exerciseIndex]?.sets ?? 0}
              busy={busy}
              onReps={(setIndex, direction) =>
                setDraft(stepReps(draft, exerciseIndex, setIndex, direction))
              }
              onLoad={(setIndex, direction) =>
                setDraft(stepLoad(draft, exerciseIndex, setIndex, direction))
              }
              onCheck={(setIndex) => check(exerciseIndex, setIndex)}
              onAdd={() => setDraft(addSet(draft, exerciseIndex))}
              onRemove={() => setDraft(removeSet(draft, exerciseIndex))}
            />
          ))}
        </ul>
      </section>

      <Rule />

      {/* One filled block, because there is exactly one thing somebody came to
          this screen to do at the end of a session. Changing split is a thing
          that is available. */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <ActionButton
            type="button"
            disabled={busy}
            onClick={() =>
              onFinish(
                hasAnyDone(draft)
                  ? finishedSession(
                      session,
                      draft,
                      crypto.randomUUID(),
                      new Date().toISOString(),
                    )
                  : undefined,
              )
            }
          >
            {t("session.finish")}
          </ActionButton>
          <Ghost type="button" disabled={busy} onClick={onChange}>
            {t("session.change")}
          </Ghost>
        </div>
        <p className="text-sm text-nd-dim">
          {lastFinishedAt === undefined
            ? t("session.never")
            : t("session.last", {
                date: format.dateTime(new Date(lastFinishedAt), {
                  day: "numeric",
                  month: "long",
                }),
              })}
        </p>
      </section>
    </>
  );
}

/**
 * The rest between two sets.
 *
 * A subordinate panel, capped at 16: the day's letter above it is this
 * screen's one headline, and a clock lit at the same size would be a second
 * one (`src/components/nd/readouts.test.ts`). It counts down and stops at
 * zero; it does not ring, buzz or hold the screen awake, none of which this
 * slice ships.
 */
function Rest({ seconds, onStop }: { seconds: number; onStop: () => void }) {
  const t = useTranslations("Training");
  const clock = restClock(seconds);

  return (
    <section className="flex flex-col gap-3">
      <Legend as="h2">{seconds > 0 ? t("log.rest") : t("log.restOver")}</Legend>
      <DotText className="block" style={{ fontSize: displayFontSize(clock, 16) }}>
        {clock}
      </DotText>
      <Ghost type="button" onClick={onStop} className="px-2 py-1">
        {t("log.restStop")}
      </Ghost>
    </section>
  );
}

/**
 * One movement, with its sets.
 *
 * The card's prescription stays on the row as the thing being answered — what
 * to do — and the sets under it are what was done. A bodyweight movement gets
 * no load control until somebody puts a load on it, because a belt is an
 * addition and reads as one.
 */
/**
 * Why today's numbers are today's numbers (#80).
 *
 * Shown on every movement, including the weeks where the answer is "one more
 * repetition". A reason that only appears when something interesting happens is
 * a reason nobody learns to read, and the whole claim of this screen is that
 * every number says why it is that number.
 *
 * The wording is here and the rule is in `progression.ts`. A sentence assembled
 * in `lib` is a sentence next-intl never sees and a translator can never fix
 * (docs/DECISIONS.md § D5) — so what crosses the boundary is a tagged reason,
 * and this is where it becomes Portuguese. A rep count inside one is a total,
 * halved on the way to the screen exactly like the ones in the steppers.
 */
function Reason({
  reason,
  unilateral,
}: {
  reason: ProgressionReason;
  unilateral: boolean;
}) {
  const t = useTranslations("Training.progression");

  return (
    <p className="text-sm text-nd-dim">
      {reason.kind === "addLoad"
        ? t("addLoad", { reps: shownReps(reason.reps, unilateral) })
        : reason.kind === "deload"
          ? t("deload", { sessions: reason.sessions })
          : t(reason.kind)}
    </p>
  );
}

function Exercise({
  exercise,
  prescribed,
  busy,
  onReps,
  onLoad,
  onCheck,
  onAdd,
  onRemove,
}: {
  exercise: DraftExercise;
  /** How many sets the card asked for, which the draft may have moved past. */
  prescribed: number;
  busy: boolean;
  onReps: (setIndex: number, direction: 1 | -1) => void;
  onLoad: (setIndex: number, direction: 1 | -1) => void;
  onCheck: (setIndex: number) => void;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("Training");
  const catalogued = exerciseBySlug(exercise.exercise);
  const bodyweight = catalogued?.equipment === "peso-corporal";

  return (
    <li className="flex flex-col gap-3 border-t border-nd-unlit py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-x-6">
        <p className="min-w-0 font-medium">
          {catalogued?.name ?? exercise.exercise}
        </p>
        <p className="text-sm text-nd-dim sm:text-right" data-numeric="">
          {[
            t("session.prescription", {
              sets: prescribed,
              repMin: exercise.targetReps[0],
              repMax: exercise.targetReps[1],
            }),
            t("session.rest", { seconds: exercise.restSeconds }),
          ].join(" · ")}
        </p>
      </div>

      <Reason reason={exercise.reason} unilateral={exercise.unilateral} />

      <ul className="flex flex-col gap-3">
        {exercise.sets.map((set, setIndex) => (
          <SetRow
            // Sets have no identity of their own — they are a position in a
            // list somebody adds to and takes from the end of.
            key={setIndex}
            index={setIndex}
            set={set}
            unilateral={exercise.unilateral}
            bodyweight={bodyweight}
            busy={busy}
            onReps={(direction) => onReps(setIndex, direction)}
            onLoad={(direction) => onLoad(setIndex, direction)}
            onCheck={() => onCheck(setIndex)}
          />
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Ghost
          type="button"
          disabled={busy}
          onClick={onAdd}
          className="px-2 py-1"
        >
          {t("log.addSet")}
        </Ghost>
        {exercise.sets.length > 0 ? (
          <Ghost
            type="button"
            disabled={busy}
            onClick={onRemove}
            className="px-2 py-1"
          >
            {t("log.removeSet")}
          </Ghost>
        ) : null}
      </div>
    </li>
  );
}

/**
 * One set: what was done, and the tick that says it was.
 *
 * The reps read "8" or "8 por lado" and the load reads "60 kg", so neither
 * number needs a label over it — which is what keeps a row of two steppers
 * legible on a phone held sideways to a rack.
 */
function SetRow({
  index,
  set,
  unilateral,
  bodyweight,
  busy,
  onReps,
  onLoad,
  onCheck,
}: {
  index: number;
  set: DraftSet;
  unilateral: boolean;
  bodyweight: boolean;
  busy: boolean;
  onReps: (direction: 1 | -1) => void;
  onLoad: (direction: 1 | -1) => void;
  onCheck: () => void;
}) {
  const t = useTranslations("Training");
  const reps = shownReps(set.reps, unilateral);

  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          className="accent-nd-ink"
          checked={isDone(set)}
          disabled={busy}
          onChange={onCheck}
        />
        {t("log.set", { index: index + 1 })}
      </label>

      <Stepper
        value={
          unilateral
            ? t("log.repsPerSide", { reps })
            : t("log.reps", { reps })
        }
        less={t("log.fewerReps")}
        more={t("log.moreReps")}
        busy={busy}
        onStep={onReps}
      />

      {bodyweight && set.loadKg === undefined ? (
        <Ghost
          type="button"
          disabled={busy}
          onClick={() => onLoad(1)}
          className="px-2 py-1"
        >
          {t("log.addLoad")}
        </Ghost>
      ) : (
        <Stepper
          value={
            set.loadKg === undefined
              ? "—"
              : t("log.load", { load: set.loadKg })
          }
          less={t("log.lessLoad")}
          more={t("log.moreLoad")}
          busy={busy}
          onStep={onLoad}
        />
      )}
    </li>
  );
}

/** Minus, a number, plus. The only way a load or a rep count moves. */
function Stepper({
  value,
  less,
  more,
  busy,
  onStep,
}: {
  value: string;
  /** What the down button does, for anybody who cannot see which way it points. */
  less: string;
  more: string;
  busy: boolean;
  onStep: (direction: 1 | -1) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Ghost
        type="button"
        aria-label={less}
        disabled={busy}
        onClick={() => onStep(-1)}
        className="px-2 py-1"
      >
        {"−"}
      </Ghost>
      <span className="min-w-24 text-center text-sm" data-numeric="">
        {value}
      </span>
      <Ghost
        type="button"
        aria-label={more}
        disabled={busy}
        onClick={() => onStep(1)}
        className="px-2 py-1"
      >
        {"+"}
      </Ghost>
    </div>
  );
}

function Chooser({
  busy,
  running,
  onChoose,
  onCancel,
  onStop,
}: {
  busy: boolean;
  /** Whether there is a rotation behind this list to go back to, or stop. */
  running: boolean;
  onChoose: (splitSlug: string) => void;
  onCancel: () => void;
  onStop: () => void;
}) {
  const t = useTranslations("Training");

  return (
    <>
      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("choose.title")}</Legend>
        <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
          {t("choose.lead")}
        </p>
      </section>

      <ul className="flex flex-col gap-8">
        {SPLITS.map((split) => (
          <li key={split.slug} className="flex flex-col gap-3">
            <SplitCard
              split={split}
              busy={busy}
              onChoose={() => onChoose(split.slug)}
            />
          </li>
        ))}
      </ul>

      {running ? (
        <>
          <Rule />
          <div className="flex flex-wrap items-center gap-3">
            <Ghost type="button" disabled={busy} onClick={onCancel}>
              {t("choose.cancel")}
            </Ghost>
            <Ghost type="button" disabled={busy} onClick={onStop}>
              {t("choose.stop")}
            </Ghost>
          </div>
        </>
      ) : null}
    </>
  );
}

/**
 * One split, offered.
 *
 * Outlined rather than filled, all four of them: these are peers, and four
 * inverted blocks down a screen is four primary actions, which is none.
 */
function SplitCard({
  split,
  busy,
  onChoose,
}: {
  split: Split;
  busy: boolean;
  onChoose: () => void;
}) {
  const t = useTranslations("Training");

  return (
    <>
      <h3 className="text-lg font-semibold tracking-tight">{split.name}</h3>
      <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
        {split.description}
      </p>
      <p className="text-xs tracking-[0.14em] text-nd-dim uppercase">
        {split.days.map((day) => sessionLabel(day.name)).join(" · ")}
      </p>
      <p className="text-sm text-nd-dim" data-numeric="">
        {t("choose.days", { count: split.days.length })}
      </p>
      <Ghost type="button" disabled={busy} onClick={onChoose}>
        {t("choose.start")}
      </Ghost>
    </>
  );
}
