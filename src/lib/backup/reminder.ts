import { isNoticeDismissed } from "@/lib/notices";
import type { Settings, Snapshot } from "@/lib/storage/types";

import { lastChangeAt } from "./snapshot";

/**
 * When to ask for a backup (#26).
 *
 * A local-first app owes its users this. Everything they have lives in one
 * browser's storage on one device; clearing site data, a full disk, a lost
 * phone, or Safari deciding a rarely-opened site is stale (#7) all end the same
 * way, and the only defence is a file that already exists somewhere else. The
 * user has no way to know that from the outside, so the app has to say it —
 * before the loss, not after.
 *
 * The hard part is not the asking, it is the not-asking. A prompt that shows up
 * on a schedule trains people to dismiss it, and a reminder that is always
 * dismissed is the same as no reminder on the day the phone goes in the river.
 * So the rule here is driven by *unsaved change*, not by the calendar: this asks
 * when there is something in the store that is not in any file, and stays quiet
 * otherwise, however long "otherwise" runs.
 *
 * Turning it down used to buy a fortnight, which was the same bet made the
 * other way round — a strip that comes back for ever is one people learn to
 * read past, and it was one of two permanently parked at the foot of every
 * screen. "Não mostrar de novo" now means it, through `lib/notices.ts`, and
 * `/mais` is where it comes back from.
 */

/**
 * What counts as enough to be worth losing.
 *
 * The test each of these is an answer to: *would getting this back be an
 * evening's work, or a minute's?*
 *
 * - One plan is already enough. It is the most expensive thing the app makes —
 *   a solve over a food table, adjusted by hand until the meals were right.
 * - Weighings are cheap to enter and impossible to recreate: nobody remembers
 *   what they weighed on a Tuesday in June. A week of mornings is a trend line,
 *   which is the only thing that makes the log worth keeping (#24).
 * - Custom foods are each a package read off the back and typed in (#19).
 *
 * Substitution groups are deliberately not on this list. A group is a couple of
 * taps over foods that are themselves counted here, and it means nothing
 * without them.
 */
export const BACKUP_WORTH = {
  weighings: 5,
  customFoods: 3,
} as const;

export function hasEnoughToLose(snapshot: Snapshot): boolean {
  return (
    snapshot.diets.length > 0 ||
    snapshot.weight.length >= BACKUP_WORTH.weighings ||
    snapshot.customFoods.length >= BACKUP_WORTH.customFoods
  );
}

/**
 * Whether to show the backup prompt right now.
 *
 * Pure, and takes no clock: what it compares are two timestamps the store
 * already carries, and since the fortnight went the current time stopped being
 * part of the answer. Nothing here needs a device or a fake timer to test.
 */
export function isBackupDue(snapshot: Snapshot, settings: Settings): boolean {
  if (!hasEnoughToLose(snapshot)) return false;

  const changed = lastChangeAt(snapshot);
  // Data that passed the bar above but carries no legible timestamp: treat it
  // as unsaved, because the alternative is staying quiet about real data.
  const saved = settings.lastBackupAt;
  if (saved !== undefined && changed !== undefined && changed <= saved) {
    return false;
  }

  return !isNoticeDismissed(settings, "backup");
}

/**
 * What the prompt should say it is protecting — the *never* case reads
 * differently from the *stale* one.
 *
 * "You have never backed this up" is news. "Your backup is from three weeks
 * ago" is a nudge. Collapsing them into one sentence would make the first too
 * mild and the second alarming.
 */
export type BackupUrgency = "never" | "stale";

export function backupUrgency(settings: Settings): BackupUrgency {
  return settings.lastBackupAt === undefined ? "never" : "stale";
}
