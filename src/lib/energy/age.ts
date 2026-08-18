import type { IsoDate } from "@/lib/storage/types";

/**
 * Age in completed years, from a birth date.
 *
 * The profile stores `birthDate` rather than an age (see `Profile` in
 * src/lib/storage/types.ts) because an age recorded once is wrong within a
 * year — and Mifflin-St Jeor subtracts five kilocalories for each of them, so a
 * stale age quietly walks the whole calculation off.
 *
 * Everything here is string arithmetic on `YYYY-MM-DD`. Going through `Date`
 * would introduce a timezone: `new Date("1995-03-14")` is UTC midnight, and a
 * reader in São Paulo would find their birthday arriving a day late. A calendar
 * day is not an instant, and this file never pretends otherwise.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

/**
 * Splits `YYYY-MM-DD` into its parts, rejecting anything that is not a real day.
 *
 * The round-trip through `Date.UTC` is the check: `2025-02-30` parses fine as
 * three integers and normalises to 2 March, so comparing the normalised result
 * back against the input is what catches it. Throws rather than returning null —
 * the form (#12) validates what a user types, so a bad value arriving here is a
 * bug in our code and should be loud.
 */
export function parseIsoDate(value: IsoDate): CalendarDay {
  const match = ISO_DATE.exec(value);
  if (!match) {
    throw new RangeError(`Expected a YYYY-MM-DD date, got ${JSON.stringify(value)}`);
  }

  const [, year, month, day] = match.map(Number);
  const normalised = new Date(Date.UTC(year, month - 1, day));

  if (
    normalised.getUTCFullYear() !== year ||
    normalised.getUTCMonth() !== month - 1 ||
    normalised.getUTCDate() !== day
  ) {
    throw new RangeError(`${value} is not a real calendar day`);
  }

  return { year, month, day };
}

/**
 * Completed years between two calendar days.
 *
 * Someone born on 29 February counts as having their birthday on 1 March in
 * non-leap years, which is the convention that falls out of comparing month and
 * day directly. It moves BMR by five kilocalories for one day a year — the
 * choice is arbitrary and the consequence is negligible, but it is written down
 * so the result is the same every time rather than the same by accident.
 */
export function ageYearsOn(birthDate: IsoDate, on: IsoDate): number {
  const birth = parseIsoDate(birthDate);
  const today = parseIsoDate(on);

  let age = today.year - birth.year;

  const beforeBirthday =
    today.month < birth.month ||
    (today.month === birth.month && today.day < birth.day);
  if (beforeBirthday) {
    age -= 1;
  }

  if (age < 0) {
    throw new RangeError(`Birth date ${birthDate} is after ${on}`);
  }

  return age;
}
