import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { FoodSearch } from "@/components/FoodSearch";
import { Legend, Shell } from "@/components/nd/kit";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/alimentos">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Foods" });

  return { title: t("title"), description: t("lead") };
}

/**
 * Server shell, client search (#16).
 *
 * Prerendered like every other screen: the page holds no results, and the food
 * data arrives only after someone types. Rendering it on the server would mean
 * a query per visit for a table that changes once a publication.
 */
export default async function FoodsPage({
  params,
}: PageProps<"/[locale]/alimentos">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Foods");

  return (
    <main className="flex flex-1 flex-col">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{t("title")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("lead")}
          </p>
        </div>

        <FoodSearch />
      </Shell>
    </main>
  );
}
