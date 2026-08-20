import { daysBetween } from "@/lib/date";
import type { IsoDate, WeightEntry } from "@/lib/storage/types";

/**
 * The moving average that makes a weight log readable (#24).
 *
 * A body weighed on consecutive mornings can differ by a kilo without anything
 * having happened to it: salt, water, what is still in transit, where the cycle
 * is. Someone reading the raw series is reading mostly that, and reacting to it
 * — cutting harder after a bad Tuesday — is reacting to noise. Averaging a
 * week's worth leaves the part that is actually moving.
 */

export const TREND_WINDOW_DAYS = 7;

export interface TrendPoint {
  date: IsoDate;
  /** What the scale said that morning. */
  weightKg: number;
  /** Mean of every weighing in the window ending on this day. */
  averageKg: number;
  /** How many weighings that mean is made of — 1 on the first day logged. */
  samples: number;
}

/**
 * One point per weighing, oldest first, each carrying its trailing average.
 *
 * The window is seven *days*, not seven entries. Someone who steps on the scale
 * twice a week would otherwise have an "average" spanning three and a half
 * weeks, lagging so far behind that a real change takes a month to show up —
 * and the same chart would mean something different for every user depending on
 * how often they weigh in.
 *
 * The average is computed from the first day onward rather than withheld until
 * a full week exists. A new log would otherwise open on an empty chart, which
 * is the worst possible first impression for the screen whose whole job is to
 * show progress. `samples` is on every point so the reader can be told how thin
 * an early one is instead of being left to assume.
 */
export function weightTrend(
  entries: readonly WeightEntry[],
  windowDays: number = TREND_WINDOW_DAYS,
): TrendPoint[] {
  const ordered = entries
    .slice()
    .sort((left, right) => (left.date < right.date ? -1 : 1));

  return ordered.map((entry, index) => {
    let total = 0;
    let samples = 0;

    // Backwards from this day until the window runs out. The list is sorted, so
    // the first entry outside it ends the walk.
    for (let previous = index; previous >= 0; previous -= 1) {
      const older = ordered[previous];
      if (older === undefined) break;
      if (daysBetween(older.date, entry.date) >= windowDays) break;

      total += older.weightKg;
      samples += 1;
    }

    return {
      date: entry.date,
      weightKg: entry.weightKg,
      averageKg: total / samples,
      samples,
    };
  });
}

export interface TrendChange {
  /** Negative when the trend is down. */
  kg: number;
  /** Calendar days between the two ends — not the number of weighings. */
  days: number;
}

/**
 * How far the trend has moved across everything logged.
 *
 * Both ends are averages, so this is not "first weighing minus last weighing" —
 * that difference is two noisy numbers subtracted from each other, and it can
 * report a gain in a week that went down. `undefined` when there is nothing to
 * compare: a single point, or several on one day.
 */
export function trendChange(
  points: readonly TrendPoint[],
): TrendChange | undefined {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined || first === last) {
    return undefined;
  }

  const days = daysBetween(first.date, last.date);
  if (days === 0) return undefined;

  return { kg: last.averageKg - first.averageKg, days };
}
