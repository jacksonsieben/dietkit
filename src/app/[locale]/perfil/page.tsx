import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ProfileForm } from "@/components/ProfileForm";
import { Legend, Shell } from "@/components/nd/kit";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/perfil">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Profile" });

  return { title: t("title"), description: t("lead") };
}

/**
 * The shell is a server component and the form is not, which is the shape every
 * personal-data screen in this app will have: the page is prerendered and
 * cacheable because it contains no data, and the data arrives only inside the
 * client component that reads the device's own store.
 */
export default async function ProfilePage({
  params,
}: PageProps<"/[locale]/perfil">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Profile");

  return (
    <main className="flex flex-1 flex-col">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{t("title")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("lead")}
          </p>
        </div>

        <ProfileForm />
      </Shell>
    </main>
  );
}
