import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { TACO_SOURCE } from "@/lib/attribution";
import { LEGAL_ROUTES } from "@/lib/legal";

/**
 * The TACO credit and the legal notices, on every page.
 *
 * Rendered from the layout rather than per screen on purpose. The licence
 * condition is that the source is cited wherever the data appears, and a footer
 * in the layout satisfies that for every screen ever added — including the ones
 * whose author forgets. See docs/TACO-LICENSING.md.
 *
 * The three notices from #10 ride along for the same reason. The issue asks for
 * them to be reachable from onboarding and settings; neither screen exists yet,
 * and putting the links somewhere that depends on a screen being written is how
 * a launch blocker goes missing. When those screens land they should surface the
 * health disclaimer at the point it matters — beside the body metrics input
 * (#12) — rather than replace this.
 */
export function SourceFooter() {
  const t = useTranslations("Attribution");
  const legal = useTranslations("Legal");

  return (
    <footer className="mt-auto border-t border-black/10 px-6 py-6 text-xs leading-relaxed opacity-60 dark:border-white/15">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
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

        <nav className="flex flex-wrap gap-x-6 gap-y-1">
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
      </div>
    </footer>
  );
}
