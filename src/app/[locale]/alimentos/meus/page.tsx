import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CustomFoodManager } from "@/components/CustomFoodManager";
import { Legend, Shell } from "@/components/nd/kit";
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
    <main className="flex flex-1 flex-col">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{t("title")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("lead")}
          </p>
        </div>

        <CustomFoodManager />
      </Shell>
    </main>
  );
}
