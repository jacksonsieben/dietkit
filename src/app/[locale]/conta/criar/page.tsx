import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Legend, Shell, TextLink } from "@/components/nd/kit";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";
import { signUp } from "@/lib/auth/actions";

import { AccountForm } from "../AccountForm";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/conta/criar">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Account" });

  return { title: t("createTitle"), description: t("createLead") };
}

/**
 * Create an account (#93).
 *
 * The lead says what the account is for and what it holds, on the screen where
 * somebody is deciding whether to have one — not in the privacy notice they
 * will read afterwards if at all. The full consent conversation is #96; this is
 * the honest one-line version of it, and it has to be true on its own.
 */
export default async function SignUpPage({
  params,
}: PageProps<"/[locale]/conta/criar">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Account");

  return (
    <main className="flex flex-1 flex-col">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{t("createTitle")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("createLead")}
          </p>
        </div>

        <AccountForm
          action={signUp}
          fields={["email", "newPassword"]}
          submit={t("createSubmit")}
        />

        <div className="flex flex-col gap-3">
          <TextLink href="/conta/entrar">{t("toSignIn")}</TextLink>
          <TextLink href="/privacidade">{t("privacyLink")}</TextLink>
        </div>
      </Shell>
    </main>
  );
}
