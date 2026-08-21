import { useTranslations } from "next-intl";

import { Legend, Shell, TextLink } from "@/components/nd/kit";

/**
 * A route that does not exist.
 *
 * `AppChrome` still frames it, so the plate above reads DIETKIT — `plateKey`
 * has no entry for an unknown path and the fallback is the app's own name,
 * which is the honest answer here rather than an accident. The tab bar below is
 * live, so this screen is a dead end for about a second.
 */
export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <main className="flex flex-1 flex-col justify-center">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{t("heading")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed">{t("body")}</p>
        </div>

        <TextLink href="/">{t("backHome")}</TextLink>
      </Shell>
    </main>
  );
}
