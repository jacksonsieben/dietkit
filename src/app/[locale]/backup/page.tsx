import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { BackupPanel } from "@/components/BackupPanel";
import { Legend, Shell } from "@/components/nd/kit";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/backup">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Backup" });

  return { title: t("title"), description: t("lead") };
}

/**
 * Where the only copy of everything is made, and put back (#26).
 *
 * `/backup` rather than a Portuguese segment, unlike every other route here:
 * "backup" *is* the Portuguese word for this — nobody in Brazil asks for a
 * cópia de segurança — and the reminder strip links here from every screen, so
 * the address is worth being the one people expect.
 *
 * Server shell, client body, like the rest: the file is written and read on the
 * device, and nothing about it reaches a server.
 */
export default async function BackupPage({
  params,
}: PageProps<"/[locale]/backup">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Backup");

  return (
    <main className="flex flex-1 flex-col">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{t("title")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("lead")}
          </p>
        </div>

        <BackupPanel />
      </Shell>
    </main>
  );
}
