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
 * The privacy notice (#10, rewritten for accounts and sync in #98).
 *
 * Written to be read, not to be defensible — a notice that lists every
 * conceivable processing activity in case one of them happens is how the genuine
 * claim here gets buried. So it says what is true, in order of what a reader
 * actually wants to know.
 *
 * That claim used to be "none of this leaves your device", and #96 made it
 * false: there is an account, and there are sealed rows on a server in
 * Frankfurt. The replacement is narrower and still worth making — nothing
 * personal leaves the device *unless you turn sync on*, and when you do, what
 * arrives is bytes nobody at this end can open. A notice that had kept the old
 * sentence for even one release would have been the reason to disbelieve every
 * other sentence in it.
 *
 * The disclosures that cost something are deliberate, and there are more of
 * them now. A food search sends the typed term to the server; Vercel's request
 * logs record IP and user agent like any origin's do; a session row records the
 * same two; and the auth service has a column that would record somebody
 * signing in as you. All of them are named plainly, because the value of § D1
 * is that the honest version is still a good answer — and because the § D23
 * list only means anything if the unflattering half is in it too.
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
          <li>{t("deviceTraining")}</li>
          <li>{t("deviceFoods")}</li>
          <li>{t("deviceSettings")}</li>
        </ul>
        <p>{t("deviceNote")}</p>
      </LegalSection>

      <LegalSection heading={t("syncHeading")}>
        <p>{t("syncBody")}</p>
        <p>{t("syncSees")}</p>
        <ul>
          <li>{t("syncSeesAccount")}</li>
          <li>{t("syncSeesDevices")}</li>
          <li>{t("syncSeesRows")}</li>
        </ul>
        <p>{t("syncBlind")}</p>
        <p>{t("syncKey")}</p>
        <p>{t("syncOff")}</p>
      </LegalSection>

      <LegalSection heading={t("accountHeading")}>
        <p>{t("accountBody")}</p>
        <ul>
          <li>{t("accountEmail")}</li>
          <li>{t("accountPassword")}</li>
          <li>{t("accountSession")}</li>
          <li>{t("accountImpersonation")}</li>
          <li>{t("accountVerification")}</li>
        </ul>
        <p>{t("accountUnused")}</p>
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

      <LegalSection heading={t("whereHeading")}>
        <p>{t("whereBody")}</p>
        <ul>
          <li>{t("whereNeon")}</li>
          <li>{t("whereVercel")}</li>
        </ul>
        <p>{t("whereEmail")}</p>
        <p>{t("whereTransfers")}</p>
      </LegalSection>

      <LegalSection heading={t("retentionHeading")}>
        <p>{t("retentionBody")}</p>
        <ul>
          <li>{t("retentionSync")}</li>
          <li>{t("retentionAccount")}</li>
          <li>{t("retentionConsent")}</li>
          <li>{t("retentionLogs")}</li>
        </ul>
      </LegalSection>

      <LegalSection heading={t("rightsHeading")}>
        <p>{t("rightsBody")}</p>
        <ul>
          <li>{t("rightsAccess")}</li>
          <li>{t("rightsExport")}</li>
          <li>{t("rightsDelete")}</li>
          <li>{t("rightsAccount")}</li>
          <li>{t("rightsConsent")}</li>
        </ul>
        <p>{t("rightsLogs")}</p>
        <p>{t("rightsComplaint")}</p>
      </LegalSection>

      <LegalSection heading={t("riskHeading")}>
        <p>{t("riskBody")}</p>
        <p>{t("riskSync")}</p>
      </LegalSection>

      <LegalSection heading={t("changesHeading")}>
        <p>{t("changesBody")}</p>
      </LegalSection>

      <LegalSection heading={t("contactHeading")}>
        <p>{t("contactBody", { name: LEGAL_CONTACT.controller })}</p>
        <a
          href={`mailto:${LEGAL_CONTACT.email}`}
          className="w-fit underline underline-offset-4"
        >
          {LEGAL_CONTACT.email}
        </a>
        <p>{t("contactRepo")}</p>
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
