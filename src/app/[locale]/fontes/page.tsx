import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { resolveLocale } from "@/i18n/locale";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { TACO_CITATION, TACO_SOURCE } from "@/lib/attribution";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/fontes">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Sources" });

  return { title: t("title") };
}

/**
 * The page the footer credit points at: the full citation, the permission
 * notice in NEPA's own words, and an honest account of what we did to the data.
 *
 * It exists because "citada a fonte" is not satisfied by a logo. A reader has to
 * be able to get from any screen to the edition, the year, the publisher, and
 * the original PDF. docs/TACO-LICENSING.md is the engineering counterpart.
 */
export default async function Sources({ params }: PageProps<"/[locale]/fontes">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Sources");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="font-mono text-3xl font-semibold tracking-tight">
          {t("title")}
        </h1>
        <p className="opacity-80">
          {t("lead", { foodCount: String(TACO_SOURCE.foodCount) })}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wide opacity-60">
          {t("referenceHeading")}
        </h2>
        <p className="border-l-2 border-black/20 py-1 pl-4 font-mono text-sm leading-relaxed dark:border-white/25">
          {TACO_CITATION}
        </p>
        <a
          href={TACO_SOURCE.url}
          rel="noreferrer"
          target="_blank"
          className="self-start text-sm underline underline-offset-4"
        >
          {t("downloadLink")}
        </a>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wide opacity-60">
          {t("permissionHeading")}
        </h2>
        <p className="opacity-80">{t("permissionIntro")}</p>
        <blockquote
          cite={TACO_SOURCE.url}
          lang="pt-BR"
          className="border-l-2 border-black/20 py-1 pl-4 text-sm italic leading-relaxed dark:border-white/25"
        >
          {TACO_SOURCE.permission}
        </blockquote>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wide opacity-60">
          {t("changesHeading")}
        </h2>
        <p className="opacity-80">{t("changesIntro")}</p>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm opacity-80">
          <li>{t("changesNoRecalculation")}</li>
          <li>{t("changesPreservesGaps")}</li>
          <li>{t("changesContainerOnly")}</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wide opacity-60">
          {t("calculationsHeading")}
        </h2>
        <p className="opacity-80">{t("calculationsBody")}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wide opacity-60">
          {t("affiliationHeading")}
        </h2>
        <p className="opacity-80">{t("affiliationBody")}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-mono text-sm font-semibold uppercase tracking-wide opacity-60">
          {t("licenceHeading")}
        </h2>
        <p className="text-sm opacity-80">{t("licenceCode")}</p>
        <p className="text-sm opacity-80">{t("licenceData")}</p>
      </section>

      <Link href="/" className="self-start text-sm underline underline-offset-4">
        {t("backHome")}
      </Link>
    </main>
  );
}
