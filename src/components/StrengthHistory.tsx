"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { displayFontSize, DotText } from "@/components/dot/DotText";
import { Hairline, Legend } from "@/components/nd/kit";
import type { ChartBox } from "@/lib/chart";
import { calendarDate } from "@/lib/date";
import { getRepository } from "@/lib/storage";
import type { TrainingSession } from "@/lib/storage/types";
import {
  estimateFrom,
  recordLine,
  setLine,
} from "@/components/training/records";
import { isUnilateral } from "@/lib/training/catalog";
import {
  loggedMovements,
  movementRecords,
  movementSessions,
  strengthCurve,
  strengthGeometry,
  ONE_REP_MAX_LIMIT,
} from "@/lib/training/history";
import { loadHistory } from "@/lib/training/store";

/**
 * What the log says over time (#81).
 *
 * The payoff for having kept a log at all: not "what did I do on the 14th",
 * which the log already answered, but "am I getting stronger", which is a
 * shape. One movement at a time, because strength is per movement — a bench
 * and a squat averaged together is a number about nobody.
 *
 * Every figure on this screen is derived from the sessions on the device when
 * the screen opens. There is no stored record, no cached best, nothing that
 * survives deleting the workout that set it (docs/DECISIONS.md § D20). And
 * nothing leaves: this reads IndexedDB through the same repository as the rest
 * of the app and makes no request (§ D1).
 *
 * The chart is the weight trend's chart — same geometry, same dot-and-line
 * grammar — because a second charting idea would be a second set of decisions
 * about what a flat month looks like. What differs is the axis, which steps in
 * plates rather than in halves of a kilo.
 */

const BOX: ChartBox = { width: 640, height: 200, padding: 12 };

type Loaded = TrainingSession[] | "loading" | "loadFailed";

