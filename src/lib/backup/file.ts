import type { Snapshot } from "@/lib/storage/types";

/**
 * The backup as a file (#26).
 *
 * Two decisions that look cosmetic and are not: what the file is called, and
 * how it is written. Both are about the moment a year from now when someone
 * opens a folder full of downloads on a new phone and has to work out which of
 * these is their diet.
 */

/** The one place the extension is decided, so the picker filter can match it. */
export const BACKUP_EXTENSION = ".json";

/** Accepted by the file input on the restore screen. */
export const BACKUP_ACCEPT = ".json,application/json";

export const BACKUP_MIME = "application/json";

/**
 * `dietkit-2026-08-20.json`.
 *
 * The date is in ISO order rather than the `20-08-2026` a Brazilian would write
 * by hand, because the folder these land in sorts by name: ISO puts the newest
 * backup at the bottom of the list on every phone and every desktop, and
 * `20-08-2026` sorts by day-of-month, which is nearly the worst possible order
 * for a stack of backups.
 *
 * Built from the local date, not `toISOString()`: a backup made at nine in the
 * evening in São Paulo is stamped with the day it was made, not with tomorrow
 * in UTC.
 */
export function backupFilename(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  return `dietkit-${day}${BACKUP_EXTENSION}`;
}

/**
 * The bytes of a backup.
 *
 * Indented, which roughly doubles the size of a file that is still measured in
 * tens of kilobytes. The trade is deliberate: this is the user's only copy, and
 * a file they can open and read — recognise their own weights in, see that the
 * plan is in there — is a file they can trust and, at the limit, repair by hand.
 * A minified blob is opaque exactly when it matters most.
 */
export function serializeSnapshot(snapshot: Snapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}
