import { describe, expect, it } from "vitest";

import { plot, type Axis, type ChartBox, type Sample } from "@/lib/chart";
import type { IsoDate } from "@/lib/storage/types";

const BOX: ChartBox = { width: 300, height: 100, padding: 10 };

/** A barbell axis: two and a half kilos is the smallest plate on the rack. */
const BAR: Axis = { minRange: 5, step: 2.5 };

const sample = (date: string, ...values: number[]): Sample => ({
  date: date as IsoDate,
  values,
});

/**
 * The geometry every chart in the app is drawn from (#81).
 *
 * `src/lib/weight/chart.test.ts` covers the same engine through the weight
 * series and did not change when this file appeared — those tests are the
 * regression net for the extraction. What is tested here is what only the
 * generic form has: an axis that is not kilos-and-halves, and a number of
 * series that is not two.
 */
describe("plot", () => {
  it("draws as many paths as there are series", () => {
    const drawn = plot(
      [sample("2026-01-01", 100, 110, 120), sample("2026-01-08", 105, 115, 125)],
      BOX,
      BAR,
    );

    expect(drawn?.paths).toHaveLength(3);
    expect(drawn?.samples[0]?.ys).toHaveLength(3);
  });

  it("draws a single series without needing a second one to compare against", () => {
    // The strength chart of a bodyweight movement has one line and no
    // estimate under it. A geometry that assumed a pair would have made that
    // screen invent a series to satisfy the chart.
    const drawn = plot([sample("2026-01-01", 60), sample("2026-01-15", 80)], BOX, BAR);

    expect(drawn?.paths).toEqual(["M10 90 L290 10"]);
  });

  it("rounds the axis outward to the caller's grid, not to halves", () => {
    // 2.5 kg is what a barbell actually moves in, so "82,5" is a load somebody
    // can load. An axis in halves would print 81,5 — a number no rack makes.
    const drawn = plot([sample("2026-02-01", 81.2), sample("2026-02-20", 96.4)], BOX, BAR);

    expect(drawn?.low).toBe(80);
    expect(drawn?.high).toBe(97.5);
  });

  it("refuses to zoom in past the floor the caller set", () => {
    // Two kilos of progress on a five-kilo floor is still two kilos of
    // progress: it must not be stretched to fill the box.
    const drawn = plot([sample("2026-03-01", 100), sample("2026-03-30", 102)], BOX, BAR);

    expect((drawn?.high ?? 0) - (drawn?.low ?? 0)).toBeGreaterThanOrEqual(5);
  });

  it("centres a flat series instead of pinning it to the floor", () => {
    // A month of the same number is a plateau, and a plateau drawn along the
    // bottom edge reads as a collapse that has bottomed out.
    const drawn = plot([sample("2026-04-01", 100), sample("2026-04-30", 100)], BOX, BAR);

    const middle = BOX.padding + (BOX.height - BOX.padding * 2) / 2;
    expect(drawn?.samples[0]?.ys[0]).toBeCloseTo(middle, 1);
  });

  it("places samples by date, not by their position in the list", () => {
    // Sessions are not evenly spaced — a week off is a week of the x axis.
    const drawn = plot(
      [sample("2026-05-01", 100), sample("2026-05-02", 100), sample("2026-05-11", 100)],
      BOX,
      BAR,
    );

    expect(drawn?.samples.map((s) => s.x)).toEqual([10, 38, 290]);
  });

  it("keeps every point inside the padded box", () => {
    const drawn = plot(
      [sample("2026-06-01", 60, 72), sample("2026-06-10", 140, 168), sample("2026-06-20", 95, 114)],
      BOX,
      BAR,
    );

    for (const point of drawn?.samples ?? []) {
      expect(point.x).toBeGreaterThanOrEqual(BOX.padding);
      expect(point.x).toBeLessThanOrEqual(BOX.width - BOX.padding);
      for (const y of point.ys) {
        expect(y).toBeGreaterThanOrEqual(BOX.padding);
        expect(y).toBeLessThanOrEqual(BOX.height - BOX.padding);
      }
    }
  });

  it("draws nothing for one reading, and nothing for none", () => {
    // One session is not a trend, and a line through it would be a shape
    // invented out of a single number.
    expect(plot([sample("2026-07-01", 100)], BOX, BAR)).toBeUndefined();
    expect(plot([], BOX, BAR)).toBeUndefined();
  });

  it("draws nothing when every reading landed on the same day", () => {
    expect(plot([sample("2026-07-01", 100), sample("2026-07-01", 110)], BOX, BAR)).toBeUndefined();
  });
});
