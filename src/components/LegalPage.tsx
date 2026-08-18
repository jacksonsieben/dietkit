import type { ReactNode } from "react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { LEGAL_ROUTES, legalEffectiveDate, type LegalRoute } from "@/lib/legal";

/**
 * One titled section of a notice.
 *
 * These documents are long, and a reader looking for one clause reads the
 * headings rather than the prose. Extracted so the three of them cannot drift
 * into three different visual rhythms.
 */
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-sm font-semibold uppercase tracking-wide opacity-60">
        {heading}
      </h2>
      {children}
    </section>
  );
}

/**
 * Shared chrome for the privacy notice, the terms and the health disclaimer.
 *
 * They carry one effective date between them (`src/lib/legal.ts`) because they
 * are one agreement presented in three parts — the terms defer to the health
 * disclaimer, and the health disclaimer is what makes the terms' positioning
 * mean anything. Rendering the date from a single constant is how they stay
 * consistent without anyone checking.
 */
export async function LegalPage({
  current,
  title,
  children,
}: {
  current: LegalRoute;
  title: string;
  children: ReactNode;
}) {
  const t = await getTranslations("Legal");
  const format = await getFormatter();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="font-mono text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm opacity-60">
          {t("effective", {
            // UTC, per `legalEffectiveDate`: the server renders this and the
            // client hydrates it, and a zone-dependent date would differ
            // between the two as well as being wrong for half the day.
            date: format.dateTime(legalEffectiveDate(), {
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            }),
          })}
        </p>
      </div>

      {children}

      <section className="flex flex-col gap-3 border-t border-black/10 pt-8 dark:border-white/15">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wide opacity-60">
          {t("alsoRead")}
        </h2>
        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:gap-6">
          {LEGAL_ROUTES.filter((route) => route.href !== current).map((route) => (
            <Link
              key={route.href}
              href={route.href}
              className="underline underline-offset-4"
            >
              {t(route.label)}
            </Link>
          ))}
        </div>
      </section>

      <Link href="/" className="self-start text-sm underline underline-offset-4">
        {t("backHome")}
      </Link>
    </main>
  );
}
