import { getTranslations, setRequestLocale } from "next-intl/server";

import { RetryButton } from "@/components/RetryButton";
import { Legend, Shell, TextLink } from "@/components/nd/kit";
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
    <main className="flex flex-1 flex-col justify-center">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{t("heading")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed">{t("body")}</p>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("reassurance")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <RetryButton />
          <TextLink href="/">{t("backHome")}</TextLink>
        </div>
      </Shell>
    </main>
  );
}
