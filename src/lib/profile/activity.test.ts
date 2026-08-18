import { describe, expect, it } from "vitest";

import { ACTIVITY_LEVELS, activityLevelFor, offLadderActivity } from "./activity";
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

describe("offLadderActivity", () => {
  it("asks for no extra option when nothing is stored", () => {
    expect(offLadderActivity("")).toBeUndefined();
  });

  it.each(ACTIVITY_LEVELS)("asks for no extra option for $id", (level) => {
    // The rung already has an option of its own; a second one carrying the same
    // value would render the same choice twice.
    expect(offLadderActivity(toField(level.factor))).toBeUndefined();
  });

  it("keeps a value sitting between two rungs", () => {
    // 1,6 is between moderate and high. It can arrive from an import (#26) or,
    // once #14 lands, from someone typing it deliberately. Either way the
    // select has to be able to show it as selected.
    expect(offLadderActivity("1,6")).toBe("1,6");
  });

  it("keeps a value even when it is one the form would reject", () => {
    // Deciding whether to display something is not the place to decide whether
    // it is valid — that is validateProfileForm's job, and it will say so with
    // a message. Hiding it here would show a blank field with no explanation.
    expect(offLadderActivity("9")).toBe("9");
  });
});
