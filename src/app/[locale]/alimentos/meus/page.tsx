import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CustomFoodManager } from "@/components/CustomFoodManager";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/alimentos/meus">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "MyFoods" });

  return { title: t("title"), description: t("lead") };
}

/**
 * The other half of the food list (#17).
 *
 * A sibling of the search screen rather than a section inside it: this one is
 * about a handful of records the user owns and returns to, and mixing it into
 * the search would put a management list under a box whose whole job is to be
 * empty until someone types.
 *
 * Server shell, client body — the foods live in IndexedDB, so the page itself
 * has nothing to render and is prerendered like every other screen here.
 */
export default async function MyFoodsPage({
  params,
}: PageProps<"/[locale]/alimentos/meus">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("MyFoods");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="font-mono text-3xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm leading-relaxed opacity-70">{t("lead")}</p>
      </div>

      <CustomFoodManager />
    </main>
  );
}
