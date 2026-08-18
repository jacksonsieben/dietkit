import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ACTIVITY_LEVELS } from "@/lib/profile/activity";
import { saveProfileForm } from "@/lib/profile/persistence";
import type { ProfileFormInput } from "@/lib/profile/validation";
import { createDietKitDatabase } from "@/lib/storage/dexie/db";
import { createDexieRepository } from "@/lib/storage/dexie/repository";
import type { Repository } from "@/lib/storage";

import { basalMetabolicRate } from "./bmr";
import { loadEnergySummary } from "./summary";
import { totalDailyEnergyExpenditure } from "./tdee";

/**
 * Against the Dexie adapter, for the reason persistence.test.ts gives: what is
 * being checked is that the two records the profile form writes come back as
 * one coherent answer, and a mock would only confirm this test's assumptions
 * about a store it invented.
 */
let repository: Repository;
let dispose: () => Promise<void>;

const INPUT: ProfileFormInput = {
  weightKg: 104,
  heightCm: 180,
  birthDate: "2001-01-01",
  sex: "male",
  activityFactor: 1.55,
};

/** Chosen so the reference person is exactly 25 — BMR 2045. */
const TODAY = "2026-08-18";
const NOW = "2026-08-18T09:00:00.000Z";

beforeEach(() => {
  const db = createDietKitDatabase(`summary-test-${crypto.randomUUID()}`);
  repository = createDexieRepository(db);
  dispose = async () => {
    db.close();
    await db.delete();
  };
});

afterEach(async () => {
  await dispose();
});

