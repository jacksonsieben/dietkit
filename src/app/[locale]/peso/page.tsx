import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { WeightLog } from "@/components/WeightLog";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/peso">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Weight" });

  return { title: t("title"), description: t("lead") };
}

/** Shell only: the log itself is a client component, because the log is the
 *  user's own data and this page is prerendered for everyone. */
export default async function WeightPage({
  params,
}: PageProps<"/[locale]/peso">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Weight");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="font-mono text-3xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm opacity-70">{t("lead")}</p>
      </div>

      <WeightLog />
    </main>
  );
}
