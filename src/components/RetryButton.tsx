"use client";

import { useTranslations } from "next-intl";

import { Ghost } from "@/components/nd/kit";

/**
 * Reloads whatever URL the address bar still holds.
 *
 * The offline fallback is served *in place of* the page the user asked for, so
 * the address bar is still pointing at that page and a plain reload is the
 * right retry — a link back to `/~offline` would only re-serve this screen.
 *
 * A `Ghost` rather than the filled action: the button cannot promise anything.
 * The connection is either back or it is not, and drawing "tentar de novo" as
 * the confident block on the screen would be the app asserting a result it has
 * no way to produce.
 */
export function RetryButton() {
  const t = useTranslations("Offline");

  return (
    <Ghost
      type="button"
      onClick={() => {
        window.location.reload();
      }}
    >
      {t("retry")}
    </Ghost>
  );
}
