import { describe, expect, it } from "vitest";

import { chartGeometry, type ChartBox } from "./chart";
import { FORTNIGHT, weighing } from "./trend.fixture";
import { weightTrend } from "./trend";

const BOX: ChartBox = { width: 600, height: 200, padding: 10 };

const geometryFor = (entries: Parameters<typeof weightTrend>[0]) =>
  chartGeometry(weightTrend(entries), BOX);

describe("chartGeometry", () => {
  it("spans the box from the first day to the last", () => {
    const geometry = geometryFor(FORTNIGHT);

    expect(geometry?.points[0]?.x).toBe(BOX.padding);
    expect(geometry?.points.at(-1)?.x).toBe(BOX.width - BOX.padding);
    expect(geometry?.from).toBe("2026-08-01");
    expect(geometry?.to).toBe("2026-08-14");
  });

  it("places a day by its date, not by its position in the list", () => {
    // A month's gap in the middle should be a month's gap on the chart. Spacing
    // the points evenly would draw a steady decline over a log that stopped.
    const geometry = geometryFor([
      weighing("2026-08-01", 84),
      weighing("2026-08-02", 83),
      weighing("2026-09-01", 82),
    ]);

    const [first, second] = geometry?.points ?? [];
    expect(second?.x).toBeLessThan((first?.x ?? 0) + BOX.width / 10);
  });

  it("refuses to zoom in past two kilos", () => {
    // Four hundred grams of water across a fortnight. Fitted to the box it
    // would look like a collapse; the floor keeps it looking like the nothing
    // it is.
    const geometry = geometryFor([
      weighing("2026-08-01", 80),
      weighing("2026-08-08", 80.4),
    ]);

    expect((geometry?.highKg ?? 0) - (geometry?.lowKg ?? 0)).toBeGreaterThanOrEqual(2);

    // And the consequence, which is the part that matters: four hundred grams
    // must not travel most of the height of the box.
    const [first, last] = geometry?.points ?? [];
    const travel = Math.abs((last?.averageY ?? 0) - (first?.averageY ?? 0));
    expect(travel).toBeLessThan((BOX.height - BOX.padding * 2) / 3);
  });

  it("keeps a real change filling the box", () => {
    const geometry = geometryFor([
      weighing("2026-08-01", 90),
      weighing("2026-08-08", 84),
    ]);

    expect((geometry?.highKg ?? 0) - (geometry?.lowKg ?? 0)).toBeGreaterThan(2);
  });

  it("draws heavier days higher up the box", () => {
    const geometry = geometryFor([
      weighing("2026-08-01", 90),
      weighing("2026-08-08", 84),
    ]);

    const [first, last] = geometry?.points ?? [];
    expect(first?.averageY).toBeLessThan(last?.averageY ?? 0);
  });

  it("holds every point inside the padded box", () => {
    const geometry = geometryFor(FORTNIGHT);

    for (const point of geometry?.points ?? []) {
      expect(point.x).toBeGreaterThanOrEqual(BOX.padding);
      expect(point.x).toBeLessThanOrEqual(BOX.width - BOX.padding);
      expect(point.y).toBeGreaterThanOrEqual(BOX.padding);
      expect(point.y).toBeLessThanOrEqual(BOX.height - BOX.padding);
      expect(point.averageY).toBeGreaterThanOrEqual(BOX.padding);
      expect(point.averageY).toBeLessThanOrEqual(BOX.height - BOX.padding);
    }
  });

  it("keeps the raw weighing and its average as separate heights", () => {
    const geometry = geometryFor([
      weighing("2026-08-01", 80),
      weighing("2026-08-02", 86),
    ]);

    const spike = geometry?.points.at(-1);
    // The morning that read 86 is drawn at 86; the line it sits above is at 83.
    expect(spike?.y).not.toBe(spike?.averageY);
    expect(spike?.averageKg).toBe(83);
  });

  it("draws the average as one path with a point per weighing", () => {
    const geometry = geometryFor(FORTNIGHT);
    const commands = geometry?.averagePath.split(" ") ?? [];

    expect(geometry?.averagePath.startsWith("M")).toBe(true);
    expect(geometry?.averagePath.indexOf("M", 1)).toBe(-1);
    expect(commands.length).toBe(FORTNIGHT.length * 2);
  });

  it("rounds the axis to halves so the labels read like weights", () => {
    const geometry = geometryFor([
      weighing("2026-08-01", 84.27),
      weighing("2026-08-08", 80.13),
    ]);

    expect(((geometry?.lowKg ?? 0) * 2) % 1).toBe(0);
    expect(((geometry?.highKg ?? 0) * 2) % 1).toBe(0);
    expect(geometry?.lowKg).toBeLessThanOrEqual(80.13);
    expect(geometry?.highKg).toBeGreaterThanOrEqual(84.27);
  });

  it("has nothing to draw for a single day", () => {
    expect(geometryFor([weighing("2026-08-01", 84)])).toBeUndefined();
  });

  it("has nothing to draw for an empty log", () => {
    expect(chartGeometry([], BOX)).toBeUndefined();
  });
});
