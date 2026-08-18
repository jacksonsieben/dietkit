import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDietKitDatabase } from "@/lib/storage/dexie/db";
import { createDexieRepository } from "@/lib/storage/dexie/repository";
import type { Repository } from "@/lib/storage";
import { GOAL_KINDS, type MacroGoal } from "@/lib/storage/types";

import {
  GOAL_ERROR_CODES,
  adjustmentLimits,
  fatLimits,
  isMacroGoal,
  loadGoal,
  needsAdjustment,
  presetForm,
  saveGoal,
  toGoalForm,
  validateGoalForm,
  type GoalFormValues,
} from "./goal";
import { DEFAULT_MACRO_GOAL, GOAL_PRESETS, MACRO_GOAL_LIMITS } from "./macros";

/**
 * The translation between three friendly goals and the record they stand for is
 * the whole content of this module, so most of what is checked here is that the
 * round trip survives it in both directions — a goal that reads back as its
 * opposite turns a cut into a bulk silently.
 */

const VALID: GoalFormValues = {
  kind: "lose",
  adjustment: "500",
  adjustmentUnit: "kcal",
  proteinGPerKg: "2",
  fat: "25",
  fatUnit: "percent",
};

describe("validateGoalForm", () => {
  it("reads a filled-in form as the goal it describes", () => {
    expect(validateGoalForm(VALID)).toEqual({
      ok: true,
      value: {
        kind: "lose",
        adjustment: { unit: "kcal", value: 500 },
        proteinGPerKg: 2,
        fat: { unit: "percent", value: 25 },
      },
    });
  });

  it("keeps the adjustment unsigned, whichever side the goal is on", () => {
    // The sign lives in `kind` and nowhere else. If the magnitude ever came
    // back negative for a deficit, `adjustedEnergy` would negate it a second
    // time and a cut would become a bulk.
    const result = validateGoalForm({ ...VALID, kind: "gain" });

    expect(result.ok && result.value.adjustment.value).toBe(500);
  });

  it("ignores whatever is in the adjustment box on maintenance", () => {
    // The box is hidden for that goal, but its value is still in state — a
    // stale "500" left behind by a change of goal must not quietly become a
    // deficit, and must not be validated either.
    const result = validateGoalForm({ ...VALID, kind: "maintain", adjustment: "500" });

    expect(result.ok && result.value.adjustment.value).toBe(0);
  });

  it("takes a comma as a decimal point", () => {
    // pt-BR writes 1,8 — the fields are text inputs for exactly this reason.
    const result = validateGoalForm({ ...VALID, proteinGPerKg: "1,8" });

    expect(result.ok && result.value.proteinGPerKg).toBe(1.8);
  });

  it("checks the fat box against the bounds of the unit next to it", () => {
    // 500 is a fine number of kilocalories and an impossible percentage. The
    // unit picker inside the input is what decides which of those it is.
    expect(validateGoalForm({ ...VALID, fat: "500", fatUnit: "kcal" }).ok).toBe(true);
    expect(validateGoalForm({ ...VALID, fat: "500", fatUnit: "percent" })).toEqual({
      ok: false,
      errors: { fat: "fatPercentRange" },
    });
  });

  describe("what it refuses", () => {
    it.each([
      ["an adjustment that is missing", { adjustment: "" }, { adjustment: "required" }],
      [
        "an adjustment that is not a number",
        { adjustment: "muito" },
        { adjustment: "notANumber" },
      ],
      [
        "a deficit deeper than the limit",
        { adjustment: "1501" },
        { adjustment: "kcalRange" },
      ],
      [
        "a percentage past the limit",
        { adjustmentUnit: "percent", adjustment: "41" },
        { adjustment: "percentRange" },
      ],
      ["an adjustment of zero", { adjustment: "0" }, { adjustment: "kcalRange" }],
      [
        "a protein coefficient past the limit",
        { proteinGPerKg: "5" },
        { proteinGPerKg: "proteinRange" },
      ],
      ["no protein coefficient", { proteinGPerKg: "" }, { proteinGPerKg: "required" }],
      ["a fat share under the floor", { fat: "10" }, { fat: "fatPercentRange" }],
      [
        "a fat figure in kcal past the limit",
        { fatUnit: "kcal", fat: "2001" },
        { fat: "fatKcalRange" },
      ],
    ])("rejects %s", (_label, patch, errors) => {
      expect(validateGoalForm({ ...VALID, ...patch })).toEqual({ ok: false, errors });
    });

    it("refuses a negative adjustment rather than reading it as a surplus", () => {
      // `parseDecimal` accepts a leading minus, so this reaches the bounds
      // check. A "-500" deficit that silently meant +500 is the failure the
      // unsigned magnitude exists to prevent.
      expect(validateGoalForm({ ...VALID, adjustment: "-500" })).toEqual({
        ok: false,
        errors: { adjustment: "kcalRange" },
      });
    });

    it("refuses a fat share below the physiological floor", () => {
      // Not an arbitrary bound: `FAT_FLOOR_PERCENT` is the ISSN/ACSM baseline,
      // and the percentage path is the one place the form can hold the line.
      expect(MACRO_GOAL_LIMITS.fatPercent.min).toBe(15);
      expect(validateGoalForm({ ...VALID, fat: "14" }).ok).toBe(false);
      expect(validateGoalForm({ ...VALID, fat: "15" }).ok).toBe(true);
    });

    it("reports everything wrong in one pass", () => {
      const result = validateGoalForm({
        ...VALID,
        adjustment: "",
        proteinGPerKg: "9",
        fat: "",
      });

      expect(result).toEqual({
        ok: false,
        errors: {
          adjustment: "required",
          proteinGPerKg: "proteinRange",
          fat: "required",
        },
      });
    });

    it("rejects a goal it does not have, without guessing at the rest", () => {
      // Reachable from a restored export written by a later version. Without
      // the goal there is no telling whether the adjustment is even asked for,
      // so nothing else is judged.
      expect(validateGoalForm({ ...VALID, kind: "recomp", proteinGPerKg: "" })).toEqual({
        ok: false,
        errors: { kind: "invalidGoal" },
      });
    });

    it("rejects a unit it does not have, without guessing at the bounds", () => {
      expect(
        validateGoalForm({ ...VALID, adjustmentUnit: "kJ", fatUnit: "g" }),
      ).toEqual({
        ok: false,
        errors: { adjustmentUnit: "invalidUnit", fatUnit: "invalidUnit" },
      });
    });
  });

  it("only produces codes the catalogue has a message for", () => {
    // A code with no message renders its own key path at a user.
    const result = validateGoalForm({
      ...VALID,
      adjustmentUnit: "percent",
      adjustment: "99",
      proteinGPerKg: "x",
      fat: "1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    for (const code of Object.values(result.errors)) {
      expect(GOAL_ERROR_CODES).toContain(code);
    }
  });
});

describe("toGoalForm", () => {
  it("leaves the adjustment box empty on maintenance", () => {
    // Rather than a 0 the user has to clear before they can type — and a 0 the
    // bounds would reject if it were ever submitted.
    expect(toGoalForm(GOAL_PRESETS.maintain).adjustment).toBe("");
  });

  it("shows the adjustment without a sign", () => {
    expect(toGoalForm(GOAL_PRESETS.lose).adjustment).toBe("500");
    expect(toGoalForm(GOAL_PRESETS.gain).adjustment).toBe("500");
  });

  it("writes numbers the way the field will accept them back", () => {
    // The round trip that a group separator would break: a form rendered as
    // "1.800" would be refused by the parser that produced it.
    const form = toGoalForm({ ...DEFAULT_MACRO_GOAL, proteinGPerKg: 1.8 });

    expect(form.proteinGPerKg).toBe("1,8");
    expect(validateGoalForm(form).ok).toBe(true);
  });

  it("round-trips every goal back to the same record", () => {
    for (const goal of [
      GOAL_PRESETS.lose,
      GOAL_PRESETS.maintain,
      GOAL_PRESETS.gain,
      {
        kind: "gain",
        adjustment: { unit: "percent", value: 12 },
        proteinGPerKg: 2.2,
        fat: { unit: "kcal", value: 700 },
      },
    ] satisfies MacroGoal[]) {
      expect(validateGoalForm(toGoalForm(goal))).toEqual({ ok: true, value: goal });
    }
  });

  it("round-trips maintenance to a zero, whichever unit it was stored in", () => {
    // Zero has no side, so which unit it was written in is genuinely lost here
    // — which is fine, and pinned so nobody later "fixes" it into a surplus.
    const stored: MacroGoal = {
      ...GOAL_PRESETS.maintain,
      adjustment: { unit: "percent", value: 0 },
    };
    const result = validateGoalForm(toGoalForm(stored));

    expect(result.ok && result.value.adjustment.value).toBe(0);
  });
});

describe("presetForm", () => {
  it("fills the whole form, so picking a goal is a complete answer", () => {
    for (const kind of GOAL_KINDS) {
      const form = presetForm(kind);

      expect(form.kind).toBe(kind);
      // Every preset must survive the form's own validation. A preset the form
      // would refuse is a screen that opens on an error nobody typed.
      expect(validateGoalForm(form)).toEqual({ ok: true, value: GOAL_PRESETS[kind] });
    }
  });

  it("does not carry the previous goal's numbers over", () => {
    // The point of the presets: switching from a cut to a bulk must not leave
    // the cut's protein coefficient behind under a different heading.
    expect(presetForm("gain").proteinGPerKg).not.toBe(presetForm("lose").proteinGPerKg);
  });
});

describe("bounds and visibility", () => {
  it("quotes the bounds of the unit the box is showing", () => {
    expect(adjustmentLimits("percent")).toEqual(MACRO_GOAL_LIMITS.percent);
    expect(adjustmentLimits("kcal")).toEqual(MACRO_GOAL_LIMITS.kcal);
    expect(fatLimits("percent")).toEqual(MACRO_GOAL_LIMITS.fatPercent);
    expect(fatLimits("kcal")).toEqual(MACRO_GOAL_LIMITS.fatKcal);
  });

  it("keeps every bound unsigned, since the goal carries the sign", () => {
    expect(MACRO_GOAL_LIMITS.kcal.min).toBeGreaterThan(0);
    expect(MACRO_GOAL_LIMITS.percent.min).toBeGreaterThan(0);
  });

  it("hides the adjustment box only on maintenance", () => {
    for (const kind of GOAL_KINDS) {
      expect(needsAdjustment(kind)).toBe(kind !== "maintain");
    }
  });
});

describe("isMacroGoal", () => {
  it("accepts what this version writes", () => {
    for (const kind of GOAL_KINDS) {
      expect(isMacroGoal(GOAL_PRESETS[kind])).toBe(true);
    }
  });

  it.each([
    ["nothing at all", undefined],
    ["a goal from the version before this one", {
      adjustment: { kind: "kcal", value: -500 },
      proteinGPerKg: 2,
      fatGPerKg: 1,
    }],
    ["a goal with no goal", { ...GOAL_PRESETS.lose, kind: "recomp" }],
    ["an amount in a unit we do not have", {
      ...GOAL_PRESETS.lose,
      fat: { unit: "g", value: 80 },
    }],
    ["a coefficient that is not a number", {
      ...GOAL_PRESETS.lose,
      proteinGPerKg: "2",
    }],
    ["a coefficient that is NaN", { ...GOAL_PRESETS.lose, proteinGPerKg: NaN }],
  ])("rejects %s", (_label, value) => {
    expect(isMacroGoal(value)).toBe(false);
  });
});

describe("persistence", () => {
  let repository: Repository;
  let dispose: () => Promise<void>;

  beforeEach(() => {
    const db = createDietKitDatabase(`goal-test-${crypto.randomUUID()}`);
    repository = createDexieRepository(db);
    dispose = async () => {
      db.close();
      await db.delete();
    };
  });

  afterEach(async () => {
    await dispose();
  });

  it("falls back to the default before anything was chosen", async () => {
    await expect(loadGoal(repository)).resolves.toEqual(DEFAULT_MACRO_GOAL);
  });

  it("reads back what was saved", async () => {
    const goal: MacroGoal = {
      kind: "lose",
      adjustment: { unit: "percent", value: 18 },
      proteinGPerKg: 2.1,
      fat: { unit: "kcal", value: 600 },
    };

    await saveGoal(repository, goal);

    await expect(loadGoal(repository)).resolves.toEqual(goal);
  });

  it("falls back rather than handing a stale shape to the arithmetic", async () => {
    // A store written by an earlier build, or an import (#26) someone edited by
    // hand. Trusting it would put `undefined * weight` on screen as grams.
    await repository.settings.patch({
      goal: { adjustment: { kind: "kcal", value: -500 }, proteinGPerKg: 2 } as never,
    });

    await expect(loadGoal(repository)).resolves.toEqual(DEFAULT_MACRO_GOAL);
  });

  it("leaves the rest of the settings alone", async () => {
    // A patch, not a write of the whole record: the disclaimer acknowledgement
    // (#10) lives in the same row and must survive a change of goal.
    await repository.settings.patch({ disclaimerAcceptedAt: "2026-08-01T00:00:00.000Z" });

    await saveGoal(repository, { ...GOAL_PRESETS.lose, proteinGPerKg: 2 });

    const settings = await repository.settings.get();
    expect(settings.disclaimerAcceptedAt).toBe("2026-08-01T00:00:00.000Z");
    expect(settings.goal?.proteinGPerKg).toBe(2);
  });

  it("survives the export it will be restored from", async () => {
    // The goal rides in the settings record, so it is already inside the
    // snapshot (#26) — worth pinning, because a target that vanished on restore
    // would look like the app forgetting a decision the user made once.
    const goal: MacroGoal = {
      kind: "gain",
      adjustment: { unit: "kcal", value: 400 },
      proteinGPerKg: 1.9,
      fat: { unit: "percent", value: 28 },
    };
    await saveGoal(repository, goal);

    const snapshot = await repository.exportAll();
    await repository.clearAll();
    await repository.importAll(snapshot);

    await expect(loadGoal(repository)).resolves.toEqual(goal);
  });
});
