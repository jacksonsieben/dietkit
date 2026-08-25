import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Legend, Shell, TextLink } from "@/components/nd/kit";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";
import { signIn } from "@/lib/auth/actions";

import { AccountForm } from "../AccountForm";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/conta/entrar">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Account" });

  return { title: t("signInTitle"), description: t("signInLead") };
}

/**
 * Sign in (#93).
 *
 * Two questions, and neither is about the person asking them. There is no name
 * field, no date of birth and no "tell us about your goals" — the account holds
 * an email address and nothing else (docs/DECISIONS.md § D23), and a form is
 * where that promise is either kept or quietly broken.
 */
export default async function SignInPage({
  params,
}: PageProps<"/[locale]/conta/entrar">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Account");

  return (
    <main className="flex flex-1 flex-col">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{t("signInTitle")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("signInLead")}
          </p>
        </div>

        <AccountForm
          action={signIn}
          fields={["email", "password"]}
          submit={t("signInSubmit")}
        />

        <div className="flex flex-col gap-3">
          <TextLink href="/conta/recuperar">{t("toForgot")}</TextLink>
          <TextLink href="/conta/criar">{t("toCreate")}</TextLink>
        </div>
      </Shell>
    </main>
  );
}
