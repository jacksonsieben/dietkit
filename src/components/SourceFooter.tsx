import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { TACO_SOURCE } from "@/lib/attribution";

/**
 * The TACO credit, on every page.
 *
 * Rendered from the layout rather than per screen on purpose. The licence
 * condition is that the source is cited wherever the data appears, and a footer
 * in the layout satisfies that for every screen ever added — including the ones
 * whose author forgets. See docs/TACO-LICENSING.md.
 */
export function SourceFooter() {
  const t = useTranslations("Attribution");

  return (
    <footer className="mt-auto border-t border-black/10 px-6 py-6 text-xs leading-relaxed opacity-60 dark:border-white/15">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
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
    </footer>
  );
}
