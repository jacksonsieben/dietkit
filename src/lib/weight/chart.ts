import { plot, type Axis, type ChartBox } from "@/lib/chart";
import type { IsoDate } from "@/lib/storage/types";

import type { TrendPoint } from "./trend";

/**
 * Turning a trend into coordinates (#24).
 *
 * Separate from the component so the two decisions that make this chart honest
 * — where the vertical band starts and stops, and how days map to horizontal
 * distance — can be tested rather than eyeballed. Nothing here knows about SVG
 * beyond producing numbers and one path string.
 *
 * The arithmetic itself moved to `src/lib/chart.ts` when the training log
 * needed a curve too (#81); what stayed is this file's vocabulary — kilos, a
 * raw weighing, a moving average — because a screen about body weight should
 * not have to read `ys[1]` to find its line. The tests below this file did not
 * change when the move happened, which is the whole reason to trust it.
 */

export type { ChartBox };

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

/** Half a kilo: the finest gradation anyone reads off a bathroom scale. */
const WEIGHT_AXIS: Axis = { minRange: MIN_RANGE_KG, step: 0.5 };

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
  const drawn = plot(
    points.map((point) => ({
      date: point.date,
      values: [point.weightKg, point.averageKg],
    })),
    box,
    WEIGHT_AXIS,
  );
  if (!drawn) return undefined;

  return {
    box: drawn.box,
    points: drawn.samples.map((sample, index) => ({
      date: sample.date,
      weightKg: points[index]?.weightKg ?? 0,
      averageKg: points[index]?.averageKg ?? 0,
      x: sample.x,
      y: sample.ys[0] ?? 0,
      averageY: sample.ys[1] ?? 0,
    })),
    averagePath: drawn.paths[1] ?? "",
    lowKg: drawn.low,
    highKg: drawn.high,
    from: drawn.from,
    to: drawn.to,
  };
}
