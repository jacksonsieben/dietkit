import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Legend, Shell, TextLink } from "@/components/nd/kit";
import { resolveLocale } from "@/i18n/locale";
import { resetPassword } from "@/lib/auth/actions";

import { AccountForm } from "../AccountForm";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/conta/redefinir">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Account" });

  return { title: t("resetTitle"), description: t("resetLead") };
}

/**
 * Set a new password from the emailed link (#93).
 *
 * The token arrives in the query string, which is why this screen is dynamic
 * and why the token goes straight into a hidden field: it is a credential, and
 * a credential in a URL ends up in a browser history and in any referrer the
 * page happens to send. It is spent in one request and never stored.
 */
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  params,
  searchParams,
}: PageProps<"/[locale]/conta/redefinir">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Account");

  const token = (await searchParams).token;

  return (
    <main className="flex flex-1 flex-col">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{t("resetTitle")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("resetLead")}
          </p>
        </div>

        <AccountForm
          action={resetPassword}
          fields={["newPassword"]}
          submit={t("resetSubmit")}
          done={t("resetDone")}
          token={typeof token === "string" ? token : ""}
        />

        <TextLink href="/conta/entrar">{t("toSignIn")}</TextLink>
      </Shell>
    </main>
  );
}