describe("loadEnergySummary", () => {
  it("asks for a profile before there is one", async () => {
    // The ordinary first visit, not a failure: the home page links here and to
    // the profile, and whichever they open first has to say something sane.
    await expect(loadEnergySummary(repository, TODAY)).resolves.toEqual({
      status: "missing",
      needs: "profile",
    });
  });

  it("asks for a weight when the profile has one but the log does not", async () => {
    // Reachable: weight lives in the log rather than in `Profile`, so a restore
    // (#26) that carried no weighings lands exactly here.
    await repository.profile.save({
      heightCm: INPUT.heightCm,
      birthDate: INPUT.birthDate,
      sex: INPUT.sex,
      activityFactor: INPUT.activityFactor,
      updatedAt: NOW,
    });

    await expect(loadEnergySummary(repository, TODAY)).resolves.toEqual({
      status: "missing",
      needs: "weight",
    });
  });

  describe("with a saved profile", () => {
    beforeEach(async () => {
      await saveProfileForm(repository, INPUT, TODAY, NOW);
    });

    it("reads back what the profile form wrote", async () => {
      const state = await loadEnergySummary(repository, TODAY);
      if (state.status !== "ready") throw new Error(state.status);

      expect(state.summary.weightKg).toBe(104);
      expect(state.summary.heightCm).toBe(180);
      expect(state.summary.sex).toBe("male");
      expect(state.summary.weighedOn).toBe(TODAY);
      expect(state.summary.ageYears).toBe(25);
    });

    it("reaches the reference BMR and multiplies it by the factor", async () => {
      const state = await loadEnergySummary(repository, TODAY);
      if (state.status !== "ready") throw new Error(state.status);

      // 180 cm, 104 kg, 25, male — the case the predecessor's bug was caught
      // against, carried end to end through the store this time.
      expect(state.summary.basalMetabolicRate).toBe(2045);
      expect(state.summary.totalDailyEnergyExpenditure).toBeCloseTo(3169.75, 10);
    });

    it("names the rung the factor sits on", async () => {
      const state = await loadEnergySummary(repository, TODAY);
      if (state.status !== "ready") throw new Error(state.status);

      expect(state.summary.activityFactor).toBe(1.55);
      expect(state.summary.level?.id).toBe("moderate");
    });

    it("costs every rung for this same body", async () => {
      const state = await loadEnergySummary(repository, TODAY);
      if (state.status !== "ready") throw new Error(state.status);

      expect(state.summary.ladder).toHaveLength(ACTIVITY_LEVELS.length);

      for (const [index, row] of state.summary.ladder.entries()) {
        expect(row.level).toEqual(ACTIVITY_LEVELS[index]);
        expect(row.tdee).toBeCloseTo(2045 * ACTIVITY_LEVELS[index].factor, 10);
      }
    });

    it("marks exactly one rung as the current one", async () => {
      const state = await loadEnergySummary(repository, TODAY);
      if (state.status !== "ready") throw new Error(state.status);

      const current = state.summary.ladder.filter((row) => row.current);

      expect(current).toHaveLength(1);
      expect(current[0].level.id).toBe("moderate");
      expect(current[0].tdee).toBe(state.summary.totalDailyEnergyExpenditure);
    });

    it("ages the person as the calendar moves rather than restating a number", async () => {
      // The profile stores a birth date precisely so this happens (#13's
      // age.ts). Five kcal a year rides on it.
      const before = await loadEnergySummary(repository, "2026-12-31");
      const after = await loadEnergySummary(repository, "2027-01-01");
      if (before.status !== "ready" || after.status !== "ready") throw new Error();

      expect(before.summary.ageYears).toBe(25);
      expect(after.summary.ageYears).toBe(26);
      expect(after.summary.basalMetabolicRate).toBe(
        before.summary.basalMetabolicRate - 5,
      );
    });
  });

  describe("with a custom factor between two rungs", () => {
    beforeEach(async () => {
      await saveProfileForm(
        repository,
        { ...INPUT, activityFactor: 1.6 },
        TODAY,
        NOW,
      );
    });

    it("keeps the number instead of snapping it to a rung", async () => {
      // #14 accepts a typed override, and rounding it to the nearest rung would
      // be a silent edit to a number the user chose deliberately.
      const state = await loadEnergySummary(repository, TODAY);
      if (state.status !== "ready") throw new Error(state.status);

      expect(state.summary.activityFactor).toBe(1.6);
      expect(state.summary.level).toBeUndefined();
      expect(state.summary.totalDailyEnergyExpenditure).toBeCloseTo(3272, 10);
    });

    it("still shows the ladder, with no rung marked current", async () => {
      const state = await loadEnergySummary(repository, TODAY);
      if (state.status !== "ready") throw new Error(state.status);

      expect(state.summary.ladder).toHaveLength(ACTIVITY_LEVELS.length);
      expect(state.summary.ladder.some((row) => row.current)).toBe(false);
    });
  });

  it("is loud about a factor the store should never have held", async () => {
    // Not reachable through the form, which validates the range (#12). It is
    // reachable through devtools or a bad restore, and a TDEE built from a
    // factor of 12 looks like a number all the way to a plate of food.
    await repository.profile.save({
      heightCm: INPUT.heightCm,
      birthDate: INPUT.birthDate,
      sex: INPUT.sex,
      activityFactor: 12,
      updatedAt: NOW,
    });
    await repository.weight.put({
      id: crypto.randomUUID(),
      date: TODAY,
      weightKg: INPUT.weightKg,
      recordedAt: NOW,
    });

    await expect(loadEnergySummary(repository, TODAY)).rejects.toThrow(RangeError);
  });

  it("agrees with calling the two equations directly", async () => {
    // Guards against the summary quietly growing an adjustment of its own —
    // a rounding, a fudge factor — that the modules under it do not have.
    await saveProfileForm(
      repository,
      { ...INPUT, weightKg: 82.4, heightCm: 173.5, sex: "female" },
      TODAY,
      NOW,
    );

    const state = await loadEnergySummary(repository, TODAY);
    if (state.status !== "ready") throw new Error(state.status);

    const bmr = basalMetabolicRate({
      weightKg: 82.4,
      heightCm: 173.5,
      ageYears: 25,
      sex: "female",
    });

    expect(state.summary.basalMetabolicRate).toBe(bmr);
    expect(state.summary.totalDailyEnergyExpenditure).toBe(
      totalDailyEnergyExpenditure(bmr, 1.55),
    );
  });
});
