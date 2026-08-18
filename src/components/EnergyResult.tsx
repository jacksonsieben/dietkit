"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { MacroTargets } from "@/components/MacroTargets";
import { Link } from "@/i18n/navigation";
import { todayIsoDate } from "@/lib/date";
import { loadEnergySummary, type EnergyState } from "@/lib/energy/summary";
import { getRepository } from "@/lib/storage";

/**
 * BMR, the factor, and what the two make together.
 *
 * The whole screen is built around one decision from #14: show the number
 * rather than argue about whose ladder is correct. So the multiplier appears
 * three times — in the picker on the profile, in the equation here, and as a
 * column in the table below — and the table prices every rung for this
 * particular body, which turns "another site said 2.800" from a contradiction
 * into a row someone can point at.
 *
 * A client component for the same reason `ProfileForm` is: the inputs live in
 * IndexedDB on the device and never reach a server, so there is nothing here a
 * server could have rendered.
 */

type Status = "loading" | "ready" | "failed";

export function EnergyResult() {
  const t = useTranslations("Energy");
  const profile = useTranslations("Profile");
  const format = useFormatter();

  const [state, setState] = useState<EnergyState | undefined>(undefined);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const loaded = await loadEnergySummary(getRepository(), todayIsoDate());
        if (cancelled) return;

        setState(loaded);
        setStatus("ready");
      } catch {
        // Includes the deliberate throw from a factor or a body measurement the
        // store should never have held: better a message pointing at the
        // profile than a plausible-looking number built from nonsense.
        if (!cancelled) setStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "loading") {
    return <p className="text-sm opacity-60">{t("loading")}</p>;
  }

  if (status === "failed" || !state) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm text-red-700 dark:text-red-400">{t("loadError")}</p>
        <ProfileLink label={t("editLink")} />
      </div>
    );
  }

  if (state.status === "missing") {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm opacity-80">
          {state.needs === "profile" ? t("missingProfile") : t("missingWeight")}
        </p>
        <ProfileLink label={t("missingLink")} />
      </div>
    );
  }

  const summary = state.summary;
  const kcal = (value: number) => format.number(Math.round(value));
  const factor = format.number(summary.activityFactor, {
    // Three digits because that is what the ladder holds. A factor printed as
    // "1,38" beside a result computed from 1,375 is a small lie that makes the
    // equation impossible to check by hand — which is the one thing this screen
    // is asking the reader to be able to do.
    minimumFractionDigits: 1,
    maximumFractionDigits: 3,
  });

  const levelName = summary.level
    ? profile(`activityLevelShort.${summary.level.id}`)
    : t("factorCustom");

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium opacity-70">{t("tdeeLabel")}</h2>
        <p className="font-mono text-4xl font-semibold tracking-tight">
          {t("kcalPerDay", { kcal: kcal(summary.totalDailyEnergyExpenditure) })}
        </p>
        {/* The arithmetic, spelled out. Someone comparing us with another
            calculator needs the two inputs, not just the total. */}
        <p className="font-mono text-sm opacity-70">
          {t("equation", {
            bmr: kcal(summary.basalMetabolicRate),
            factor,
            tdee: kcal(summary.totalDailyEnergyExpenditure),
          })}
        </p>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium opacity-70">{t("bmrLabel")}</h3>
          <p className="font-mono text-xl">
            {t("kcalPerDay", { kcal: kcal(summary.basalMetabolicRate) })}
          </p>
          <p className="text-xs opacity-60">
            {t("bmrNote", {
              weight: format.number(summary.weightKg),
              height: format.number(summary.heightCm),
              age: summary.ageYears,
            })}
          </p>
          <p className="text-xs opacity-60">
            {t("weighedOn", { date: formatDay(format, summary.weighedOn) })}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium opacity-70">{t("factorLabel")}</h3>
          <p className="font-mono text-xl">{factor}</p>
          <p className="text-xs opacity-60">{levelName}</p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium opacity-70">{t("ladderHeading")}</h2>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/15 text-left dark:border-white/20">
                <th className="py-2 pr-4 font-medium">{t("ladderLevelColumn")}</th>
                <th className="py-2 pr-4 font-medium">{t("ladderFactorColumn")}</th>
                <th className="py-2 font-medium">{t("ladderResultColumn")}</th>
              </tr>
            </thead>
            <tbody>
              {summary.ladder.map((row) => (
                <tr
                  key={row.level.id}
                  className="border-b border-black/5 last:border-0 dark:border-white/10"
                >
                  <td className="py-2 pr-4">
                    {profile(`activityLevelShort.${row.level.id}`)}
                    {row.current && (
                      <span className="ml-2 text-xs opacity-60">
                        {t("ladderCurrent")}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 font-mono">
                    {format.number(row.level.factor, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 3,
                    })}
                  </td>
                  <td className="py-2 font-mono">
                    {t("kcalPerDay", { kcal: kcal(row.tdee) })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium opacity-70">{t("disagreementHeading")}</h2>
        <p className="text-sm opacity-80">{t("disagreement")}</p>
      </section>

      {/* The expenditure is the input to the split, so the split lives here
          rather than on a page of its own: the grams below are only meaningful
          next to the number they were divided from, and a separate screen would
          let someone change the goal without seeing what it was applied to. */}
      <MacroTargets summary={summary} />

      <div className="flex flex-col gap-4">
        <ProfileLink label={t("editLink")} />
        <p className="text-xs opacity-60">
          {t("disclaimer")}{" "}
          <Link href="/saude" className="underline underline-offset-4">
            {t("disclaimerLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}

function ProfileLink({ label }: { label: string }) {
  return (
    <Link
      href="/perfil"
      className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
    >
      {label}
    </Link>
  );
}

function formatDay(format: ReturnType<typeof useFormatter>, day: string): string {
  // `timeZone: "UTC"` for the reason ProfileForm gives: the string is a calendar
  // day, `new Date` reads it as UTC midnight, and rendering that in São Paulo
  // prints the day before.
  return format.dateTime(new Date(`${day}T00:00:00Z`), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}
