import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DietPresets } from "@/components/DietPresets";
import { Legend, Shell } from "@/components/nd/kit";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dieta/modelos">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Presets" });

  return { title: t("title"), description: t("lead") };
}

/**
 * The third way to start a plan, beside the empty list and the import (#114).
 *
 * Under `/dieta` rather than beside it: this is the diet builder's front door
 * for somebody who does not want to face an empty list, not a section of the
 * app — the tab stays lit and the plate says where they are.
 *
 * Server shell, client body, like every other screen here. The models are
 * public reference data and could have been rendered here; the person they get
 * sized for is not, and lives in IndexedDB, so the whole screen is one
 * component that reads the device.
 */
export default async function DietPresetsPage({
  params,
}: PageProps<"/[locale]/dieta/modelos">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Presets");

  return (
    <main className="flex flex-1 flex-col">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{t("title")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("lead")}
          </p>
        </div>

        <DietPresets />
      </Shell>
    </main>
  );
}
