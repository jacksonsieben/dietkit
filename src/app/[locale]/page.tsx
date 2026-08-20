import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Today } from "@/components/Today";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "App" });

  return { description: t("tagline") };
}

/**
 * The home screen is now one thing: today.
 *
 * What stood here was a list of every route in the app, which the user
 * described as "everything just thrown out on the first screen". The links did
 * not disappear — the four daily ones became the tab bar and the rest became
 * `/mais` — but the first screen stopped being a directory and became the
 * answer to the question the app is opened to ask.
 *
 * Server shell, client body, like every other personal-data screen here: this
 * file holds no data and prerenders, and everything on it arrives from
 * IndexedDB inside `Today`.
 */
export default async function Home({ params }: PageProps<"/[locale]">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  return (
    <main className="flex flex-1 flex-col">
      <Today />
    </main>
  );
}
