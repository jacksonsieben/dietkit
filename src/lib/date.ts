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
