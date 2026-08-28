import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { DismissedNotices } from "@/components/DismissedNotices";
import { Legend, Shell } from "@/components/nd/kit";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/mais">): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "More" });

  return { title: t("title"), description: t("lead") };
}

/**
 * Where everything that is not the daily loop went.
 *
 * The home screen used to be a flat list of every route in the app, which is
 * the arrangement you get when nothing has been decided about relative
 * importance. Deciding it produces two piles: the four things touched daily,
 * which are the tab bar, and everything else, consulted occasionally, which is
 * this page. Nothing was deleted — a route that exists still has a way in.
 *
 * Grouped by the question each answers rather than alphabetically, because the
 * user arriving here has a reason ("where do I change my height", "where did
 * these numbers come from") and the group headings are how that reason finds
 * its row. Each row carries a line of what is behind it, so the destination is
 * chosen before the tap rather than after it.
 */

interface Row {
  href: string;
  label:
    | "profile"
    | "energy"
    | "foodSearch"
    | "myFoods"
    | "groups"
    | "account"
    | "backup"
    | "import"
    | "sources"
    | "health"
    | "privacy"
    | "terms";
}

const GROUPS: readonly {
  heading: "targets" | "foods" | "data" | "legal";
  lead: "targetsLead" | "foodsLead" | "dataLead" | "legalLead";
  rows: readonly Row[];
}[] = [
  {
    heading: "targets",
    lead: "targetsLead",
    rows: [
      { href: "/perfil", label: "profile" },
      { href: "/energia", label: "energy" },
    ],
  },
  /*
   * The three food screens, which until now nothing linked to.
   *
   * They are reachable from inside the planner — the picker opens the search,
   * a row opens the groups — but only while you are editing a meal, so
   * "where do I add the whey I bought" had no answer anywhere in the app. A
   * route that exists needs a way in, and this is the page that says so.
   */
  {
    heading: "foods",
    lead: "foodsLead",
    rows: [
      { href: "/alimentos", label: "foodSearch" },
      { href: "/alimentos/meus", label: "myFoods" },
      { href: "/alimentos/grupos", label: "groups" },
    ],
  },
  {
    heading: "data",
    lead: "dataLead",
    rows: [
      { href: "/conta", label: "account" },
      { href: "/backup", label: "backup" },
      { href: "/importar", label: "import" },
    ],
  },
  {
    heading: "legal",
    lead: "legalLead",
    rows: [
      { href: "/fontes", label: "sources" },
      { href: "/saude", label: "health" },
      { href: "/privacidade", label: "privacy" },
      { href: "/termos", label: "terms" },
    ],
  },
];

export default async function MorePage({
  params,
}: PageProps<"/[locale]/mais">) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);

  const t = await getTranslations("More");

  return (
    <main className="flex flex-1 flex-col">
      <Shell>
        <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
          {t("lead")}
        </p>

        {GROUPS.map((group) => (
          <section key={group.heading} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Legend as="h2">{t(group.heading)}</Legend>
              <p className="max-w-prose text-sm leading-relaxed">
                {t(group.lead)}
              </p>
            </div>

            {/* Rules rather than cards: in a two-value world a card is a grey
                rectangle, and grey is the one thing this palette does not
                have. */}
            <ul className="flex flex-col border-t-2 border-nd-ink">
              {group.rows.map((row) => (
                <li key={row.href} className="border-b border-nd-unlit">
                  {/*
                    The whole row is the target, and hovering fills it with
                    `--nd-unlit`. It used to be `bg-nd-ink/5` — a twentieth of
                    the ink over the ground, which resolves to a grey this
                    palette has no word for, and which lands as a different
                    colour on white than it does on black. Unlit is a real
                    value in both themes, and both the ink title and the dim
                    hint stay readable on it, which a full ink fill would not
                    allow.
                  */}
                  <Link
                    href={row.href}
                    className="flex flex-col gap-1 px-2 py-4 hover:bg-nd-unlit"
                  >
                    <span className="text-base font-medium tracking-tight">
                      {t(row.label)}
                    </span>
                    <span className="text-sm text-nd-dim">
                      {t(`${row.label}Hint` as "profileHint")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/*
          Last, and usually absent. It is the undo for every "não mostrar de
          novo" in the app, which is what lets those buttons mean it — see
          `lib/notices.ts`. A client island on an otherwise static page,
          because what is hidden lives in IndexedDB.
        */}
        <DismissedNotices />
      </Shell>
    </main>
  );
}
