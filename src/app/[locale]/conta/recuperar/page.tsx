import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Legend, Shell, TextLink } from "@/components/nd/kit";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";
import { requestPasswordReset } from "@/lib/auth/actions";

import { AccountForm } from "../AccountForm";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/conta/recuperar">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Account" });

  return { title: t("forgotTitle"), description: t("forgotLead") };
}

/**
 * Ask for a password reset link (#93).
 *
 * The answer is the same whether or not the address has an account, which is
 * why `forgotSent` is worded as a conditional. "No account with that email" is
 * a membership check anybody can run against a list, and membership of this
 * particular app says something about a person's health.
 *
 * Losing this password loses the account, not the data: everything is in
 * IndexedDB on the device and comes out through /backup (§ D1).
 */
export default async function ForgotPasswordPage({
  params,
}: PageProps<"/[locale]/conta/recuperar">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Account");

  return (
    <main className="flex flex-1 flex-col">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{t("forgotTitle")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("forgotLead")}
          </p>
        </div>

        <AccountForm
          action={requestPasswordReset}
          fields={["email"]}
          submit={t("forgotSubmit")}
          done={t("forgotSent")}
        />

        <TextLink href="/conta/entrar">{t("toSignIn")}</TextLink>
      </Shell>
    </main>
  );
}
