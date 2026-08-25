import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { StrengthHistory } from "@/components/StrengthHistory";
import { Legend, Shell, TextLink } from "@/components/nd/kit";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/treino/historico">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Training.history" });

  return { title: t("title"), description: t("lead") };
}

/**
 * A subroute of /treino rather than a route per movement (#81).
 *
 * `/treino/historico/[slug]` was the obvious shape and it is the wrong one:
 * the movement is picked from what the device has logged, which the server
 * does not know and must not, so a dynamic segment would prerender two hundred
 * pages of catalog to hold fifteen the person actually trains. The picker is a
 * control on one screen, and `activeTab` keeps the training plate lit for any
 * path under /treino without being told about this one.
 *
 * Shell only, like every other page here: the log is the person's own data, so
 * the screen is a client component and this page is prerendered for everyone.
 */
export default async function StrengthHistoryPage({
  params,
}: PageProps<"/[locale]/treino/historico">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Training.history");

  return (
    <main className="flex flex-1 flex-col">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{t("title")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("lead")}
          </p>
          <TextLink href="/treino">{t("back")}</TextLink>
        </div>

        <StrengthHistory />
      </Shell>
    </main>
  );
}
