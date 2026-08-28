import { Suspense } from "react";
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

  /*
   * The day's header, handed to the planner instead of drawn above it.
   *
   * The meal screen is the same route, and a screen you opened to pick two
   * foods should not open with the day's title and a fifty-word paragraph
   * about how many meals a day has. The planner draws this on the day and
   * drops it on a meal. It is repeated in the Suspense fallback because that
   * fallback is what gets prerendered here, and the static HTML should still
   * open with the heading.
   */
  const header = (
    <div className="flex flex-col gap-3">
      <Legend as="h1">{t("title")}</Legend>
      <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
        {t("lead")}
      </p>
    </div>
  );

  return (
    <main className="flex flex-1 flex-col">
      <Shell>
        {/* The planner reads `?refeicao` to decide whether it is drawing the
            day or one meal, and `useSearchParams` on a prerendered route needs
            a boundary above it or the production build refuses to compile. The
            fallback is the planner's own loading line, because the store read
            that follows takes longer than this does. */}
        <Suspense
          fallback={
            <>
              {header}
              <p className="text-sm text-nd-dim">{t("loading")}</p>
            </>
          }
        >
          <MealPlanner header={header} />
        </Suspense>
      </Shell>
    </main>
  );
}
