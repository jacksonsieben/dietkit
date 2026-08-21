import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../../..");

const read = (relative: string) =>
  fs
    .readFileSync(path.join(ROOT, relative), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

/**
 * Which number on a screen gets the dot panel, and at what size (#70).
 *
 * The panel is the loudest thing this app can draw, and its whole value is
 * that it is rare: on /hoje the eye lands on the energy left and on /peso it
 * lands on the seven-day average, because on each of those screens exactly one
 * number is lit that way. Two of them is not twice as clear, it is a screen
 * with no headline. So the ramp has two slots and no third — `displayFontSize`
 * with its default 26px ceiling is the one number the screen exists to answer,
 * and the same function capped at 16 is a subordinate reading that is never
 * allowed to compete with it.
 *
 * Both slots go through the same function on purpose. The subordinate readouts
 * were originally written as a bare `fontSize: "16px"`, which is the ceiling
 * with the fit thrown away, and at 390px a four-character panel is 384px wide
 * against a 342px column: `82,4` on /hoje and the calorie target on /energia
 * both ran off the right edge of a phone. A size is a ceiling here, never a
 * constant.
 *
 * /energia is where the choice of headline was easiest to get wrong. It carries
 * a TDEE and a calorie target, both in kcal, both arguably the point of the
 * screen — and the answer is that the TDEE is what the page computes and the
 * target is a consequence of it, so the target reads one size down.
 */
describe("the dot panels", () => {
  it("gives /energia's one fitted panel to the TDEE", () => {
    const source = read("src/components/EnergyResult.tsx");

    expect(source).toContain("style={{ fontSize: displayFontSize(tdee) }}");
  });

  it("keeps the macro target a size below it", () => {
    // Same shape — legend, panel, unit — one size down, exactly as /hoje sets
    // the body weight under the energy target. Fitted all the same: a ceiling
    // of 16 is what makes it subordinate, and the fit is what makes it fit.
    const source = read("src/components/MacroTargets.tsx");

    expect(source).toContain("displayFontSize(target, 16)");
  });

  it("lights at most one headline panel per screen", () => {
    // The rule the two tests above are instances of, applied to every file so
    // that the next screen inherits it without anyone remembering to. A call
    // with no explicit ceiling is a bid for the screen's headline; there is
    // one of those per screen or there is no headline.
    for (const file of tsxFiles()) {
      const headlines = panels(read(file)).filter(
        (call) => !call.includes(", 16)"),
      );

      expect(
        headlines.length,
        `${file} lights ${headlines.length} headline panels`,
      ).toBeLessThan(2);
    }
  });

  it("sizes every readout by the column it has to fit in", () => {
    // A pixel constant is the bug this test exists for: it survives every
    // desktop check and clips on the phone the app is mostly read on.
    for (const file of tsxFiles()) {
      expect(
        read(file),
        `${file} sets a readout at a fixed size instead of fitting it`,
      ).not.toMatch(/fontSize: "\d+px"/);
    }
  });

  it("keeps the ramp at two slots", () => {
    // A third ceiling would be a third size, arrived at by eye on one screen
    // and then copied to the next.
    for (const file of tsxFiles()) {
      for (const call of panels(read(file))) {
        const ceiling = /,\s*(\d+)\)/.exec(call)?.[1];

        if (ceiling === undefined) continue;

        expect(ceiling, `${file} invents a readout size of its own`).toBe("16");
      }
    }
  });
});

/**
 * Every `displayFontSize(...)` call in a file, to the end of its own line.
 *
 * Call sites only — the lookbehind drops the declaration in DotText.tsx, which
 * is the one line in the app that writes the name without asking for a panel.
 */
function panels(source: string): string[] {
  return source.match(/(?<!function )displayFontSize\(.*/g) ?? [];
}

function tsxFiles(dir = "src"): string[] {
  return fs
    .readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap((entry) => {
      const relative = `${dir}/${entry.name}`;

      if (entry.isDirectory()) return tsxFiles(relative);

      return entry.name.endsWith(".tsx") ? [relative] : [];
    });
}
