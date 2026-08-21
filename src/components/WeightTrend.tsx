"use client";

import { useFormatter, useTranslations } from "next-intl";

import { DotText, displayFontSize } from "@/components/dot/DotText";
import { Legend } from "@/components/nd/kit";
import { calendarDate } from "@/lib/date";
import type { WeightEntry } from "@/lib/storage/types";
import { chartGeometry, type ChartBox } from "@/lib/weight/chart";
import { TREND_WINDOW_DAYS, trendChange, weightTrend } from "@/lib/weight/trend";

/**
 * The weight trend (#24): a seven-day moving average, drawn over the mornings
 * it is made of.
 *
 * The line is the headline and the individual weighings are faint dots behind
 * it — present, because hiding the measurements someone took would be its own
 * kind of dishonesty, but deliberately not the thing the eye lands on. Read the
 * other way round, this chart would do harm: a kilo of water on a Tuesday looks
 * exactly like a kilo of anything else, and the reaction it invites is to a
 * number that means nothing.
 *
 * Hand-drawn SVG rather than a charting library. There is one line and a
 * scatter of dots here, the geometry is a dozen lines in src/lib/weight/chart.ts
 * with tests on it, and the alternative is shipping a few hundred kilobytes to
 * a phone that has to work offline.
 *
 * This is the only chart in the app, and the instrument world had no chart
 * vocabulary until #68 gave it one. Two shapes were rejected before this one.
 * Bars — a segment column per day — imply a zero baseline, and body weight
 * varies by about two kilos on eighty-five: drawn from zero it is seven
 * identical bars, drawn from eighty it is a lie about proportion. A dot-matrix
 * scatter on the same 5x7 grid as the type was the tempting one, and it fails
 * for the opposite reason: at that pitch the whole meaningful range quantises
 * to about five rows, which throws away exactly the resolution that makes a
 * trend readable.
 *
 * So the line stays and its materials change. Ink for the average, `--nd-unlit`
 * for the mornings — a real colour in both themes rather than ink at a quarter
 * alpha, which is a value that is in no palette — and the band the axis covers
 * drawn as real hairlines instead of implied, because in this world the
 * mechanism is visible.
 */

const BOX: ChartBox = { width: 640, height: 200, padding: 12 };

export function WeightTrend({ entries }: { entries: readonly WeightEntry[] }) {
  const t = useTranslations("Weight.trend");
  const format = useFormatter();

  const points = weightTrend(entries);
  const geometry = chartGeometry(points, BOX);
  const latest = points.at(-1);

  if (geometry === undefined || latest === undefined) {
    return (
      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("title")}</Legend>
        <p className="text-sm text-nd-dim">{t("empty")}</p>
      </section>
    );
  }

  const change = trendChange(points);
  const average = tenths(latest.averageKg);

  /*
   * The panel's string, formatted rather than stringified.
   *
   * `DotText` renders one 5x7 cell per character, so what goes in is what gets
   * lit: `String(82.4)` would light a full stop in a locale that writes a
   * comma. The glyph table has both, and picking the wrong one is the kind of
   * mistake that only shows up on a device set to pt-BR.
   */
  const reading = format.number(average, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const day = (date: string) =>
    format.dateTime(calendarDate(date), { day: "numeric", month: "short" });

  return (
    <section className="flex flex-col gap-3">
      {/*
        Legend, panel, unit — the identical three-line stack /hoje gives the
        energy target, and not a stylistic echo: DESIGN.md forbids rendering the
        same number in two voices, and the energy target and the body weight are
        measurements of the same body. Setting one in light and the other in
        running type would say they came off two different instruments.

        `displayFontSize` is shared for the same reason. It fits the string to
        the charter's column, so `82,4` here and `2380` on /hoje sit at pitches
        that were worked out by one piece of arithmetic rather than two.
      */}
      <Legend as="h2">{t("title")}</Legend>
      <DotText
        className="block"
        style={{ fontSize: displayFontSize(reading) }}
      >
        {reading}
      </DotText>
      <p className="text-sm tracking-[0.08em] uppercase">{t("currentUnit")}</p>

      <svg
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        className="mt-2 h-auto w-full"
        role="img"
        aria-label={t("chartLabel", {
          from: day(geometry.from),
          to: day(geometry.to),
          weight: average,
        })}
      >
        {/*
          The band the numbers under the chart name, drawn instead of implied.
          Two hairlines at the top and bottom of the plot say what the vertical
          extent of the line actually means; without them the same wiggle reads
          as dramatic on a range of two kilos and as dramatic on a range of ten.
          `--nd-unlit` and one pixel, so they are structure rather than data.
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

        {/*
          The mornings themselves. Present, because hiding the measurements
          someone took would be its own kind of dishonesty, and unlit, because
          they are not the shape the chart reads as. The colour is the palette's
          `--nd-unlit` rather than ink at a quarter alpha: this world has no
          faded ink, since a fade is a different colour on every ground it lands
          on and there are two grounds here.
        */}
        {geometry.points.map((point) => (
          <circle
            key={point.date}
            cx={point.x}
            cy={point.y}
            r={3}
            fill="var(--nd-unlit)"
          />
        ))}

        {/*
          The average, and the only ink in the frame. Square caps and joins,
          not round: the rest of this world is drawn with a flat pen, and a
          rounded stroke here would be the one soft edge on the screen.
        */}
        <path
          d={geometry.averagePath}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>

      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-xs text-nd-dim">
        <span data-numeric>{day(geometry.from)}</span>
        <span data-numeric>
          {t("axisRange", { low: geometry.lowKg, high: geometry.highKg })}
        </span>
        <span data-numeric>{day(geometry.to)}</span>
      </div>

      <p className="mt-3 flex flex-wrap gap-x-2 text-sm">
        {change === undefined ? null : <span>{changeLine(change, t)}</span>}
        {latest.samples < TREND_WINDOW_DAYS ? (
          <span className="text-nd-dim">
            {t("thin", { count: latest.samples })}
          </span>
        ) : null}
      </p>

      <p className="text-xs text-nd-dim">{t("lead")}</p>
    </section>
  );
}

/**
 * Which of the three sentences the change gets.
 *
 * "Flat" is its own case rather than a rounding artefact of the other two: a
 * hundred grams over a fortnight is not a loss, and printing it as one would be
 * the chart telling a story out of noise.
 */
function changeLine(
  change: { kg: number; days: number },
  t: (
    key: "changeDown" | "changeUp" | "changeFlat",
    values: { weight: number; days: number },
  ) => string,
): string {
  const kg = tenths(Math.abs(change.kg));

  if (kg === 0) return t("changeFlat", { weight: kg, days: change.days });

  return t(change.kg < 0 ? "changeDown" : "changeUp", {
    weight: kg,
    days: change.days,
  });
}

/** Weights are read to a tenth of a kilo. Nothing below that is a measurement. */
function tenths(kg: number): number {
  return Math.round(kg * 10) / 10;
}
