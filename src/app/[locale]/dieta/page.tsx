import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { MealPlanner } from "@/components/MealPlanner";
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="font-mono text-3xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm opacity-70">{t("lead")}</p>
      </div>

      <MealPlanner />
    </main>
  );
}
