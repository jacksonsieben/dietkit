import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SubstitutionGroupManager } from "@/components/SubstitutionGroupManager";
import { Legend, Shell } from "@/components/nd/kit";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/alimentos/grupos">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Groups" });

  return { title: t("title"), description: t("lead") };
}

/**
 * The third device-owned list, next to the search and the user's own foods (#20).
 *
 * Under `/alimentos` rather than under `/dieta` because a group is a fact about
 * foods, not about one plan: the same "Frutas" applies to every meal that opts
 * into it, and burying it inside the builder would suggest it were part of the
 * diet being edited.
 *
 * Server shell, client body — the groups live in IndexedDB.
 */
export default async function GroupsPage({
  params,
}: PageProps<"/[locale]/alimentos/grupos">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Groups");

  return (
    <main className="flex flex-1 flex-col">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{t("title")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("lead")}
          </p>
        </div>

        <SubstitutionGroupManager />
      </Shell>
    </main>
  );
}
