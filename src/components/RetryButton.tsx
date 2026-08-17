"use client";

import { useTranslations } from "next-intl";

/**
 * Reloads whatever URL the address bar still holds.
 *
 * The offline fallback is served *in place of* the page the user asked for, so
 * the address bar is still pointing at that page and a plain reload is the
 * right retry — a link back to `/~offline` would only re-serve this screen.
 */
export function RetryButton() {
  const t = useTranslations("Offline");

  return (
    <button
      type="button"
      onClick={() => {
        window.location.reload();
      }}
      className="self-start rounded-md border border-black/15 px-4 py-2 text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
    >
      {t("retry")}
    </button>
  );
}
