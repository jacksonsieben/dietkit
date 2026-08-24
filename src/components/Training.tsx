"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { displayFontSize, DotText } from "@/components/dot/DotText";
import { ActionButton, Ghost, Legend, Rule } from "@/components/nd/kit";
import { exerciseBySlug } from "@/lib/training/catalog";
import { sessionLabel, type CurrentSession } from "@/lib/training/rotation";
import { SPLITS, type Split } from "@/lib/training/splits";
import {
  chooseSplit,
  finishSession,
  loadTraining,
  stopTraining,
  type TrainingState,
} from "@/lib/training/store";
import { getRepository } from "@/lib/storage";

/**
 * The training screen: which session is next, and the button that finishes it.
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
 * holding a phone that is the one thing the screen is for.
 *
 * Every rule about what is next lives in `lib/training/store.ts` and
 * `lib/training/rotation.ts`, which are testable without a browser. This file
 * is the paint.
 */

/** What the last write did, for the one polite line under the actions. */
type Status = "idle" | "working" | "finished" | "saveFailed";

export function Training() {
  const t = useTranslations("Training");
  const [state, setState] = useState<TrainingState | "loading" | "loadFailed">(
    "loading",
  );
  const [status, setStatus] = useState<Status>("idle");
  /**
   * Whether the chooser is open over a rotation that already exists. Local,
   * and not a fourth `TrainingState`: it is a thing about this visit to the
   * screen, not a fact about the device, and putting it in the store would
   * make "was looking at the list" survive a reload.
   */
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    // Nothing here is on the server — a rotation is the user's own data and
    // lives in IndexedDB — so the first paint is the loading line.
    let live = true;

    void (async () => {
      try {
        const next = await loadTraining(getRepository());
        if (live) setState(next);
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

  const finish = async () => {
    setStatus("working");

    try {
      setState(await finishSession(getRepository(), new Date().toISOString()));
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

      <p aria-live="polite" className="text-sm empty:hidden">
        {status === "finished" ? (
          <span className="text-nd-dim">{t("session.done")}</span>
        ) : null}
        {status === "saveFailed" ? (
          <span className="text-nd-red-ink">{t("saveError")}</span>
        ) : null}
      </p>

      {training ? (
        <Session
          session={state.session}
          lastFinishedAt={state.rotation.lastFinishedAt}
          busy={status === "working"}
          onFinish={() => void finish()}
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

function Session({
  session,
  lastFinishedAt,
  busy,
  onFinish,
  onChange,
}: {
  session: CurrentSession;
  lastFinishedAt?: string;
  busy: boolean;
  onFinish: () => void;
  onChange: () => void;
}) {
  const t = useTranslations("Training");
  const format = useFormatter();
  const label = sessionLabel(session.day.name);

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

      <Rule />

      <section className="flex flex-col gap-4">
        <Legend as="h2">{t("session.exercises")}</Legend>
        <ul className="flex flex-col">
          {session.day.items.map((entry) => (
            <li
              key={entry.exercise}
              className="flex flex-col gap-1 border-t border-nd-unlit py-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-x-6"
            >
              <p className="min-w-0 font-medium">
                {exerciseBySlug(entry.exercise)?.name ?? entry.exercise}
              </p>
              <p className="text-sm text-nd-dim sm:text-right" data-numeric>
                {[
                  t("session.prescription", {
                    sets: entry.sets,
                    repMin: entry.reps[0],
                    repMax: entry.reps[1],
                  }),
                  t("session.rest", { seconds: entry.restSeconds }),
                ].join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <Rule />

      {/* One filled block, because there is exactly one thing somebody came to
          this screen to do at the end of a session. Changing split is a thing
          that is available. */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <ActionButton type="button" disabled={busy} onClick={onFinish}>
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
      <p className="text-sm text-nd-dim" data-numeric>
        {t("choose.days", { count: split.days.length })}
      </p>
      <Ghost type="button" disabled={busy} onClick={onChoose}>
        {t("choose.start")}
      </Ghost>
    </>
  );
}
