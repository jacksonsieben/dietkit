"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { DotText, displayFontSize } from "@/components/dot/DotText";
import { MacroTargets } from "@/components/MacroTargets";
import { Action, Hairline, Legend, Rule } from "@/components/nd/kit";
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
    return <p className="text-sm text-nd-dim">{t("loading")}</p>;
  }

  if (status === "failed" || !state) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm text-nd-red-ink">{t("loadError")}</p>
        <ProfileLink label={t("editLink")} />
      </div>
    );
  }

  if (state.status === "missing") {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="max-w-prose text-sm leading-relaxed">
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

  /*
   * The Display panel's string. Rounded, not formatted: `DotText` lights one
   * 5x7 cell per character and there is no group separator in the charter, so
   * a locale that writes "2.380" would ask it for a glyph it does not have.
   */
  const tdee = String(Math.round(summary.totalDailyEnergyExpenditure));

  const levelName = summary.level
    ? profile(`activityLevelShort.${summary.level.id}`)
    : t("factorCustom");

  return (
    <div className="flex flex-col gap-10">
      {/*
        The screen's one Display readout, and the reason the screen exists.
        /hoje puts the *target* in dots; this puts the *expenditure*, which is
        the number the target is derived from — same body, same instrument, so
        the same face at the same fitted pitch. Setting the source in running
        type and the result in dots would say they came off two machines.

        `String(...)` rather than the formatted string on purpose: below ten
        thousand there is no group separator to lose, and `kcal()` would hand
        the charter a full stop or a thin space to light depending on locale.
      */}
      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("tdeeLabel")}</Legend>
        <DotText
          className="block"
          style={{ fontSize: displayFontSize(tdee) }}
        >
          {tdee}
        </DotText>
        <p className="text-sm tracking-[0.08em] uppercase">{t("energyUnit")}</p>
        {/* The arithmetic, spelled out. Someone comparing us with another
            calculator needs the two inputs, not just the total. */}
        <p className="text-sm text-nd-dim" data-numeric>
          {t("equation", {
            bmr: kcal(summary.basalMetabolicRate),
            factor,
            tdee: kcal(summary.totalDailyEnergyExpenditure),
          })}
        </p>
      </section>

      <Rule />

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Legend as="h3">{t("bmrLabel")}</Legend>
          <p className="text-lg font-semibold tracking-[-0.025em]" data-numeric>
            {t("kcalPerDay", { kcal: kcal(summary.basalMetabolicRate) })}
          </p>
          <p className="text-xs leading-relaxed text-nd-dim">
            {t("bmrNote", {
              weight: format.number(summary.weightKg),
              height: format.number(summary.heightCm),
              age: summary.ageYears,
            })}
          </p>
          <p className="text-xs text-nd-dim">
            {t("weighedOn", { date: formatDay(format, summary.weighedOn) })}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <Legend as="h3">{t("factorLabel")}</Legend>
          <p className="text-lg font-semibold tracking-[-0.025em]" data-numeric>
            {factor}
          </p>
          <p className="text-xs text-nd-dim">{levelName}</p>
        </div>
      </section>

      <Rule />

      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("ladderHeading")}</Legend>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-medium tracking-[0.22em] text-nd-dim uppercase">
                <th scope="col" className="pb-1 pr-3 text-left font-medium">
                  {t("ladderLevelColumn")}
                </th>
                <th scope="col" className="pb-1 pr-3 text-left font-medium">
                  {t("ladderFactorColumn")}
                </th>
                {/* The unit is in the header, not in the cells. Repeated
                    down eight rows it is eight copies of a constant wrapping
                    onto a second line, and what the reader came for — the
                    distance between the degraus — is what gets squeezed. */}
                <th scope="col" className="pb-1 text-left font-medium">
                  {t("ladderResultColumn")}
                </th>
              </tr>
            </thead>
            <tbody>
              {summary.ladder.map((row) => (
                <tr key={row.level.id} className="border-t border-nd-unlit">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                    {profile(`activityLevelShort.${row.level.id}`)}
                    {row.current && (
                      <span className="mt-0.5 block text-xs tracking-[0.14em] text-nd-dim uppercase">
                        {t("ladderCurrent")}
                      </span>
                    )}
                  </th>
                  <td className="py-1.5 pr-3 text-nd-dim" data-numeric>
                    {format.number(row.level.factor, {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 3,
                    })}
                  </td>
                  {/* The reader's own row set in ink and the rest dim: the
                      point of the table is the distance between them, and a
                      column of eight identical weights makes that a search
                      rather than a glance. */}
                  <td
                    className={row.current ? "py-1.5 font-medium" : "py-1.5"}
                    data-numeric
                  >
                    {kcal(row.tdee)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Hairline />

        <p className="max-w-prose text-xs leading-relaxed text-nd-dim">
          <span className="font-medium text-nd-ink">
            {t("disagreementHeading")}
          </span>{" "}
          {t("disagreement")}
        </p>
      </section>

      <Rule />

      {/* The expenditure is the input to the split, so the split lives here
          rather than on a page of its own: the grams below are only meaningful
          next to the number they were divided from, and a separate screen would
          let someone change the goal without seeing what it was applied to. */}
      <MacroTargets summary={summary} />

      <Rule />

      <div className="flex flex-col gap-4">
        <ProfileLink label={t("editLink")} />
        <p className="max-w-prose text-xs leading-relaxed text-nd-dim">
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
  return <Action href="/perfil">{label}</Action>;
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
