import { getTranslations, setRequestLocale } from "next-intl/server";

import { RetryButton } from "@/components/RetryButton";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";

/**
 * The offline fallback, served by the service worker when a navigation fails
 * and no copy of the requested page is in the cache (`src/sw.ts`).
 *
 * The `~` is Serwist's convention for a route that belongs to the shell rather
 * than to the product: nobody navigates here on purpose, and the prefix keeps
 * the name out of the way of real URLs. The address bar keeps showing the page
 * the user actually asked for — this screen is the response to it, not a
 * redirect — which is why the retry button reloads instead of linking.
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function OfflinePage({
  params,
}: PageProps<"/[locale]/~offline">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Offline");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-5 px-6 py-16">
      <h1 className="font-mono text-3xl font-semibold tracking-tight">
        {t("heading")}
      </h1>
      <p className="opacity-80">{t("body")}</p>
      <p className="text-sm opacity-60">{t("reassurance")}</p>

      <div className="flex flex-wrap items-center gap-4 pt-2">
        <RetryButton />
        <Link href="/" className="text-sm underline underline-offset-4">
          {t("backHome")}
        </Link>
      </div>
    </main>
  );
}
