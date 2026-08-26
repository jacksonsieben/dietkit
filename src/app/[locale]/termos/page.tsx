import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LegalPage, LegalSection, Prose } from "@/components/LegalPage";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/termos">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Terms" });

  return { title: t("title") };
}

/**
 * The terms of use (#10, extended for accounts and sync in #98).
 *
 * Short on purpose. There is no payment to dispute and no user content to
 * moderate, so most of what a standard terms document exists to handle still
 * does not arise here.
 *
 * Two things do now. There is an account, so there is a minimum age — 18,
 * chosen rather than inherited: Lei n.º 58/2019 art. 16 puts Portugal's floor
 * for information-society services at 13, and an app that computes energy
 * targets and tracks a weight has no business holding a thirteen-year-old's
 * data. And there is a key we cannot reset, which has to be said in the terms
 * as well as in the notice, because it is the one consequence a reader cannot
 * undo by changing their mind later.
 *
 * The liability section is written knowing it cannot do what such sections
 * usually try to do: the Código de Defesa do Consumidor voids blanket
 * disclaimers against consumers (art. 51), so claiming immunity would be both
 * unenforceable and a signal that nobody read the law. It states the real limits
 * of an estimate and then says outright that consumer law wins where they
 * conflict.
 */
export default async function Terms({ params }: PageProps<"/[locale]/termos">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Terms");

  return (
    <LegalPage current="/termos" title={t("title")}>
      <Prose>
        <p>{t("lead")}</p>
      </Prose>

      <LegalSection heading={t("whatHeading")}>
        <p>{t("whatBody")}</p>
        <p>{t("whatNot")}</p>
      </LegalSection>

      <LegalSection heading={t("useHeading")}>
        <p>{t("useBody")}</p>
        <p>{t("useAvailability")}</p>
      </LegalSection>

      <LegalSection heading={t("ageHeading")}>
        <p>{t("ageBody")}</p>
      </LegalSection>

      <LegalSection heading={t("accountHeading")}>
        <p>{t("accountBody")}</p>
        <p>{t("accountSecurity")}</p>
        <p>{t("accountDeletion")}</p>
      </LegalSection>

      <LegalSection heading={t("responsibilityHeading")}>
        <p>{t("responsibilityBody")}</p>
        <p>{t("responsibilityBackup")}</p>
      </LegalSection>

      <LegalSection heading={t("liabilityHeading")}>
        <p>{t("liabilityBody")}</p>
        <p>{t("liabilityConsumer")}</p>
      </LegalSection>

      <LegalSection heading={t("dataHeading")}>
        <p>{t("dataBody")}</p>
      </LegalSection>

      <LegalSection heading={t("licenceHeading")}>
        <p>{t("licenceBody")}</p>
      </LegalSection>

      <LegalSection heading={t("changesHeading")}>
        <p>{t("changesBody")}</p>
      </LegalSection>

      <LegalSection heading={t("lawHeading")}>
        <p>{t("lawBody")}</p>
      </LegalSection>
    </LegalPage>
  );
}
