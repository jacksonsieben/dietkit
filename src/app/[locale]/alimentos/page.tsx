import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { FoodSearch } from "@/components/FoodSearch";
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="font-mono text-3xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm leading-relaxed opacity-70">{t("lead")}</p>
      </div>

      <FoodSearch />
    </main>
  );
}
