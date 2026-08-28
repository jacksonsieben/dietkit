"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Legend } from "@/components/nd/kit";
import {
  dismissedNotices,
  withNoticeRestored,
  type NoticeLabel,
} from "@/lib/notices";
import { getRepository } from "@/lib/storage";
import type { NoticeId } from "@/lib/storage/types";

/**
 * The way back from every notice the user has put away.
 *
 * This row is what makes the dismiss buttons honest. "Não mostrar de novo" is a
 * promise the app can only afford to keep because the answer is listed
 * somewhere and can be taken back — a data-loss warning that the user silenced
 * on a Tuesday and can never find again is a footgun with a nice label on it.
 *
 * Absent rather than empty when nothing is hidden. A permanently visible
 * "nothing is hidden" panel would be a fourth standing notice on a page that
 * exists partly to reduce their number, and the setting has nothing to say
 * until the user has used it.
 */
export function DismissedNotices() {
  const t = useTranslations("More");

  const [hidden, setHidden] = useState<readonly NoticeId[]>([]);

  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const settings = await getRepository().settings.get();
        if (live) setHidden(dismissedNotices(settings));
      } catch {
        // No store, nothing to restore.
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  const restore = async (notice: NoticeId) => {
    setHidden((current) => current.filter((id) => id !== notice));
    try {
      const repository = getRepository();
      const settings = await repository.settings.get();
      await repository.settings.patch({
        dismissedNotices: withNoticeRestored(settings, notice),
      });
    } catch {
      // Then it stays hidden until the next try, which is a row on this page
      // rather than a lost setting.
    }
  };

  if (hidden.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Legend as="h2">{t("notices")}</Legend>
        <p className="max-w-prose text-sm leading-relaxed">
          {t("noticesLead")}
        </p>
      </div>

      <ul className="flex flex-col border-t-2 border-nd-ink">
        {hidden.map((notice) => (
          <li
            key={notice}
            className="flex items-center justify-between gap-4 border-b border-nd-unlit px-2 py-4"
          >
            <span className="flex flex-col gap-1">
              <span className="text-base font-medium tracking-tight">
                {t(`notice_${notice}` as NoticeLabel)}
              </span>
              <span className="text-sm text-nd-dim">
                {t(`notice_${notice}Hint` as `${NoticeLabel}Hint`)}
              </span>
            </span>

            <button
              type="button"
              onClick={() => void restore(notice)}
              className="shrink-0 text-sm text-nd-dim underline underline-offset-4"
            >
              {t("noticesRestore")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
