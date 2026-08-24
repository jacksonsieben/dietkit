import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Training } from "@/components/Training";
import { Legend, Shell } from "@/components/nd/kit";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/treino">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Training" });

  return { title: t("title"), description: t("lead") };
}

/** Shell only: which split someone runs is their own data, so the screen
 *  itself is a client component and this page is prerendered for everyone. */
export default async function TrainingPage({
  params,
}: PageProps<"/[locale]/treino">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Training");

  return (
    <main className="flex flex-1 flex-col">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{t("title")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("lead")}
          </p>
        </div>

        <Training />
      </Shell>
    </main>
  );
}
