import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Legend, Shell, TextLink } from "@/components/nd/kit";
import { resolveLocale } from "@/i18n/locale";
import { accountsConfigured, auth } from "@/lib/auth/server";

import { SyncPanel } from "./SyncPanel";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/conta/sincronizar">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Sync" });

  return { title: t("title"), description: t("lead") };
}

/**
 * Turning sync on, and off (#96).
 *
 * Dynamic for the same reason `/conta` is: it reads a cookie, and there is
 * nothing here to prerender — signed out it is one sentence and a link.
 *
 * The server's whole job is the account id. It comes from the session cookie
 * rather than from anything the browser could name, which is the same rule the
 * two sync endpoints follow: a device asks for "my rows", never for an
 * account's, so there is no field to put somebody else's id in.
 */
export const dynamic = "force-dynamic";

async function currentAccount(): Promise<{ id: string } | undefined> {
  if (!accountsConfigured()) return undefined;

  try {
    const { data } = await auth().getSession();
    return data?.user ? { id: data.user.id } : undefined;
  } catch {
    // Unreachable accounts service. Nothing on this device depends on one, and
    // the screen below says so rather than showing a broken panel.
    return undefined;
  }
}

export default async function SyncPage({
  params,
}: PageProps<"/[locale]/conta/sincronizar">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Sync");
  const account = await currentAccount();

  return (
    <main className="flex flex-1 flex-col">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{t("title")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("lead")}
          </p>
        </div>

        {account === undefined ? (
          <div className="flex flex-col gap-6">
            <p className="max-w-prose text-sm leading-relaxed">
              {t("signedOut")}
            </p>
            <TextLink href="/conta/entrar">{t("toSignIn")}</TextLink>
          </div>
        ) : (
          <SyncPanel accountId={account.id} />
        )}

        <TextLink href="/conta">{t("toAccount")}</TextLink>
      </Shell>
    </main>
  );
}
