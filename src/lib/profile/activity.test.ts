import { describe, expect, it } from "vitest";

import { ACTIVITY_LEVELS, activityLevelFor, isCustomActivity } from "./activity";
import { toField } from "./persistence";
import { PROFILE_LIMITS, parseDecimal, validateProfileForm } from "./validation";

/**
 * The ladder is a dropdown, so its rungs are the only values most people will
 * ever store. Every one of them therefore has to survive the round trip the
 * form puts it through — rendered into an `<option value>`, read back as a
 * string, parsed, validated — and arrive as the same number it started as.
 * A rung that fails validation is an option that cannot be submitted, which is
 * not a bug anyone would think to look for in a list of five constants.
 */
describe("ACTIVITY_LEVELS", () => {
  it("is ordered from least to most active", () => {
    const factors = ACTIVITY_LEVELS.map((level) => level.factor);

    expect(factors).toEqual([...factors].sort((a, b) => a - b));
  });

  it("has no repeated rung", () => {
    // Two rungs sharing a factor would render two options the select cannot
    // tell apart: picking either shows whichever comes first.
    const factors = ACTIVITY_LEVELS.map((level) => level.factor);
    const ids = ACTIVITY_LEVELS.map((level) => level.id);

    expect(new Set(factors).size).toBe(factors.length);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(ACTIVITY_LEVELS)("$id survives the trip through the form", (level) => {
    const field = toField(level.factor);

    expect(parseDecimal(field)).toBe(level.factor);
  });

  it.each(ACTIVITY_LEVELS)("$id passes validation as submitted", (level) => {
    const result = validateProfileForm(
      {
        weightKg: "82",
        heightCm: "178",
        birthDate: "1995-03-14",
        sex: "male",
        activityFactor: toField(level.factor),
      },
      "2026-08-18",
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.activityFactor).toBe(level.factor);
  });

  it("stays inside the range the validator enforces", () => {
    // The two are set independently — PROFILE_LIMITS also bounds #14's typed
    // override — so nothing but this test stops them drifting apart.
    for (const { id, factor } of ACTIVITY_LEVELS) {
      expect(factor, id).toBeGreaterThanOrEqual(PROFILE_LIMITS.activityFactor.min);
      expect(factor, id).toBeLessThanOrEqual(PROFILE_LIMITS.activityFactor.max);
    }
  });

  it("spans a range worth choosing between", () => {
    // A ladder whose ends are close together is a control that does nothing.
    // Sedentary to athlete is roughly a 60% difference in daily energy.
    const factors = ACTIVITY_LEVELS.map((level) => level.factor);

    expect(Math.min(...factors)).toBeLessThanOrEqual(1.2);
    expect(Math.max(...factors)).toBeGreaterThanOrEqual(1.9);
  });
});

describe("activityLevelFor", () => {
  it.each(ACTIVITY_LEVELS)("finds $id by its factor", (level) => {
    expect(activityLevelFor(level.factor)).toEqual(level);
  });

  it("does not snap a value sitting between two rungs", () => {
    // 1.6 is between moderate (1.55) and high (1.725). Returning the nearest
    // rung here would let the form quietly rewrite a number the user chose.
    expect(activityLevelFor(1.6)).toBeUndefined();
  });
});

describe("isCustomActivity", () => {
  it("does not open the number box for an empty field", () => {
    // A blank profile should meet the ladder first. Opening straight into a box
    // asking for a multiplier would be asking a question nobody can answer.
    expect(isCustomActivity("")).toBe(false);
  });

  it.each(ACTIVITY_LEVELS)("keeps $id on the ladder", (level) => {
    expect(isCustomActivity(toField(level.factor))).toBe(false);
  });

  it("opens the box for a value sitting between two rungs", () => {
    // 1,6 is between moderate and high. It can arrive from an import (#26) or
    // from someone typing it deliberately. Either way the field has to reopen
    // in the mode that can show it — a select handed a value none of its
    // options match renders as though nothing were selected, and then the next
    // rung the user touches quietly replaces the number they chose.
    expect(isCustomActivity("1,6")).toBe(true);
  });

  it("opens the box even for a value the form would reject", () => {
    // Deciding what to display is not the place to decide what is valid — that
    // is validateProfileForm's job, and it will say so with a message under the
    // field. Refusing to show it here would leave a blank box and no reason.
    expect(isCustomActivity("9")).toBe(true);
  });

  it("does not mistake a rung written another way for a custom value", () => {
    // The comparison is on the field string, which is what the options carry.
    // "1.55" with a dot is not what `toField` produces, so it belongs in the
    // box, where the user can see and fix it — not silently on a rung.
    expect(isCustomActivity("1.55")).toBe(true);
  });
});
