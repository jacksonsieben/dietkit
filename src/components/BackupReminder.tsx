"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import {
  backupUrgency,
  isBackupDue,
  type BackupUrgency,
} from "@/lib/backup/reminder";
import { withNoticeDismissed } from "@/lib/notices";
import { getRepository } from "@/lib/storage";

/**
 * The prompt that asks for a backup before there is anything to regret (#26).
 *
 * A local-first app owes the user this warning, and owes it to them early. The
 * failure this exists to prevent has no symptom until it is total: nothing about
 * "clear browsing data", a full disk, or a new phone tells anyone that a year of
 * weighings was in there.
 *
 * When it appears is `lib/backup/reminder.ts`, deliberately — the rule is driven
 * by unsaved change rather than by a timer, so that someone who has already
 * exported is never nagged, and the prompt keeps meaning something. What is left
 * here is only the showing of it.
 *
 * Rendered as a strip at the foot of the layout, next to the install prompt,
 * rather than as a modal: it is important and it is not urgent, and a dialog
 * across whatever the user came here to do would be read as an obstacle rather
 * than as advice.
 *
 * And turning it down is final. It used to buy a fortnight's quiet, which meant
 * the strip came back to a user who had already answered it — twice a month,
 * for ever, under every screen. `lib/notices.ts` holds the answer instead, and
 * `/mais` is where the user gets the strip back if the warning stops being one
 * they want to ignore.
 */

/** The route this is asking the user to visit — no point asking while there. */
const BACKUP_PATH = "/backup";

export function BackupReminder() {
  const t = useTranslations("Backup.reminder");
  const pathname = usePathname();

  const [urgency, setUrgency] = useState<BackupUrgency | undefined>(undefined);

  useEffect(() => {
    // Nothing is rendered until this has run, which is also what keeps the
    // server and the hydrating client agreeing: the answer depends entirely on
    // IndexedDB, which the server has no view of.
    let live = true;

    void (async () => {
      try {
        const repository = getRepository();
        const [snapshot, settings] = await Promise.all([
          repository.exportAll(),
          repository.settings.get(),
        ]);
        if (!live) return;
        setUrgency(
          isBackupDue(snapshot, settings) ? backupUrgency(settings) : undefined,
        );
      } catch {
        // No store, no advice worth giving. A browser without IndexedDB has
        // bigger problems with this app than the backup prompt.
      }
    })();

    return () => {
      live = false;
    };
    // Re-checked on navigation: the export that answers this prompt happens on
    // another route, and the strip should be gone by the time the user comes
    // back rather than one reload later.
  }, [pathname]);

  if (urgency === undefined || pathname === BACKUP_PATH) return null;

  const dismiss = async () => {
    // Optimistic: the strip goes on the click, not on the write. The worst case
    // is a reminder that comes back on the next visit, which is the direction to
    // fail in.
    setUrgency(undefined);
    try {
      const repository = getRepository();
      const settings = await repository.settings.get();
      await repository.settings.patch({
        dismissedNotices: withNoticeDismissed(settings, "backup"),
      });
    } catch {
      // Then it asks again on the next load. That is the safe half of the trade.
    }
  };

  return (
    // Red, which this palette spends nowhere else but on something that has
    // gone past where it should be. An overdue backup qualifies: the failure it
    // warns about is total and silent, and it is the only condition in the app
    // where the right reaction is to stop and deal with it.
    <aside className="border-t-2 border-nd-red px-6 py-4">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium tracking-[0.08em] text-nd-red-ink uppercase">
            {urgency === "never" ? t("titleNever") : t("titleStale")}
          </p>
          <p className="text-xs text-nd-dim">{t("body")}</p>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <Link
            href={BACKUP_PATH}
            className="nd-invert bg-nd-ink px-4 py-2 text-xs font-medium tracking-[0.08em] text-nd-ground uppercase"
          >
            {t("action")}
          </Link>
          <button
            type="button"
            onClick={() => void dismiss()}
            className="text-xs text-nd-dim underline underline-offset-4"
          >
            {t("dismiss")}
          </button>
        </div>
      </div>
    </aside>
  );
}
