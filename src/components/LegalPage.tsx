import type { ReactNode } from "react";
import { getFormatter, getTranslations } from "next-intl/server";

import { Hairline, Legend, Shell, TextLink } from "@/components/nd/kit";
import { Link } from "@/i18n/navigation";
import { LEGAL_ROUTES, legalEffectiveDate, type LegalRoute } from "@/lib/legal";

/**
 * A run of prose, set once for the whole document rather than per paragraph.
 *
 * The instrument world's type ramp was written for readings — a legend, a
 * panel, a unit — and none of those slots is "eleven paragraphs about data
 * retention". This is the seam where a document meets it, and the rule that
 * settles it is that the *container* sets the type, not the elements inside it.
 * Before this, every one of the forty-odd paragraphs across the three notices
 * carried its own copy of the same four classes, which is how one of them ends
 * up a size out from its neighbours and nobody notices for a year.
 *
 * Measure is capped at `max-w-prose` for the ordinary reason and the layout
 * stays one column: at 1280px the notices do not become a second column of
 * anything, they just stop getting wider.
 */
export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="flex max-w-prose flex-col gap-3 text-sm leading-relaxed [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5">
      {children}
    </div>
  );
}

/**
 * One titled section of a notice.
 *
 * These documents are long, and a reader looking for one clause reads the
 * headings rather than the prose. Extracted so the three of them cannot drift
 * into three different visual rhythms.
 *
 * The heading is a `Legend`, the same label voice every readout in the app is
 * named with, and the hierarchy under it is carried by the rule above rather
 * than by a second type size. That is the world's own logic — structure is
 * drawn, not implied — and it means a document adds no new type sizes to an app
 * that has eight of them. `/fontes` imports this directly: it is a page of
 * sections without being one of the three notices.
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
      <Hairline />
      <Legend as="h2">{heading}</Legend>
      <Prose>{children}</Prose>
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
    <main className="flex flex-1 flex-col">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{title}</Legend>
          <p className="text-sm text-nd-dim" data-numeric>
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

        <section className="flex flex-col gap-3">
          <Hairline />
          <Legend as="h2">{t("alsoRead")}</Legend>
          <div className="flex flex-col gap-2 text-sm sm:flex-row sm:gap-6">
            {LEGAL_ROUTES.filter((route) => route.href !== current).map(
              (route) => (
                <Link
                  key={route.href}
                  href={route.href}
                  className="w-fit underline underline-offset-4"
                >
                  {t(route.label)}
                </Link>
              ),
            )}
          </div>
        </section>

        <TextLink href="/">{t("backHome")}</TextLink>
      </Shell>
    </main>
  );
}
