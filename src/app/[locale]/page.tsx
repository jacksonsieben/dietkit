import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function Home({ params }: PageProps<"/[locale]">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Home");
  const app = await getTranslations("App");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="font-mono text-4xl font-semibold tracking-tight">
          {t("heading")}
        </h1>
        <p className="text-lg text-balance opacity-80">{app("tagline")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/perfil"
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          {t("profileLink")}
        </Link>

        <Link href="/energia" className="text-sm underline underline-offset-4">
          {t("energyLink")}
        </Link>

        <Link
          href="/alimentos"
          className="text-sm underline underline-offset-4"
        >
          {t("foodsLink")}
        </Link>

        <Link href="/dieta" className="text-sm underline underline-offset-4">
          {t("planLink")}
        </Link>
      </div>

      <p className="text-sm opacity-60">
        {t("underConstruction")} {t("privacyReassurance")}
      </p>
    </main>
  );
}
