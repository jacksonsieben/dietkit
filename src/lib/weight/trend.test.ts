import { describe, expect, it } from "vitest";

import { FORTNIGHT, weighing } from "./trend.fixture";
import { TREND_WINDOW_DAYS, trendChange, weightTrend } from "./trend";

const round = (value: number) => Math.round(value * 1000) / 1000;

describe("weightTrend", () => {
  it("starts the average at the first weighing, with nothing to average yet", () => {
    const [first] = weightTrend([weighing("2026-08-01", 84.2)]);

    expect(first?.averageKg).toBe(84.2);
    expect(first?.samples).toBe(1);
  });

  it("averages the days inside the window and nothing older", () => {
    // Day 8 sees days 2–8. Day 1 has just fallen out, and its 84.2 — the
    // highest number in the set — would drag the average up if it had not.
    const points = weightTrend(FORTNIGHT);
    const eighth = points[7];

    const window = FORTNIGHT.slice(1, 8).map((entry) => entry.weightKg);
    const expected = window.reduce((sum, kg) => sum + kg, 0) / window.length;

    expect(eighth?.date).toBe("2026-08-08");
    expect(eighth?.samples).toBe(TREND_WINDOW_DAYS);
    expect(round(eighth?.averageKg ?? 0)).toBe(round(expected));
  });

  it("never averages more than the window's worth of days", () => {
    const points = weightTrend(FORTNIGHT);

    for (const point of points) {
      expect(point.samples).toBeLessThanOrEqual(TREND_WINDOW_DAYS);
    }
  });

  it("counts days rather than entries, so a sparse log is not stale", () => {
    // Weighing twice a week. Seven *entries* would reach back three and a half
    // weeks — the average would still be quoting a weight from last month.
    const sparse = [
      weighing("2026-07-01", 90),
      weighing("2026-07-05", 89),
      weighing("2026-07-08", 88),
      weighing("2026-07-12", 87),
      weighing("2026-07-15", 86),
      weighing("2026-07-19", 85),
      weighing("2026-07-22", 84),
    ];

    const last = weightTrend(sparse).at(-1);

    // 16 July onwards: the 19th and the 22nd.
    expect(last?.samples).toBe(2);
    expect(last?.averageKg).toBe(84.5);
  });

  it("includes the day exactly six days back and drops the seventh", () => {
    const points = weightTrend([
      weighing("2026-08-01", 100),
      weighing("2026-08-07", 80),
      weighing("2026-08-08", 80),
    ]);

    // The 7th is six days after the 1st, so both are in.
    expect(points[1]?.samples).toBe(2);
    // The 8th is seven days after, so the 1st is out.
    expect(points[2]?.samples).toBe(2);
    expect(points[2]?.averageKg).toBe(80);
  });

  it("smooths a single bad morning instead of reporting it", () => {
    const spike = [
      weighing("2026-08-01", 80),
      weighing("2026-08-02", 80),
      weighing("2026-08-03", 83),
      weighing("2026-08-04", 80),
    ];

    const last = weightTrend(spike).at(-1);

    // Three kilos of salt and water on Monday moves the trend by three quarters
    // of one. That is the entire point of the screen.
    expect(last?.weightKg).toBe(80);
    expect(round(last?.averageKg ?? 0)).toBe(80.75);
  });

  it("orders by day, whatever order the entries arrive in", () => {
    // `loadWeightLog` hands the list back newest first, for the list view.
    const points = weightTrend([...FORTNIGHT].reverse());

    expect(points.map((point) => point.date)).toEqual(
      FORTNIGHT.map((entry) => entry.date),
    );
  });

  it("survives a backfilled day landing in the middle of the log", () => {
    const points = weightTrend([
      weighing("2026-08-01", 84),
      weighing("2026-08-03", 82),
      weighing("2026-08-02", 83),
    ]);

    expect(points.map((point) => point.date)).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
    expect(points.at(-1)?.averageKg).toBe(83);
  });

  it("is empty for an empty log", () => {
    expect(weightTrend([])).toEqual([]);
  });

  it("does not lose a day to daylight saving", () => {
    // Brazil has run DST across this weekend in the past, and local-time date
    // subtraction returns 6.958… days for a week that straddles one.
    const points = weightTrend([
      weighing("2026-10-17", 90),
      weighing("2026-10-24", 80),
    ]);

    expect(points[1]?.samples).toBe(1);
  });
});

describe("trendChange", () => {
  it("compares the two ends of the average, not the two weighings", () => {
    const change = trendChange(weightTrend(FORTNIGHT));

    expect(change?.days).toBe(13);
    expect(change?.kg).toBeLessThan(0);
  });

  it("reports a fall even when the last morning was up", () => {
    // Raw arithmetic on the ends says +2 kg. The week actually went down.
    const points = weightTrend([
      weighing("2026-08-01", 80),
      weighing("2026-08-02", 79),
      weighing("2026-08-03", 78),
      weighing("2026-08-04", 82),
    ]);

    expect(points.at(-1)?.weightKg).toBeGreaterThan(points[0]?.weightKg ?? 0);
    expect(trendChange(points)?.kg).toBeLessThan(0);
  });

  it("has nothing to say about one weighing", () => {
    expect(trendChange(weightTrend([weighing("2026-08-01", 84)]))).toBeUndefined();
  });

  it("has nothing to say about an empty log", () => {
    expect(trendChange([])).toBeUndefined();
  });
});
