import type { Repository } from "@/lib/storage";
import type { IsoTimestamp, Snapshot } from "@/lib/storage/types";

import { serializeSnapshot } from "./file";

/**
 * The two writes a backup screen makes (#26).
 *
 * Thin on purpose — the adapter already does the hard part, replacing six
 * stores in one transaction — but not absent, because both of these have a
 * second step that is easy to leave out and invisible when it is missing. An
 * export that does not record that it happened nags the user again the next
 * morning; a restore that does not is asked for a backup of the file they just
 * restored from. Neither is the sort of bug a browser pass finds.
 */

export interface ExportedBackup {
  snapshot: Snapshot;
  /** Ready to hand to a `Blob`. */
  text: string;
}

/**
 * Reads everything off the device and stamps the export.
 *
 * `lastBackupAt` is written before the file has been saved anywhere, which is
 * the honest ordering available: once the bytes leave for the share sheet or
 * the downloads folder, no API says whether they arrived. Guessing wrong in the
 * other direction — never stamping, so the reminder never stops — would train
 * the user to ignore the one prompt that matters.
 */
export async function exportBackup(
  repository: Repository,
  now: IsoTimestamp,
): Promise<ExportedBackup> {
  const snapshot = await repository.exportAll();
  const stamped: Snapshot = { ...snapshot, exportedAt: now };

  await repository.settings.patch({ lastBackupAt: now });

  return { snapshot: stamped, text: serializeSnapshot(stamped) };
}

/**
 * Replaces the device's data with a file's.
 *
 * The `lastBackupAt` written afterwards is deliberately *now* rather than the
 * value carried in the file: whatever that file says about its own history, the
 * fact on the ground is that the user is holding a file containing exactly what
 * the device now holds. Restoring and then immediately being told to back up
 * would read as the app not having noticed what just happened.
 *
 * The dismissals in the file are left alone, which is the opposite of what used
 * to happen to the reminder's timestamp — and for the same reason. That was a
 * fortnight counted from a moment on somebody else's device, so it had nothing
 * to say here; `dismissedNotices` is the user stating a preference, and it
 * arrives with their locale and their goal, which nobody would think to reset.
 */
export async function restoreBackup(
  repository: Repository,
  snapshot: Snapshot,
  now: IsoTimestamp,
): Promise<void> {
  await repository.importAll(snapshot);
  await repository.settings.patch({ lastBackupAt: now });
}
