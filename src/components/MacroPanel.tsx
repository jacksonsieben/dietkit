"use client";

import { useTranslations } from "next-intl";

import type { MacroLine, Reconciliation } from "@/lib/diet/reconcile";

/**
 * Meta against plano, macro by macro, in the open (#21).
 *
 * Always on screen — never behind a tab, a toggle or an "advanced" disclosure.
 * The predecessor showed a plan and a summary that were computed differently
 * and left the user to notice the gap; the fix for that is not a better summary
 * on a second screen, it is the difference being visible in the same glance as
 * the thing that caused it. So this panel sits under every meal and under the
 * day, and it is rendered even when there is nothing wrong: a screen that only
 * speaks when something is off is a screen whose silence carries no
 * information.
 *
 * The numbers are not computed here. They arrive from `reconcile.ts`, already
 * rounded and already subtracted, so the delta column is arithmetic the reader
 * can check against the two columns beside it (docs/MACRO-RECONCILIATION.md
 * § 5).
 *
 * On-target is meant to read as calm: no colour, no icon, nothing that asks for
 * attention. Off-target is amber and carries a word, not only a hue — colour
 * alone would say nothing to a screen reader and not much to the 8% of men who
 * do not see it.
 */
export function MacroPanel({
  heading,
  reconciliation,
}: {
  heading: string;
  reconciliation: Reconciliation;
}) {
  const t = useTranslations("Plan");

  return (
    <div className="flex flex-col gap-1">
      <div className="overflow-x-auto">
        <table className="w-full min-w-72 border-collapse text-left font-mono text-xs">
          <caption className="sr-only">{heading}</caption>
          <thead>
            <tr className="opacity-60">
              <th scope="col" className="py-1 pr-3 font-normal">
                {t("reconcile.macro")}
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-normal">
                {t("reconcile.target")}
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-normal">
                {t("reconcile.actual")}
              </th>
              <th scope="col" className="py-1 text-right font-normal">
                {t("reconcile.delta")}
              </th>
            </tr>
          </thead>
          <tbody>
            {reconciliation.lines.map((line) => (
              <Row key={line.macro} line={line} />
            ))}
          </tbody>
        </table>
      </div>

      {reconciliation.onTarget ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          {t("reconcile.met")}
        </p>
      ) : (
        <p className="text-xs text-amber-800 dark:text-amber-300">
          {t("reconcile.missed")}
        </p>
      )}
    </div>
  );
}

function Row({ line }: { line: MacroLine }) {
  const t = useTranslations("Plan");

  const energy = line.macro === "kcal";
  const value = (amount: number) =>
    energy ? t("reconcile.kcal", { value: amount }) : t("reconcile.grams", { value: amount });

  // The sign is written out rather than left to the number formatter: "0" for a
  // macro that landed exactly is the calm reading, and "+0" is not.
  const sign = line.delta > 0 ? "+" : line.delta < 0 ? "−" : "";

  return (
    <tr className="border-t border-black/5 dark:border-white/10">
      <th scope="row" className="py-1 pr-3 font-normal opacity-70">
        {t(`macroName.${line.macro}`)}
      </th>
      <td className="py-1 pr-3 text-right opacity-70">{value(line.target)}</td>
      <td className="py-1 pr-3 text-right">{value(line.actual)}</td>
      <td
        className={`py-1 text-right ${
          line.state === "on"
            ? "opacity-70"
            : "font-semibold text-amber-800 dark:text-amber-300"
        }`}
      >
        {energy
          ? t("reconcile.deltaKcal", { sign, value: Math.abs(line.delta) })
          : t("reconcile.deltaGrams", { sign, value: Math.abs(line.delta) })}
        {line.state === "on" ? null : (
          <span className="sr-only">
            {" "}
            {t(`reconcile.state.${line.state}`)}
          </span>
        )}
      </td>
    </tr>
  );
}
