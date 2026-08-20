import type { IsoDate } from "@/lib/storage/types";

/**
 * Today, as the calendar day the reader is actually living in.
 *
 * Not `new Date().toISOString().slice(0, 10)`, which is the *UTC* day. Brazil
 * is UTC−3, so between 21:00 and midnight that expression names tomorrow. The
 * weight log is keyed on the date (#23), so an evening weigh-in filed under
 * tomorrow would be silently overwritten by the next morning's entry — the
 * measurement disappears, and nothing anywhere reports an error.
 *
 * `now` is a parameter so the boundary can be tested at a specific instant
 * rather than at whatever moment the suite happens to run.
 */
export function todayIsoDate(now: Date = new Date()): IsoDate {
  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * An `IsoDate` as a `Date` positioned in this device's timezone.
 *
 * `new Date("2026-08-19")` is parsed as UTC midnight, which in Brazil is the
 * evening of the *18th* — so a date rendered through `Intl` would print the day
 * before the one it was logged on. Passing the parts separately builds the
 * local midnight instead, which is the day the string names.
 *
 * Only for display. Nothing stores one of these: the log is keyed on the
 * `YYYY-MM-DD` string precisely so the day cannot drift.
 */
export function calendarDate(date: IsoDate): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}
