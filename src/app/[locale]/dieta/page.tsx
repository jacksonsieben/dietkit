import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { MealPlanner } from "@/components/MealPlanner";
import { Legend, Shell } from "@/components/nd/kit";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/dieta">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Plan" });

  return { title: t("title"), description: t("lead") };
}

/**
 * Server shell, client planner — the shape every personal-data screen has here.
 * The page is prerendered because it contains no data: the meals and the
 * targets they are divided from arrive only inside the client component, read
 * from the device's own store.
 */
export default async function PlanPage({
  params,
}: PageProps<"/[locale]/dieta">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Plan");

  return (
    <main className="flex flex-1 flex-col">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{t("title")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("lead")}
          </p>
        </div>

        <MealPlanner />
      </Shell>
    </main>
  );
}
