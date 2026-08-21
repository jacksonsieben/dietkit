import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DietImport } from "@/components/DietImport";
import { Legend, Shell } from "@/components/nd/kit";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/importar">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Import" });

  return { title: t("title"), description: t("lead") };
}

/**
 * The way in for everyone who already has a plan in the predecessor (#22).
 *
 * A screen of its own rather than a button on the profile: it is used once,
 * it writes to five stores at a time, and what it changed is a page's worth of
 * reading — none of which belongs beside a form someone edits every month.
 *
 * Server shell, client body, like every other screen here: the file is read on
 * the device and nothing about it reaches a server.
 */
export default async function ImportPage({
  params,
}: PageProps<"/[locale]/importar">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Import");

  return (
    <main className="flex flex-1 flex-col">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{t("title")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("lead")}
          </p>
        </div>

        <DietImport />
      </Shell>
    </main>
  );
}
