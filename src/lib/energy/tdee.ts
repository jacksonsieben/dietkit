/**
 * Total daily energy expenditure: what the body costs at rest, scaled by how
 * much the person actually moves.
 *
 *     TDEE = BMR × activity factor
 *
 * That is the whole equation, and its plainness is the point. The uncertainty
 * in this number is not in the arithmetic — it is entirely in the factor, which
 * is a convention rather than a measurement (see `ACTIVITY_LEVELS`). Two
 * calculators fed the same person disagree because they put the same week on
 * different rungs, not because one of them multiplied wrong.
 *
 * So this module keeps the multiplication honest and visible, and #14's screen
 * shows the factor next to the result instead of burying it. A user who can see
 * `2045 × 1,55` can reconcile our answer with somebody else's; one who is shown
 * only `3170` can only wonder which site is broken.
 */

/**
 * The range a factor may take, including a custom one typed by hand (#14).
 *
 * 1.0 is the floor because the factor scales *resting* cost: below it a person
 * would be spending less than their own basal rate, which is not a lifestyle.
 * 2.5 is above the top rung with room for someone genuinely training twice a
 * day — wide enough not to argue with a real athlete, narrow enough to catch a
 * decimal point in the wrong place.
 */
export const ACTIVITY_FACTOR_RANGE = { min: 1, max: 2.5 } as const;

/**
 * Kilocalories per day, unrounded.
 *
 * Unrounded for the same reason `basalMetabolicRate` is: #15 subtracts a
 * deficit from this and divides the remainder into grams, and rounding at each
 * step is how a macro target drifts away from the energy figure printed beside
 * it. Round once, at display.
 *
 * Throws rather than returning NaN. Every caller gets its factor from a
 * validated form (#12) or from the device's store, so a bad value here means
 * our own code lost it — and a silently wrong TDEE propagates all the way to a
 * plate of food without ever looking wrong.
 */
export function totalDailyEnergyExpenditure(
  basalMetabolicRate: number,
  activityFactor: number,
): number {
  if (!Number.isFinite(basalMetabolicRate) || basalMetabolicRate <= 0) {
    throw new RangeError(
      `basalMetabolicRate must be a positive number, got ${basalMetabolicRate}`,
    );
  }

  if (
    !Number.isFinite(activityFactor) ||
    activityFactor < ACTIVITY_FACTOR_RANGE.min ||
    activityFactor > ACTIVITY_FACTOR_RANGE.max
  ) {
    throw new RangeError(
      `activityFactor must be between ${ACTIVITY_FACTOR_RANGE.min} and ` +
        `${ACTIVITY_FACTOR_RANGE.max}, got ${activityFactor}`,
    );
  }

  return basalMetabolicRate * activityFactor;
}
