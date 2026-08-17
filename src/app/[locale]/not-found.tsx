import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="font-mono text-2xl font-semibold tracking-tight">
        {t("heading")}
      </h1>
      <p className="opacity-70">{t("body")}</p>
      <Link href="/" className="text-sm underline underline-offset-4">
        {t("backHome")}
      </Link>
    </main>
  );
}
