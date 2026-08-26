import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Legend, Rule, Shell, TextLink } from "@/components/nd/kit";
import { resolveLocale } from "@/i18n/locale";
import { accountsConfigured, auth } from "@/lib/auth/server";
import { LEGAL_CONTACT } from "@/lib/legal";

import { DeleteForm } from "./DeleteForm";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/conta/excluir">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Account" });

  return { title: t("deleteTitle"), description: t("deleteLead") };
}

/**
 * Deleting the account, for real (#97).
 *
 * The screen is mostly prose, and that is the design rather than an accident of
 * writing it. Three things have to be true before somebody presses the button:
 * they know exactly what leaves, they know what stays (everything on this
 * device — deleting an account is not deleting a diet), and they have been
 * offered the export first, because after this there is no copy anywhere we can
 * reach and none we could read if there were (GDPR art. 20, LGPD art. 18 V).
 *
 * The gentler option is on the same screen and named as such. Withdrawing
 * consent has to be as easy as giving it (GDPR art. 7(3)), and somebody who
 * only wants to stop syncing should not have to destroy their account to do it
 * — turning sync off deletes the server copy on the spot and keeps the account.
 *
 * Dynamic because it reads a cookie, like every other screen under `/conta`.
 */
export const dynamic = "force-dynamic";

async function currentAccount(): Promise<{ id: string } | undefined> {
  if (!accountsConfigured()) return undefined;

  try {
    const { data } = await auth().getSession();
    return data?.user ? { id: data.user.id } : undefined;
  } catch {
    return undefined;
  }
}

export default async function DeleteAccountPage({
  params,
}: PageProps<"/[locale]/conta/excluir">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("Account");
  const account = await currentAccount();

  return (
    <main className="flex flex-1 flex-col">
      <Shell>
        <div className="flex flex-col gap-3">
          <Legend as="h1">{t("deleteTitle")}</Legend>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t("deleteLead")}
          </p>
        </div>

        {account === undefined ? (
          <div className="flex flex-col gap-6">
            <p className="max-w-prose text-sm leading-relaxed">
              {t("deleteSignedOut")}
            </p>
            <TextLink href="/conta/entrar">{t("signInTitle")}</TextLink>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <p className="max-w-prose text-sm leading-relaxed">
                {t("deleteRemovesTitle")}
              </p>
              <ul className="flex max-w-prose list-disc flex-col gap-1 pl-5 text-sm leading-relaxed marker:text-nd-dim">
                <li>{t("deleteRemovesRows")}</li>
                <li>{t("deleteRemovesVault")}</li>
                <li>{t("deleteRemovesConsent")}</li>
                <li>{t("deleteRemovesAccount")}</li>
              </ul>
              <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
                {t("deleteKeeps")}
              </p>
              <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
                {t("deleteLag")}
              </p>
            </div>

            <Rule />

            <div className="flex flex-col gap-3">
              <p className="max-w-prose text-sm leading-relaxed">
                {t("deleteBackup")}
              </p>
              <TextLink href="/backup">{t("deleteBackupLink")}</TextLink>
            </div>

            <div className="flex flex-col gap-3">
              <p className="max-w-prose text-sm leading-relaxed">
                {t("deleteAlternative")}
              </p>
              <TextLink href="/conta/sincronizar">
                {t("deleteAlternativeLink")}
              </TextLink>
            </div>

            <Rule />

            <div className="flex flex-col gap-6">
              <p className="max-w-prose text-sm leading-relaxed">
                {t("deleteConfirm")}
              </p>
              <DeleteForm accountId={account.id} />
            </div>

            <div className="flex flex-col gap-3">
              <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
                {t("deleteContact", { name: LEGAL_CONTACT.controller })}
              </p>
              <TextLink href={`mailto:${LEGAL_CONTACT.email}`}>
                {LEGAL_CONTACT.email}
              </TextLink>
            </div>
          </>
        )}

        <TextLink href="/conta">{t("toAccount")}</TextLink>
      </Shell>
    </main>
  );
}
