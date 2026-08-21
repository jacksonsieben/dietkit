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
 * with no headline. So the ramp has two slots and no third: `displayFontSize`
 * fits the string to the charter's column and belongs to the one number the
 * screen exists to answer, and a fixed 16px is a subordinate reading that is
 * never allowed to compete with it.
 *
 * /energia is where this was easiest to get wrong. It carries a TDEE and a
 * calorie target, both in kcal, both arguably the point of the screen — and
 * the answer is that the TDEE is what the page computes and the target is a
 * consequence of it, so the target reads one size down.
 */
describe("the dot panels", () => {
  it("gives /energia's one fitted panel to the TDEE", () => {
    const source = read("src/components/EnergyResult.tsx");

    expect(source).toContain("style={{ fontSize: displayFontSize(tdee) }}");
  });

  it("keeps the macro target a size below it", () => {
    // Same shape — legend, panel, unit — one size down, exactly as /hoje sets
    // the body weight under the energy target.
    const source = read("src/components/MacroTargets.tsx");

    expect(source).toContain('style={{ fontSize: "16px" }}');
    expect(source).not.toContain("displayFontSize");
  });

  it("lights at most one fitted panel per screen", () => {
    // The rule the two tests above are instances of, applied to every file so
    // that the next screen inherits it without anyone remembering to.
    for (const file of tsxFiles()) {
      const fitted = read(file).match(/displayFontSize\(/g) ?? [];

      expect(fitted.length, `${file} lights ${fitted.length} display panels`)
        .toBeLessThan(2);
    }
  });

  it("sets every subordinate readout at the same pitch", () => {
    // A second fixed size would be a third slot in the ramp, arrived at by
    // eye on one screen and then copied.
    for (const file of tsxFiles()) {
      const sizes = read(file).match(/fontSize: "(\d+)px"/g) ?? [];

      for (const size of sizes) {
        expect(size, `${file} sets a readout at a size of its own`).toBe(
          'fontSize: "16px"',
        );
      }
    }
  });
});

function tsxFiles(dir = "src"): string[] {
  return fs
    .readdirSync(path.join(ROOT, dir), { withFileTypes: true })
    .flatMap((entry) => {
      const relative = `${dir}/${entry.name}`;

      if (entry.isDirectory()) return tsxFiles(relative);

      return entry.name.endsWith(".tsx") ? [relative] : [];
    });
}
