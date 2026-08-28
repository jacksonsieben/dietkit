"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { TACO_SOURCE } from "@/lib/attribution";
import { LEGAL_ROUTES } from "@/lib/legal";
import { isNoticeDismissed, withNoticeDismissed } from "@/lib/notices";
import { getRepository } from "@/lib/storage";

/**
 * The TACO credit and the legal notices, on every page.
 *
 * Rendered from the layout rather than per screen on purpose. The licence
 * condition is that the source is cited wherever the data appears, and a footer
 * in the layout satisfies that for every screen ever added — including the ones
 * whose author forgets. See docs/TACO-LICENSING.md.
 *
 * The three notices from #10 ride along for the same reason. The issue asks for
 * them to be reachable from onboarding and settings; those screens exist now
 * (`/mais` lists all four documents), so the footer is no longer the only way
 * to them — which is what makes the next paragraph possible.
 *
 * **It folds.** Five lines of fine print under every screen, for ever, is a
 * real cost paid on every visit for something read once, and the user can now
 * put it away (`lib/notices.ts`). What folding leaves is not nothing: the
 * credit naming NEPA/UNICAMP and the link to `/fontes` stay, on one line, on
 * every page. That is precisely the row docs/TACO-LICENSING.md requires under
 * "where it appears", and its rule 5 — attribution is not a settings toggle —
 * is why the button hides the notice links and never the citation.
 */
export function SourceFooter() {
  const t = useTranslations("Attribution");
  const legal = useTranslations("Legal");

  // `undefined` until the store answers. The fine print starts folded rather
  // than open, for the reason `BackupReminder` renders nothing until it knows:
  // a footer that unfolds itself on every navigation and then snaps shut is
  // worse than one that arrives quietly a frame late. The citation does not
  // wait on any of this — it is in the first paint, and in the HTML for a
  // reader with no JavaScript at all.
  const [dismissed, setDismissed] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const settings = await getRepository().settings.get();
        if (live) setDismissed(isNoticeDismissed(settings, "legal"));
      } catch {
        // No store, no preference. Showing the notices is the safe direction to
        // fail in: they are documents the reader is entitled to find.
        if (live) setDismissed(false);
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  const dismiss = async () => {
    setDismissed(true);
    try {
      const settings = await getRepository().settings.get();
      await getRepository().settings.patch({
        dismissedNotices: withNoticeDismissed(settings, "legal"),
      });
    } catch {
      // Then it is back on the next load, which is the direction that costs a
      // scroll rather than a document.
    }
  };

  return (
    // `text-nd-dim` rather than `opacity-60`: in a two-value palette a faded
    // black is a grey that belongs to neither value, and it stops being legible
    // the moment it lands on the dotted ground. The one dim token is contrast-
    // checked against both grounds; opacity is not checked against anything.
    <footer className="mt-auto border-t border-nd-unlit px-6 py-6 text-xs leading-relaxed text-nd-dim">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <p>
            {t("credit", {
              publisher: TACO_SOURCE.publisherShort,
              edition: TACO_SOURCE.edition,
              // A string, not the number: ICU would format 2011 as "2.011" in
              // pt-BR, which is a year nobody has lived through.
              year: String(TACO_SOURCE.year),
            })}
          </p>
          <Link href="/fontes" className="underline underline-offset-4">
            {t("moreLink")}
          </Link>
        </div>

        {dismissed !== false ? null : (
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <nav
              aria-label={legal("navLabel")}
              className="flex flex-wrap gap-x-6 gap-y-1"
            >
              {LEGAL_ROUTES.map((route) => (
                <Link
                  key={route.href}
                  href={route.href}
                  className="underline underline-offset-4"
                >
                  {legal(route.label)}
                </Link>
              ))}
            </nav>

            <button
              type="button"
              onClick={() => void dismiss()}
              className="underline underline-offset-4"
            >
              {legal("dismiss")}
            </button>
          </div>
        )}
      </div>
    </footer>
  );
}
