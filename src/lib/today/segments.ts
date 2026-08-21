import type { MacroLine } from "@/lib/diet/reconcile";

/**
 * A macro line as a strip of lit segments (#61).
 *
 * The arithmetic is here rather than in the component because it decides what
 * the screen *claims*, and two of its rules are easy to get subtly wrong in a
 * way no screenshot would catch: a plan that covers a sliver of its target must
 * still light something, or the strip says zero when the answer is "barely";
 * and a plan that covers all but a sliver must leave something unlit, or the
 * strip says done when the answer is "nearly".
 */

export type Segment =
  /** Accounted for, within target. */
  | "on"
  /** Accounted for, and past the target — the only red on the strip. */
  | "over"
  /** Not accounted for, on a macro the plan is short of. Pulses. */
  | "short"
  /** Not accounted for, on a macro already within tolerance. Still. */
  | "off";

/** Enough to read a tenth at a glance, few enough to stay legible on a phone. */
export const SEGMENT_COUNT = 24;

export interface SegmentOptions {
  /** How many segments the strip is drawn from. */
  count?: number;
  /**
   * Draw the shortfall still rather than pulsing.
   *
   * The pulse is the only animation in the app, and it belongs to the day,
   * because the day is what you are trying to close. A screen that repeats it
   * once per meal has thirty strips seeking at once and has taught the reader
   * to ignore all of them — so a strip that is *not* the verdict asks for the
   * same arithmetic with the motion taken out.
   */
  quiet?: boolean;
}

export function segmentsFor(
  line: MacroLine,
  { count = SEGMENT_COUNT, quiet = false }: SegmentOptions = {},
): Segment[] {
  // A target of zero is not a plan anyone made; it happens to a plan whose
  // targets have not been derived yet, and the honest strip for it is dark.
  if (line.target <= 0) return Array.from({ length: count }, () => "off");

  const ratio = line.actual / line.target;
  const lit = litCount(ratio, count);
  const over = line.state === "over" ? overCount(ratio, count) : 0;
  const rest: Segment = line.state === "under" && !quiet ? "short" : "off";

  return Array.from({ length: count }, (_unused, index) => {
    if (index >= lit) return rest;
    return index >= lit - over ? "over" : "on";
  });
}

/**
 * Rounds *toward the truth being visible*: anything above nothing lights one
 * segment, and anything below the target leaves one dark.
 */
function litCount(ratio: number, count: number): number {
  if (ratio <= 0) return 0;
  if (ratio >= 1) return count;

  const exact = ratio * count;
  return Math.min(count - 1, Math.max(1, Math.round(exact)));
}

/** How much of a full strip the excess is worth, never more than the strip. */
function overCount(ratio: number, count: number): number {
  return Math.min(count, Math.max(1, Math.round((ratio - 1) * count)));
}
