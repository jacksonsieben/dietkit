import { daysBetween } from "@/lib/date";
import type { IsoDate } from "@/lib/storage/types";

import type { TrendPoint } from "./trend";

/**
 * Turning a trend into coordinates (#24).
 *
 * Separate from the component so the two decisions that make this chart honest
 * — where the vertical band starts and stops, and how days map to horizontal
 * distance — can be tested rather than eyeballed. Nothing here knows about SVG
 * beyond producing numbers and one path string.
 */

/**
 * The smallest weight range the vertical axis will ever show.
 *
 * Without a floor, a stable fortnight is drawn against its own noise: three
 * hundred grams of water fills the full height of the box and the line looks
 * like a mountain range. That is the exact misreading this screen exists to
 * prevent, so the axis refuses to zoom in past two kilos and a flat week is
 * allowed to look flat.
 */
export const MIN_RANGE_KG = 2;

export interface ChartBox {
  width: number;
  height: number;
  /** Room for the stroke and the dots so neither is clipped at the edges. */
  padding: number;
}

export interface PlottedPoint {
  date: IsoDate;
  weightKg: number;
  averageKg: number;
  x: number;
  /** The raw weighing — drawn faintly. */
  y: number;
  /** The moving average — the line. */
  averageY: number;
}

export interface ChartGeometry {
  box: ChartBox;
  points: PlottedPoint[];
  /** `d` for the average line. */
  averagePath: string;
  /** The band the vertical axis covers, in kilos. */
  lowKg: number;
  highKg: number;
  from: IsoDate;
  to: IsoDate;
}

export function chartGeometry(
  points: readonly TrendPoint[],
  box: ChartBox,
): ChartGeometry | undefined {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return undefined;

  const span = daysBetween(first.date, last.date);
  if (span <= 0) return undefined;

  const [lowKg, highKg] = band(points);

  const left = box.padding;
  const usableWidth = box.width - box.padding * 2;
  const top = box.padding;
  const usableHeight = box.height - box.padding * 2;

  const y = (kg: number) =>
    round(top + ((highKg - kg) / (highKg - lowKg)) * usableHeight);

  const plotted = points.map((point) => ({
    date: point.date,
    weightKg: point.weightKg,
    averageKg: point.averageKg,
    x: round(left + (daysBetween(first.date, point.date) / span) * usableWidth),
    y: y(point.weightKg),
    averageY: y(point.averageKg),
  }));

  return {
    box,
    points: plotted,
    averagePath: plotted
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.averageY}`)
      .join(" "),
    lowKg,
    highKg,
    from: first.date,
    to: last.date,
  };
}

/**
 * The vertical band: everything drawn, widened to `MIN_RANGE_KG` if the real
 * spread is smaller, then rounded outward to half a kilo so the two labels on
 * the axis are numbers a person would say out loud.
 */
function band(points: readonly TrendPoint[]): [low: number, high: number] {
  const values = points.flatMap((point) => [point.weightKg, point.averageKg]);
  let low = Math.min(...values);
  let high = Math.max(...values);

  const short = MIN_RANGE_KG - (high - low);
  if (short > 0) {
    low -= short / 2;
    high += short / 2;
  }

  return [Math.floor(low * 2) / 2, Math.ceil(high * 2) / 2];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
