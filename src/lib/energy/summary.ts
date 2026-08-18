import { ACTIVITY_LEVELS, activityLevelFor } from "@/lib/profile/activity";
import type { ActivityLevel } from "@/lib/profile/activity";
import type { Repository } from "@/lib/storage";
import type { IsoDate, Sex } from "@/lib/storage/types";

import { ageYearsOn } from "./age";
import { basalMetabolicRate } from "./bmr";
import { totalDailyEnergyExpenditure } from "./tdee";

/**
 * Everything the energy screen shows, assembled from the device's own store.
 *
 * A module rather than logic inside the component, for the reason `persistence`
 * is one: the interesting part is which records the answer is built from and
 * what happens when one of them is missing, and neither should only be
 * observable by opening a browser with the right data already in it.
 */

/** The same person priced at every rung — see `ladder` below. */
export interface LadderRow {
  level: ActivityLevel;
  tdee: number;
  /** Whether this is the rung the profile actually sits on. */
  current: boolean;
}

export interface EnergySummary {
  weightKg: number;
  /** The day that weight was measured; a stale one should say so. */
  weighedOn: IsoDate;
  heightCm: number;
  ageYears: number;
  sex: Sex;
  activityFactor: number;
  /** The rung the factor sits on, or `undefined` for a custom one (#14). */
  level?: ActivityLevel;
  basalMetabolicRate: number;
  totalDailyEnergyExpenditure: number;
  /**
   * The whole ladder, costed for this person.
   *
   * This is #14's design stance made concrete. The issue's complaint is that
   * two calculators file the same week of training under different rungs and
   * disagree by hundreds of kilocalories, and that users read the gap as a bug
   * in one of them. Showing what each rung would cost *this* body turns that
   * from an argument about whose scale is right into a number they can look at:
   * the distance between "moderate" and "very active" is visible, so a
   * different answer elsewhere is something to reconcile rather than distrust.
   */
  ladder: LadderRow[];
}

/**
 * `missing` is a first-class answer, not an error.
 *
 * Arriving here before filling the profile is the ordinary path — the home
 * page links to both — and a screen that throws in that case would be telling
 * the user something broke when nothing did.
 */
export type EnergyState =
  | { status: "ready"; summary: EnergySummary }
  | { status: "missing"; needs: "profile" | "weight" };

/**
 * Reads the profile and the latest weight, and does the arithmetic.
 *
 * `today` is a parameter rather than a clock read, because age depends on it
 * and a function that asks what day it is cannot be tested against a birthday.
 */
export async function loadEnergySummary(
  repository: Repository,
  today: IsoDate,
): Promise<EnergyState> {
  const [profile, latest] = await Promise.all([
    repository.profile.get(),
    repository.weight.latest(),
  ]);

  if (!profile) return { status: "missing", needs: "profile" };

  // Weight lives in the log, not in `Profile` (see persistence.ts), so it can
  // genuinely be absent while the rest of the profile exists — a restored
  // export (#26) that carried no weighings would land exactly here.
  if (!latest) return { status: "missing", needs: "weight" };

  const ageYears = ageYearsOn(profile.birthDate, today);
  const bmr = basalMetabolicRate({
    weightKg: latest.weightKg,
    heightCm: profile.heightCm,
    ageYears,
    sex: profile.sex,
  });

  return {
    status: "ready",
    summary: {
      weightKg: latest.weightKg,
      weighedOn: latest.date,
      heightCm: profile.heightCm,
      ageYears,
      sex: profile.sex,
      activityFactor: profile.activityFactor,
      level: activityLevelFor(profile.activityFactor),
      basalMetabolicRate: bmr,
      totalDailyEnergyExpenditure: totalDailyEnergyExpenditure(
        bmr,
        profile.activityFactor,
      ),
      ladder: ACTIVITY_LEVELS.map((level) => ({
        level,
        tdee: totalDailyEnergyExpenditure(bmr, level.factor),
        current: level.factor === profile.activityFactor,
      })),
    },
  };
}
