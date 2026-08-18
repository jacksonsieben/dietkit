import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LegalPage, LegalSection } from "@/components/LegalPage";
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
      <p className="opacity-80">{t("lead")}</p>

      <LegalSection heading={t("deviceHeading")}>
        <p className="opacity-80">{t("deviceBody")}</p>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm opacity-80">
          <li>{t("deviceProfile")}</li>
          <li>{t("deviceWeight")}</li>
          <li>{t("deviceDiets")}</li>
          <li>{t("deviceFoods")}</li>
          <li>{t("deviceSettings")}</li>
        </ul>
        <p className="opacity-80">{t("deviceNote")}</p>
      </LegalSection>

      <LegalSection heading={t("serverHeading")}>
        <p className="opacity-80">{t("serverBody")}</p>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm opacity-80">
          <li>{t("serverSearch")}</li>
          <li>{t("serverLogs")}</li>
        </ul>
        <p className="opacity-80">{t("serverNote")}</p>
      </LegalSection>

      <LegalSection heading={t("noneHeading")}>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm opacity-80">
          <li>{t("noneAccounts")}</li>
          <li>{t("noneCookies")}</li>
          <li>{t("noneAnalytics")}</li>
          <li>{t("noneAds")}</li>
        </ul>
      </LegalSection>

      <LegalSection heading={t("rightsHeading")}>
        <p className="opacity-80">{t("rightsBody")}</p>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm opacity-80">
          <li>{t("rightsAccess")}</li>
          <li>{t("rightsExport")}</li>
          <li>{t("rightsDelete")}</li>
        </ul>
        <p className="text-sm opacity-80">{t("rightsLogs")}</p>
      </LegalSection>

      <LegalSection heading={t("riskHeading")}>
        <p className="opacity-80">{t("riskBody")}</p>
      </LegalSection>

      <LegalSection heading={t("changesHeading")}>
        <p className="opacity-80">{t("changesBody")}</p>
      </LegalSection>

      <LegalSection heading={t("contactHeading")}>
        <p className="opacity-80">{t("contactBody")}</p>
        <a
          href={LEGAL_CONTACT.url}
          rel="noreferrer"
          target="_blank"
          className="self-start font-mono text-sm underline underline-offset-4"
        >
          {LEGAL_CONTACT.label}
        </a>
      </LegalSection>
    </LegalPage>
  );
}
