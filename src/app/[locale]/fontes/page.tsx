import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LegalSection, Prose } from "@/components/LegalPage";
import { Legend, Shell, TextLink } from "@/components/nd/kit";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";
import { TACO_CITATION, TACO_SOURCE } from "@/lib/attribution";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/fontes">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Sources" });

  return { title: t("title") };
}

/**
 * The page the footer credit points at: the full citation, the permission
 * notice in NEPA's own words, and an honest account of what we did to the data.
 *
 * It exists because "citada a fonte" is not satisfied by a logo. A reader has to
 * be able to get from any screen to the edition, the year, the publisher, and
 * the original PDF. docs/TACO-LICENSING.md is the engineering counterpart.
 */
export default async function Sources({ params }: PageProps<"/[locale]/fontes">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Sources");

  return (
    <main className="flex flex-1 flex-col">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{t("title")}</Legend>
          <Prose>
            <p>{t("lead", { foodCount: String(TACO_SOURCE.foodCount) })}</p>
          </Prose>
        </div>

        <LegalSection heading={t("referenceHeading")}>
          {/*
            A 2px ink rule down the left, which is the only border weight this
            world has. It is also the loudest thing on the page after the
            headings, and that is the point: the licence condition is that the
            source is cited wherever the data appears, and a citation set to
            look like a footnote is a citation somebody skips. See
            docs/TACO-LICENSING.md.
          */}
          <p className="border-l-2 border-nd-ink py-1 pl-4 font-mono text-sm leading-relaxed">
            {TACO_CITATION}
          </p>
          <a
            href={TACO_SOURCE.url}
            rel="noreferrer"
            target="_blank"
            className="w-fit underline underline-offset-4"
          >
            {t("downloadLink")}
          </a>
        </LegalSection>

        <LegalSection heading={t("permissionHeading")}>
          <p>{t("permissionIntro")}</p>
          {/* NEPA's own words, marked by the same rule as the citation: this is
              the sentence the permission rests on, and paraphrasing it or
              tucking it into the prose would be us characterising a licence
              rather than showing it. */}
          <blockquote
            cite={TACO_SOURCE.url}
            lang="pt-BR"
            className="border-l-2 border-nd-ink py-1 pl-4 text-sm italic leading-relaxed"
          >
            {TACO_SOURCE.permission}
          </blockquote>
        </LegalSection>

        <LegalSection heading={t("changesHeading")}>
          <p>{t("changesIntro")}</p>
          <ul>
            <li>{t("changesNoRecalculation")}</li>
            <li>{t("changesPreservesGaps")}</li>
            <li>{t("changesContainerOnly")}</li>
          </ul>
        </LegalSection>

        <LegalSection heading={t("calculationsHeading")}>
          <p>{t("calculationsBody")}</p>
        </LegalSection>

        <LegalSection heading={t("affiliationHeading")}>
          <p>{t("affiliationBody")}</p>
        </LegalSection>

        <LegalSection heading={t("licenceHeading")}>
          <p>{t("licenceCode")}</p>
          <p>{t("licenceData")}</p>
        </LegalSection>

        <TextLink href="/">{t("backHome")}</TextLink>
      </Shell>
    </main>
  );
}
