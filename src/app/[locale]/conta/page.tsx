import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  ActionButton,
  Legend,
  Rule,
  Shell,
  TextLink,
} from "@/components/nd/kit";
import { resolveLocale } from "@/i18n/locale";
import { signOut } from "@/lib/auth/actions";
import { accountsConfigured, auth } from "@/lib/auth/server";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/conta">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Account" });

  return { title: t("title"), description: t("lead") };
}

/**
 * The account, and the only screen that knows whether there is one (#93).
 *
 * Every other screen in this app is built to never ask. That is the constraint
 * that outranks the feature: an account exists to move data between devices,
 * and `src/account-optional.test.ts` fails the build if a screen about a weight
 * or a diet so much as imports the module that could tell it.
 *
 * Dynamic because it reads a cookie. There is nothing to prerender here anyway
 * — signed out it is two links, and signed in it is one address.
 */
export const dynamic = "force-dynamic";

async function currentEmail(): Promise<
  { email: string; verified: boolean } | undefined
> {
  if (!accountsConfigured()) return undefined;

  try {
    const { data } = await auth().getSession();
    const user = data?.user;

    return user
      ? { email: user.email, verified: user.emailVerified }
      : undefined;
  } catch {
    // An auth service that cannot be reached is the same as no account here:
    // nothing on this device depends on one.
    return undefined;
  }
}

export default async function AccountPage({
  params,
}: PageProps<"/[locale]/conta">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Account");
  const session = await currentEmail();

  return (
    <main className="flex flex-1 flex-col">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{t("title")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("lead")}
          </p>
        </div>

        <Rule />

        {!accountsConfigured() ? (
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("unavailable")}
          </p>
        ) : session ? (
          <div className="flex flex-col gap-6">
            <p className="max-w-prose text-sm leading-relaxed">
              {t("signedInAs", { email: session.email })}
            </p>

            {session.verified ? null : (
              <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
                {t("unverified")}
              </p>
            )}

            <TextLink href="/conta/sincronizar">{t("syncLink")}</TextLink>

            <form action={signOut}>
              <ActionButton type="submit">{t("signOut")}</ActionButton>
            </form>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <TextLink href="/conta/entrar">{t("signInTitle")}</TextLink>
            <TextLink href="/conta/criar">{t("createTitle")}</TextLink>
          </div>
        )}

        <Rule />

        <div className="flex flex-col gap-3">
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("nothingYet")}
          </p>
          <TextLink href="/privacidade">{t("privacyLink")}</TextLink>
        </div>
      </Shell>
    </main>
  );
}