export function StrengthHistory() {
  const t = useTranslations("Training.history");

  const [history, setHistory] = useState<Loaded>("loading");
  const [picked, setPicked] = useState<string>();

  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const sessions = await loadHistory(getRepository());
        if (live) setHistory(sessions);
      } catch {
        if (live) setHistory("loadFailed");
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  if (history === "loading") {
    return <p className="text-sm text-nd-dim">{t("loading")}</p>;
  }

  if (history === "loadFailed") {
    return <p className="text-sm text-nd-red-ink">{t("loadError")}</p>;
  }

  const movements = loggedMovements(history);
  const first = movements[0];

  if (!first) {
    return <p className="text-sm text-nd-dim">{t("empty")}</p>;
  }

  /*
   * The most recently trained movement, until somebody picks another. Falling
   * back rather than clamping the state: a movement that was picked and then
   * dropped out of the log — the last session holding it deleted — should not
   * leave the screen blank.
   */
  const slug =
    movements.find((movement) => movement.slug === picked)?.slug ?? first.slug;

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <Legend as="h2" id="movements">
          {t("movements")}
        </Legend>
        <ul
          aria-labelledby="movements"
          className="flex flex-wrap gap-2"
        >
          {movements.map((movement) => (
            <li key={movement.slug}>
              <button
                type="button"
                aria-pressed={movement.slug === slug}
                onClick={() => setPicked(movement.slug)}
                className={chip(movement.slug === slug)}
              >
                {movement.name}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <Movement key={slug} slug={slug} history={history} />
    </div>
  );
}

/**
 * The picker's two states, written out rather than composed from `Ghost`.
 *
 * A selected chip is the inverted panel and an unselected one is the outline,
 * which is this world's existing pair — but the two differ in the text colour,
 * and stacking `text-nd-ground` after a component's own `text-nd-ink` leaves
 * which one wins to stylesheet order rather than to intent.
 */
function chip(selected: boolean): string {
  return `inline-flex w-fit items-center justify-center border border-nd-ink px-3 py-1.5 text-xs font-medium tracking-[0.08em] uppercase ${
    selected ? "nd-invert bg-nd-ink text-nd-ground" : "text-nd-ink"
  }`;
}

function Movement({
  slug,
  history,
}: {
  slug: string;
  history: readonly TrainingSession[];
}) {
  const t = useTranslations("Training.history");
  const format = useFormatter();

  const unilateral = isUnilateral(slug);
  const records = movementRecords(history, slug);
  const sessions = movementSessions(history, slug);
  const curve = strengthCurve(history, slug);
  const geometry = strengthGeometry(curve, BOX);
  const best = records.bestEstimate;

  /*
   * The one headline on this screen (`src/components/nd/readouts.test.ts`).
   *
   * The estimate when there is one, and the rep record when there is not: a
   * bodyweight movement has no 1RM to estimate, and a panel reading "0" or an
   * empty frame would both be the screen refusing to answer a question it can
   * answer. The unit line underneath says which of the two is lit, because the
   * numbers are not interchangeable.
   */
  const estimated = best?.estimateKg;
  const headline = format.number(estimated ?? records.mostReps?.reps ?? 0);

  const day = (date: string) =>
    format.dateTime(calendarDate(date), { day: "numeric", month: "short" });

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <DotText className="block" style={{ fontSize: displayFontSize(headline) }}>
          {headline}
        </DotText>
        <p className="text-sm tracking-[0.08em] uppercase">
          {estimated === undefined ? t("unitReps") : t("unit")}
        </p>
        {best ? (
          <p className="text-sm text-nd-dim" data-numeric="">
            {estimateFrom(best, unilateral, t)}
          </p>
        ) : (
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("noEstimate")}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("chartLegend")}</Legend>
        {geometry === undefined || estimated === undefined ? (
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("chartEmpty")}
          </p>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${BOX.width} ${BOX.height}`}
              className="h-auto w-full"
              role="img"
              aria-label={t("chartLabel", {
                movement: sessions[0]?.dayName ?? slug,
                from: day(geometry.from),
                to: day(geometry.to),
                estimate: estimated,
              })}
            >
              {/*
                The band the numbers under the chart name, drawn rather than
                implied — the same two hairlines the weight trend uses, for the
                same reason: without them the same wiggle reads as dramatic on
                five kilos and as dramatic on fifty.
              */}
              <line
                x1={0}
                x2={BOX.width}
                y1={BOX.padding}
                y2={BOX.padding}
                stroke="var(--nd-unlit)"
                strokeWidth={1}
              />
              <line
                x1={0}
                x2={BOX.width}
                y1={BOX.height - BOX.padding}
                y2={BOX.height - BOX.padding}
                stroke="var(--nd-unlit)"
                strokeWidth={1}
              />

              {/* The load that was actually on the bar: series zero, unlit. */}
              {geometry.samples.map((sample) => (
                <circle
                  key={sample.date}
                  cx={sample.x}
                  cy={sample.ys[0]}
                  r={3}
                  fill="var(--nd-unlit)"
                />
              ))}

              {/* The estimate: series one, and the only ink in the frame. */}
              <path
                d={geometry.paths[1]}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
            </svg>

            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-xs text-nd-dim">
              <span data-numeric="">{day(geometry.from)}</span>
              <span data-numeric="">
                {t("axisRange", { low: geometry.low, high: geometry.high })}
              </span>
              <span data-numeric="">{day(geometry.to)}</span>
            </div>

            {/*
              Inside the branch on purpose: these two sentences read the chart
              — which dots are the load, why a set of thirty gets no line —
              and printed under the empty state they would be a caption for a
              picture that is not there.
            */}
            <p className="max-w-prose text-xs leading-relaxed text-nd-dim">
              {t("chartLead")}
            </p>
            <p className="max-w-prose text-xs leading-relaxed text-nd-dim">
              {t("capped", { limit: ONE_REP_MAX_LIMIT })}
            </p>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("records.legend")}</Legend>
        <ul className="flex flex-col">
          {(["heaviest", "bestEstimate", "mostReps"] as const).map((kind) => {
            const held = records[kind];
            if (!held) return null;

            return (
              <li key={kind} className="flex flex-col gap-1 py-3">
                <Hairline />
                <p className="text-xs tracking-[0.08em] text-nd-dim uppercase">
                  {t(`records.${kind}`)}
                </p>
                <p className="text-sm" data-numeric="">
                  {recordLine(kind, held, unilateral, t)}
                </p>
                <p className="text-xs text-nd-dim" data-numeric="">
                  {t("records.when", { date: day(held.date) })}
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("log.legend")}</Legend>
        <ul className="flex flex-col">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-col gap-1 py-3">
              <Hairline />
              <p className="text-sm" data-numeric="">
                {t("log.day", { date: day(session.date), day: session.dayName })}
              </p>
              <p className="text-sm text-nd-dim" data-numeric="">
                {session.sets
                  .map((set) => setLine(set, unilateral, t))
                  .join(" · ")}
              </p>
              {session.best?.estimateKg === undefined ? null : (
                <p className="text-xs text-nd-dim" data-numeric="">
                  {estimateFrom(session.best, unilateral, t)}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
