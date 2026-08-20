import { describe, expect, it } from "vitest";

import type { MacroLine } from "@/lib/diet/reconcile";

import { SEGMENT_COUNT, segmentsFor } from "./segments";

function line(partial: Partial<MacroLine> = {}): MacroLine {
  return {
    macro: "proteinG",
    target: 100,
    actual: 100,
    delta: 0,
    state: "on",
    ...partial,
  };
}

const count = (segments: readonly string[], kind: string) =>
  segments.filter((segment) => segment === kind).length;

describe("segmentsFor", () => {
  it("fills the strip when the target is met", () => {
    const segments = segmentsFor(line());

    expect(count(segments, "on")).toBe(SEGMENT_COUNT);
  });

  it("lights something for a plan that has barely started", () => {
    // 1% of the target rounds to nothing on a 24-segment strip. A dark strip
    // beside a plan that does contain food is the strip lying.
    const segments = segmentsFor(line({ actual: 1, state: "under" }));

    expect(count(segments, "on")).toBe(1);
  });

  it("leaves something dark for a plan that is nearly there", () => {
    const segments = segmentsFor(line({ actual: 99, delta: -1, state: "under" }));

    expect(count(segments, "on")).toBe(SEGMENT_COUNT - 1);
    expect(count(segments, "short")).toBe(1);
  });

  it("pulses only what is missing, and only while it is missing", () => {
    const short = segmentsFor(line({ actual: 50, delta: -50, state: "under" }));
    const met = segmentsFor(line({ actual: 101, delta: 1, state: "on" }));

    expect(count(short, "short")).toBe(SEGMENT_COUNT / 2);
    expect(count(met, "short")).toBe(0);
  });

  it("marks the excess at the far end, in the size of the excess", () => {
    const segments = segmentsFor(line({ actual: 125, delta: 25, state: "over" }));

    expect(count(segments, "over")).toBe(6);
    expect(segments[SEGMENT_COUNT - 1]).toBe("over");
    expect(segments[0]).toBe("on");
  });

  it("stays dark rather than dividing by a target nobody set", () => {
    const segments = segmentsFor(line({ target: 0, actual: 0 }));

    expect(count(segments, "off")).toBe(SEGMENT_COUNT);
  });
});
