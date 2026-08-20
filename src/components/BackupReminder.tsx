"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { backupUrgency, isBackupDue, type BackupUrgency } from "@/lib/backup/reminder";
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
          isBackupDue(snapshot, settings, new Date())
            ? backupUrgency(settings)
            : undefined,
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
      await getRepository().settings.patch({
        backupRemindedAt: new Date().toISOString(),
      });
    } catch {
      // Then it asks again sooner. That is the safe half of the trade.
    }
  };

  return (
    <aside className="border-t border-amber-600/40 bg-amber-500/10 px-6 py-4 dark:border-amber-400/40">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">
            {urgency === "never" ? t("titleNever") : t("titleStale")}
          </p>
          <p className="text-xs opacity-70">{t("body")}</p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Link
            href={BACKUP_PATH}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
          >
            {t("action")}
          </Link>
          <button
            type="button"
            onClick={() => void dismiss()}
            className="text-xs underline underline-offset-4 opacity-60"
          >
            {t("dismiss")}
          </button>
        </div>
      </div>
    </aside>
  );
}
