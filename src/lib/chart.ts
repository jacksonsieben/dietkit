import { daysBetween } from "@/lib/date";
import type { IsoDate } from "@/lib/storage/types";

/**
 * Turning a dated series into coordinates (#24, #81).
 *
 * This started as the weight chart's geometry and moved here when the training
 * log needed a curve of its own (`src/lib/training/history.ts`). The two series
 * are not the same measurement — one is a body on a scale every morning, the
 * other an estimated one-rep max off the best set of a session — but they are
 * the same *drawing*: values against dates, in a box, with an axis that refuses
 * to zoom in past a floor. A second copy of that arithmetic would have been a
 * second set of decisions about what a flat month looks like.
 *
 * Nothing here knows about SVG beyond producing numbers and path strings, and
 * nothing here knows what is being plotted: the units, the floor and the grid
 * the axis rounds to are the caller's, because they are the part that differs.
 */

export interface ChartBox {
  width: number;
  height: number;
  /** Room for the stroke and the dots so neither is clipped at the edges. */
  padding: number;
}

/**
 * How the vertical axis behaves, which is the whole of what makes a chart
 * honest or not.
 *
 * `minRange` is the smallest span the axis will ever cover. Without a floor,
 * every series is drawn against its own noise and a stable fortnight fills the
 * box with three hundred grams of water. `step` is the grid the two axis labels
 * are rounded outward to, so they read like numbers a person would say: halves
 * of a kilo for a body weight, a pair of plates for a barbell.
 */
export interface Axis {
  minRange: number;
  step: number;
}

/** One dated reading, with a value for each series drawn from it. */
export interface Sample {
  readonly date: IsoDate;
  readonly values: readonly number[];
}

export interface PlottedSample {
  readonly date: IsoDate;
  readonly x: number;
  /** One height per series, in the order the values came in. */
  readonly ys: readonly number[];
}

export interface Plot {
  readonly box: ChartBox;
  readonly samples: readonly PlottedSample[];
  /** One `d` per series, in the order the values came in. */
  readonly paths: readonly string[];
  /** The band the vertical axis covers, in the series' own unit. */
  readonly low: number;
  readonly high: number;
  readonly from: IsoDate;
  readonly to: IsoDate;
}

/**
 * The geometry, or nothing at all.
 *
 * Nothing is the right answer for a single reading and for an empty log: one
 * point is not a line, and a chart drawn through it would be a shape invented
 * out of one measurement. The screens say so in words instead.
 */
export function plot(
  samples: readonly Sample[],
  box: ChartBox,
  axis: Axis,
): Plot | undefined {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first === undefined || last === undefined) return undefined;

  const span = daysBetween(first.date, last.date);
  if (span <= 0) return undefined;

  const [low, high] = band(samples, axis);

  const left = box.padding;
  const usableWidth = box.width - box.padding * 2;
  const top = box.padding;
  const usableHeight = box.height - box.padding * 2;

  const height = (value: number) =>
    round(top + ((high - value) / (high - low)) * usableHeight);

  const plotted = samples.map((sample) => ({
    date: sample.date,
    x: round(
      left + (daysBetween(first.date, sample.date) / span) * usableWidth,
    ),
    ys: sample.values.map(height),
  }));

  return {
    box,
    samples: plotted,
    paths: (first.values ?? []).map((_, series) =>
      plotted
        .map(
          (sample, index) =>
            `${index === 0 ? "M" : "L"}${sample.x} ${sample.ys[series] ?? 0}`,
        )
        .join(" "),
    ),
    low,
    high,
    from: first.date,
    to: last.date,
  };
}

/**
 * The vertical band: everything drawn, widened to the axis floor if the real
 * spread is smaller, then rounded outward to the axis grid.
 *
 * Widening happens around the middle of the data rather than upward from the
 * bottom, so a flat series is drawn flat *and* centred instead of pinned to the
 * floor of the box, which would read as a decline that has bottomed out.
 */
function band(
  samples: readonly Sample[],
  axis: Axis,
): [low: number, high: number] {
  const values = samples.flatMap((sample) => sample.values);
  let low = Math.min(...values);
  let high = Math.max(...values);

  const short = axis.minRange - (high - low);
  if (short > 0) {
    low -= short / 2;
    high += short / 2;
  }

  return [
    Math.floor(low / axis.step) * axis.step,
    Math.ceil(high / axis.step) * axis.step,
  ];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
