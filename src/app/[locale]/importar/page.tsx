import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DietImport } from "@/components/DietImport";
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="font-mono text-3xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="text-sm leading-relaxed opacity-70">{t("lead")}</p>
      </div>

      <DietImport />
    </main>
  );
}
