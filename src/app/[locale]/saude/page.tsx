import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LegalPage, LegalSection, Prose } from "@/components/LegalPage";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";
import { CFN_REFERENCE } from "@/lib/legal";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/saude">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Health" });

  return { title: t("title") };
}

/**
 * The health disclaimer (#10, docs/DECISIONS.md § D10).
 *
 * The load-bearing one. Dietary prescription is an activity private to the
 * registered nutritionist under Lei nº 8.234/1991, so DietKit says in plain
 * words that it computes and the user decides — not as a hedge bolted onto a
 * product that behaves otherwise, but as an accurate description of what a
 * calculator is.
 *
 * The section on counting is here for a reason that has nothing to do with
 * liability. A calorie tracker is a bad object to hand someone with a history of
 * disordered eating, and a product that offers no way of noticing that is worse
 * than one that says so out loud.
 */
export default async function Health({ params }: PageProps<"/[locale]/saude">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Health");

  return (
    <LegalPage current="/saude" title={t("title")}>
      <Prose>
        <p>{t("lead")}</p>
      </Prose>

      <LegalSection heading={t("notPrescriptionHeading")}>
        <p>
          {t("notPrescriptionBody", {
            law: CFN_REFERENCE.law,
            council: CFN_REFERENCE.council,
          })}
        </p>
        <p>{t("notPrescriptionBody2")}</p>
      </LegalSection>

      <LegalSection heading={t("estimateHeading")}>
        <p>{t("estimateBody")}</p>
        <p>{t("estimateTaco")}</p>
      </LegalSection>

      <LegalSection heading={t("professionalHeading")}>
        <p>{t("professionalBody")}</p>
        <ul>
          <li>{t("professionalPregnancy")}</li>
          <li>{t("professionalAge")}</li>
          <li>{t("professionalCondition")}</li>
          <li>{t("professionalMeds")}</li>
          <li>{t("professionalHistory")}</li>
          <li>{t("professionalGoal")}</li>
        </ul>
      </LegalSection>

      <LegalSection heading={t("disorderHeading")}>
        <p>{t("disorderBody")}</p>
      </LegalSection>

      <LegalSection heading={t("deviceHeading")}>
        <p>{t("deviceBody")}</p>
        <p className="font-medium">{t("emergencyBody")}</p>
      </LegalSection>
    </LegalPage>
  );
}
