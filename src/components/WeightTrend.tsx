"use client";

import { useFormatter, useTranslations } from "next-intl";

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
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-tight">{t("title")}</h2>
        <p className="text-sm opacity-70">{t("empty")}</p>
      </section>
    );
  }

  const change = trendChange(points);
  const average = tenths(latest.averageKg);

  const day = (date: string) =>
    format.dateTime(calendarDate(date), { day: "numeric", month: "short" });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-sm font-semibold tracking-tight">{t("title")}</h2>
        <p className="text-xs opacity-60">{t("legendAverage")}</p>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-2xl font-semibold tracking-tight">
          {t("currentValue", { weight: average })}
        </p>
        <p className="text-xs opacity-60">{t("currentLabel")}</p>
      </div>

      <svg
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        className="h-auto w-full"
        role="img"
        aria-label={t("chartLabel", {
          from: day(geometry.from),
          to: day(geometry.to),
          weight: average,
        })}
      >
        {/* The mornings themselves. Small and faint: visible if looked for, and
            never the shape the chart reads as. */}
        {geometry.points.map((point) => (
          <circle
            key={point.date}
            cx={point.x}
            cy={point.y}
            r={3}
            fill="currentColor"
            opacity={0.25}
          />
        ))}

        <path
          d={geometry.averagePath}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-xs opacity-60">
        <span>{day(geometry.from)}</span>
        <span>
          {t("axisRange", { low: geometry.lowKg, high: geometry.highKg })}
        </span>
        <span>{day(geometry.to)}</span>
      </div>

      <p className="flex flex-wrap gap-x-2 text-sm opacity-70">
        {change === undefined ? null : <span>{changeLine(change, t)}</span>}
        {latest.samples < TREND_WINDOW_DAYS ? (
          <span className="opacity-70">{t("thin", { count: latest.samples })}</span>
        ) : null}
      </p>

      <p className="text-xs opacity-60">{t("lead")}</p>
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
