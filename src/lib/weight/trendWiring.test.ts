import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import ptBR from "../../../messages/pt-BR.json";

const ROOT = path.resolve(import.meta.dirname, "../../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(ROOT, relative), "utf8");

/**
 * The parts of #24 that live in the markup: which series is the headline, and
 * that the other one is still there. Components cannot be rendered under Vitest
 * (next-intl resolves to its client build), so the source is read instead.
 */
describe("weight trend wiring", () => {
  it("draws the average as the line and the weighings as dots", () => {
    // The whole issue in one assertion: if these two swap, the chart starts
    // telling people to react to water.
    const source = read("src/components/WeightTrend.tsx");

    expect(source).toContain("d={geometry.averagePath}");
    expect(source).toContain("cy={point.y}");
    expect(source).toMatch(/<circle[\s\S]*?fill="var\(--nd-unlit\)"/);
  });

  it("keeps the raw weighings on the chart rather than dropping them", () => {
    const source = read("src/components/WeightTrend.tsx");

    expect(source).toContain("geometry.points.map");
  });

  it("gives the line more weight than the dots", () => {
    // The hierarchy is a change of colour, not of alpha (#68). Ink for the
    // average, `--nd-unlit` for the mornings — both real values in both themes,
    // where ink at 25% is a value that is in neither palette and lands as a
    // different grey on white than it does on black.
    const source = read("src/components/WeightTrend.tsx");

    expect(source).toMatch(
      /d=\{geometry\.averagePath\}[\s\S]*?stroke="currentColor"/,
    );
    expect(source).not.toMatch(/opacity=/);
  });

  it("renders the trend from the log's own entries", () => {
    // Not a second read of the store: a copy that reloaded on its own schedule
    // would show yesterday's line above today's list.
    const source = read("src/components/WeightLog.tsx");

    expect(source).toContain("<WeightTrend entries={entries} />");
  });

  it("says out loud that the line is the seven-day average", () => {
    // A smoothed series presented as "your weight" is a lie by omission — the
    // number on the screen is not what any morning's scale said. The lead
    // paragraph carries that alone since #68: the chart used to repeat it in a
    // small legend beside the title, which put the same claim on the screen
    // twice and left the reader working out whether the two agreed.
    expect(ptBR.Weight.trend.lead).toContain("7 dias");
  });

  it("has a message for every branch the change line can take", () => {
    for (const key of ["changeUp", "changeDown", "changeFlat"] as const) {
      expect(ptBR.Weight.trend, `no message for ${key}`).toHaveProperty(key);
    }
  });

  it("describes the chart for a reader who cannot see it", () => {
    const source = read("src/components/WeightTrend.tsx");

    expect(source).toContain('role="img"');
    expect(source).toContain("aria-label");
    expect(ptBR.Weight.trend.chartLabel).toContain("{weight, number}");
  });

  it("sends nothing anywhere", () => {
    const source = read("src/components/WeightTrend.tsx");

    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("sendBeacon");
  });

  it("pulls in no charting library", () => {
    // 200 lines of SVG against a few hundred kilobytes on a phone that has to
    // work offline.
    const packageJson = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
    };

    for (const name of Object.keys(packageJson.dependencies)) {
      expect(name).not.toMatch(/chart|recharts|d3|victory|nivo/i);
    }
  });
});
