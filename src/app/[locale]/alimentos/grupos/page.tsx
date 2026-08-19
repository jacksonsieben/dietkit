import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { SubstitutionGroupManager } from "@/components/SubstitutionGroupManager";
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="font-mono text-3xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm leading-relaxed opacity-70">{t("lead")}</p>
      </div>

      <SubstitutionGroupManager />
    </main>
  );
}
