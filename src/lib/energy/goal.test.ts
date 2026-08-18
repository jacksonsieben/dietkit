import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDietKitDatabase } from "@/lib/storage/dexie/db";
import { createDexieRepository } from "@/lib/storage/dexie/repository";
import type { Repository } from "@/lib/storage";
import type { MacroGoal } from "@/lib/storage/types";

import {
  GOAL_ERROR_CODES,
  GOAL_MODES,
  loadGoal,
  magnitudeLimits,
  needsMagnitude,
  saveGoal,
  toGoalForm,
  validateGoalForm,
  type GoalFormValues,
} from "./goal";
import { DEFAULT_MACRO_GOAL, MACRO_GOAL_LIMITS } from "./macros";

/**
 * The translation between a signed stored adjustment and a form that never
 * shows a minus sign is the whole content of this module, so most of what is
 * checked here is that the round trip survives it in both directions — a mode
 * that reads back as its opposite turns a cut into a bulk silently.
 */

const VALID: GoalFormValues = {
  mode: "deficitKcal",
  magnitude: "500",
  proteinGPerKg: "2",
  fatGPerKg: "1",
};

describe("validateGoalForm", () => {
  it("reads a deficit in kilocalories as a negative adjustment", () => {
    const result = validateGoalForm(VALID);

    expect(result).toEqual({
      ok: true,
      value: {
        adjustment: { kind: "kcal", value: -500 },
        proteinGPerKg: 2,
        fatGPerKg: 1,
      },
    });
  });

  it("reads a surplus as a positive one", () => {
    const result = validateGoalForm({ ...VALID, mode: "surplusKcal" });

    expect(result.ok && result.value.adjustment).toEqual({ kind: "kcal", value: 500 });
  });

  it.each([
    ["deficitPercent", -20],
    ["surplusPercent", 20],
  ])("reads %s as a percentage", (mode, value) => {
    const result = validateGoalForm({ ...VALID, mode, magnitude: "20" });

    expect(result.ok && result.value.adjustment).toEqual({ kind: "percent", value });
  });

  it("ignores whatever is in the magnitude box on maintenance", () => {
    // The box is hidden in that mode, but its value is still in state — a stale
    // "500" left behind by a mode change must not quietly become a deficit.
    const result = validateGoalForm({ ...VALID, mode: "maintain", magnitude: "500" });

    expect(result.ok && result.value.adjustment.value).toBe(0);
  });

  it("takes a comma as a decimal point", () => {
    // pt-BR writes 1,8 — the fields are text inputs for exactly this reason.
    const result = validateGoalForm({ ...VALID, proteinGPerKg: "1,8" });

    expect(result.ok && result.value.proteinGPerKg).toBe(1.8);
  });

  describe("what it refuses", () => {
    it.each([
      ["a magnitude that is missing", { magnitude: "" }, { magnitude: "required" }],
      ["a magnitude that is not a number", { magnitude: "muito" }, { magnitude: "notANumber" }],
      [
        "a deficit deeper than the limit",
        { magnitude: "1501" },
        { magnitude: "kcalRange" },
      ],
      [
        "a percentage past the limit",
        { mode: "deficitPercent", magnitude: "41" },
        { magnitude: "percentRange" },
      ],
      ["a magnitude of zero", { magnitude: "0" }, { magnitude: "kcalRange" }],
      [
        "a protein coefficient past the limit",
        { proteinGPerKg: "5" },
        { proteinGPerKg: "proteinRange" },
      ],
      ["no protein coefficient", { proteinGPerKg: "" }, { proteinGPerKg: "required" }],
      ["a fat coefficient past the limit", { fatGPerKg: "3" }, { fatGPerKg: "fatRange" }],
    ])("rejects %s", (_label, patch, errors) => {
      expect(validateGoalForm({ ...VALID, ...patch })).toEqual({ ok: false, errors });
    });

    it("refuses a negative magnitude rather than reading it as a surplus", () => {
      // `parseDecimal` accepts a leading minus, so this reaches the bounds
      // check. A "-500" deficit that silently meant +500 is the failure the
      // unsigned magnitude exists to prevent.
      expect(validateGoalForm({ ...VALID, magnitude: "-500" })).toEqual({
        ok: false,
        errors: { magnitude: "kcalRange" },
      });
    });

    it("reports everything wrong in one pass", () => {
      const result = validateGoalForm({
        mode: "deficitKcal",
        magnitude: "",
        proteinGPerKg: "9",
        fatGPerKg: "",
      });

      expect(result).toEqual({
        ok: false,
        errors: {
          magnitude: "required",
          proteinGPerKg: "proteinRange",
          fatGPerKg: "required",
        },
      });
    });

    it("rejects a mode it does not have, without guessing at the rest", () => {
      // Reachable from a restored export written by a later version. Without
      // the mode the magnitude has no units, so nothing else can be judged.
      expect(validateGoalForm({ ...VALID, mode: "recomp" })).toEqual({
        ok: false,
        errors: { mode: "invalidMode" },
      });
    });
  });

  it("only produces codes the catalogue has a message for", () => {
    // A code with no message renders its own key path at a user.
    const result = validateGoalForm({
      mode: "deficitPercent",
      magnitude: "99",
      proteinGPerKg: "x",
      fatGPerKg: "0.1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    for (const code of Object.values(result.errors)) {
      expect(GOAL_ERROR_CODES).toContain(code);
    }
  });
});

describe("toGoalForm", () => {
  it.each<[string, MacroGoal["adjustment"], string, string]>([
    ["a deficit in kcal", { kind: "kcal", value: -500 }, "deficitKcal", "500"],
    ["a surplus in kcal", { kind: "kcal", value: 300 }, "surplusKcal", "300"],
    ["a deficit in percent", { kind: "percent", value: -15 }, "deficitPercent", "15"],
    ["a surplus in percent", { kind: "percent", value: 10 }, "surplusPercent", "10"],
    ["maintenance", { kind: "percent", value: 0 }, "maintain", ""],
  ])("shows %s unsigned", (_label, adjustment, mode, magnitude) => {
    const form = toGoalForm({ ...DEFAULT_MACRO_GOAL, adjustment });

    expect(form.mode).toBe(mode);
    expect(form.magnitude).toBe(magnitude);
  });

  it("writes coefficients the way the field will accept them back", () => {
    // The round trip that a group separator would break: a form rendered as
    // "1.800" would be refused by the parser that produced it.
    const form = toGoalForm({ ...DEFAULT_MACRO_GOAL, proteinGPerKg: 1.8 });

    expect(form.proteinGPerKg).toBe("1,8");
    expect(validateGoalForm(form).ok).toBe(true);
  });

  it("round-trips every mode back to the same goal", () => {
    for (const goal of [
      { adjustment: { kind: "kcal", value: -500 }, proteinGPerKg: 2, fatGPerKg: 1 },
      { adjustment: { kind: "kcal", value: 250 }, proteinGPerKg: 1.6, fatGPerKg: 0.8 },
      { adjustment: { kind: "percent", value: -20 }, proteinGPerKg: 2.2, fatGPerKg: 1.2 },
      { adjustment: { kind: "percent", value: 12 }, proteinGPerKg: 1.8, fatGPerKg: 1 },
    ] satisfies MacroGoal[]) {
      expect(validateGoalForm(toGoalForm(goal))).toEqual({ ok: true, value: goal });
    }
  });

  it("round-trips maintenance as a zero, whichever unit it was stored in", () => {
    // Zero has no sign and no side, so the unit is genuinely lost here — which
    // is fine, and pinned so nobody later "fixes" it into a surplus.
    const stored: MacroGoal = {
      ...DEFAULT_MACRO_GOAL,
      adjustment: { kind: "kcal", value: 0 },
    };
    const result = validateGoalForm(toGoalForm(stored));

    expect(result.ok && result.value.adjustment.value).toBe(0);
  });
});

describe("magnitudeLimits", () => {
  it("assumes limits that are symmetric about maintenance", () => {
    // The whole reason the form can drop the sign. If a deficit were ever
    // allowed to go deeper than a surplus goes high, the unsigned magnitude
    // would silently enforce the smaller of the two on both sides.
    expect(MACRO_GOAL_LIMITS.kcal.min).toBe(-MACRO_GOAL_LIMITS.kcal.max);
    expect(MACRO_GOAL_LIMITS.percent.min).toBe(-MACRO_GOAL_LIMITS.percent.max);
  });

  it("quotes the percentage bounds in percentage modes", () => {
    expect(magnitudeLimits("deficitPercent")).toEqual({
      min: 1,
      max: MACRO_GOAL_LIMITS.percent.max,
    });
    expect(magnitudeLimits("surplusKcal")).toEqual({
      min: 1,
      max: MACRO_GOAL_LIMITS.kcal.max,
    });
  });

  it("hides the box only on maintenance", () => {
    for (const mode of GOAL_MODES) {
      expect(needsMagnitude(mode)).toBe(mode !== "maintain");
    }
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
      adjustment: { kind: "percent", value: -18 },
      proteinGPerKg: 2.1,
      fatGPerKg: 0.9,
    };

    await saveGoal(repository, goal);

    await expect(loadGoal(repository)).resolves.toEqual(goal);
  });

  it("leaves the rest of the settings alone", async () => {
    // A patch, not a write of the whole record: the disclaimer acknowledgement
    // (#10) lives in the same row and must survive a change of goal.
    await repository.settings.patch({ disclaimerAcceptedAt: "2026-08-01T00:00:00.000Z" });

    await saveGoal(repository, { ...DEFAULT_MACRO_GOAL, proteinGPerKg: 2 });

    const settings = await repository.settings.get();
    expect(settings.disclaimerAcceptedAt).toBe("2026-08-01T00:00:00.000Z");
    expect(settings.goal?.proteinGPerKg).toBe(2);
  });

  it("survives the export it will be restored from", async () => {
    // The goal rides in the settings record, so it is already inside the
    // snapshot (#26) — worth pinning, because a target that vanished on restore
    // would look like the app forgetting a decision the user made once.
    const goal: MacroGoal = {
      adjustment: { kind: "kcal", value: -400 },
      proteinGPerKg: 1.9,
      fatGPerKg: 1.1,
    };
    await saveGoal(repository, goal);

    const snapshot = await repository.exportAll();
    await repository.clearAll();
    await repository.importAll(snapshot);

    await expect(loadGoal(repository)).resolves.toEqual(goal);
  });
});
