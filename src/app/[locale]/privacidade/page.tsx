import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LegalPage, LegalSection, Prose } from "@/components/LegalPage";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";
import { LEGAL_CONTACT } from "@/lib/legal";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/privacidade">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Privacy" });

  return { title: t("title") };
}

/**
 * The privacy notice (#10).
 *
 * Written to be read, not to be defensible — a notice that lists every
 * conceivable processing activity in case one of them happens is how the genuine
 * claim here ("none of this leaves your device") gets buried. So it says what is
 * true, in order of what a reader actually wants to know.
 *
 * The two disclosures that cost something are deliberate. A food search sends
 * the typed term to the server, and Vercel's request logs record IP and user
 * agent like any origin's do — both are named plainly, because the value of
 * § D1 is that the honest version is still a good answer.
 */
export default async function Privacy({
  params,
}: PageProps<"/[locale]/privacidade">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Privacy");

  return (
    <LegalPage current="/privacidade" title={t("title")}>
      <Prose>
        <p>{t("lead")}</p>
      </Prose>

      <LegalSection heading={t("deviceHeading")}>
        <p>{t("deviceBody")}</p>
        <ul>
          <li>{t("deviceProfile")}</li>
          <li>{t("deviceWeight")}</li>
          <li>{t("deviceDiets")}</li>
          <li>{t("deviceFoods")}</li>
          <li>{t("deviceSettings")}</li>
        </ul>
        <p>{t("deviceNote")}</p>
      </LegalSection>

      <LegalSection heading={t("serverHeading")}>
        <p>{t("serverBody")}</p>
        <ul>
          <li>{t("serverSearch")}</li>
          <li>{t("serverLogs")}</li>
        </ul>
        <p>{t("serverNote")}</p>
      </LegalSection>

      <LegalSection heading={t("noneHeading")}>
        <ul>
          <li>{t("noneAccounts")}</li>
          <li>{t("noneCookies")}</li>
          <li>{t("noneAnalytics")}</li>
          <li>{t("noneAds")}</li>
        </ul>
      </LegalSection>

      <LegalSection heading={t("rightsHeading")}>
        <p>{t("rightsBody")}</p>
        <ul>
          <li>{t("rightsAccess")}</li>
          <li>{t("rightsExport")}</li>
          <li>{t("rightsDelete")}</li>
        </ul>
        <p>{t("rightsLogs")}</p>
      </LegalSection>

      <LegalSection heading={t("riskHeading")}>
        <p>{t("riskBody")}</p>
      </LegalSection>

      <LegalSection heading={t("changesHeading")}>
        <p>{t("changesBody")}</p>
      </LegalSection>

      <LegalSection heading={t("contactHeading")}>
        <p>{t("contactBody")}</p>
        <a
          href={LEGAL_CONTACT.url}
          rel="noreferrer"
          target="_blank"
          className="w-fit underline underline-offset-4"
        >
          {LEGAL_CONTACT.label}
        </a>
      </LegalSection>
    </LegalPage>
  );
}
