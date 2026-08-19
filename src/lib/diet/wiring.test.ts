import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import ptBR from "../../../messages/pt-BR.json";

import { MEAL_ERROR_CODES, MEAL_LIMITS } from "./meals";

const ROOT = path.resolve(import.meta.dirname, "../../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(ROOT, relative), "utf8");

/**
 * The parts of #18 that are true about how the screen is wired rather than
 * about what the arithmetic computes. The shares and the apportionment have
 * their own tests; what is left only shows up in the source — that the screen
 * uses those functions instead of reimplementing the split, and that the four
 * verbs the issue asks for are all reachable from it.
 *
 * Read rather than rendered, for the reason `src/lib/profile/wiring.test.ts`
 * gives: next-intl resolves to its client build under Vitest and a server
 * component throws before it paints.
 */
describe("meal planner wiring", () => {
  const component = () => read("src/components/MealPlanner.tsx");

  it("offers all four verbs the issue asks for", () => {
    // Add, remove, rename, reorder. A screen that can only add is the failure
    // mode here, because it still looks like it satisfies "user-defined".
    const source = component();

    for (const verb of [
      "addMeal(",
      "removeMeal(",
      "renameMeal(",
      "moveMeal(",
    ]) {
      expect(source).toContain(verb);
    }
  });

  it("lets the split be adjusted rather than only evened out", () => {
    // `evenShares` alone would be the predecessor's behaviour with a nicer
    // list: the point of #18 is that lunch can be bigger than breakfast.
    const source = component();

    expect(source).toContain("setShare(");
    expect(source).toContain("checkSharePercent(");
  });

  it("divides the targets with the module that keeps the total honest", () => {
    // The screen must not do its own `targets.proteinG * share` — that is the
    // rounding bug `distributeTargets` exists to prevent, and it would be
    // invisible in every screenshot.
    const source = component();

    expect(source).toContain("distributeTargets(");
    expect(source).toContain("sharePercents(");
    expect(source).not.toMatch(/proteinG\s*\*/);
  });

  it("reads the targets from the profile instead of asking for them again", () => {
    // The day's numbers are already an answered question (#15). A second box
    // asking for kilocalories here is two places to disagree about the target.
    const source = component();

    expect(source).toContain("loadEnergySummary(");
    expect(source).toContain("planMacros(");
  });

  it("does not create a stored plan just because the screen was opened", () => {
    const source = component();

    expect(source).toContain("newPlan(");
    // The only write, and it is behind the submit handler.
    expect(source.match(/savePlan\(/g)).toHaveLength(1);
  });

  it("has a message for every error the meal rules can produce", () => {
    // The screen renders `t(\`errors.${code}\`)`, so a code with no message is
    // a runtime failure on the one screen that is meant to be explaining what
    // went wrong.
    expect(Object.keys(ptBR.Plan.errors).sort()).toEqual(
      [...MEAL_ERROR_CODES].sort(),
    );
  });

  it("counts meals in a plural the catalogue can express", () => {
    expect(ptBR.Plan.mealCount).toContain("plural");
  });

  it("quotes the real ceiling rather than a number typed into the sentence", () => {
    // "no máximo 12" written by hand is a sentence that keeps saying 12 after
    // the limit moves.
    expect(component()).toContain("MEAL_LIMITS.count.max");
    expect(ptBR.Plan.addLimit).toContain("{max, number}");
    expect(MEAL_LIMITS.count.max).toBeGreaterThan(MEAL_LIMITS.count.min);
  });
});
