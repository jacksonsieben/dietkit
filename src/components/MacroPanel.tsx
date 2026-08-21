"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

import { GlyphBar } from "@/components/GlyphBar";
import { Legend } from "@/components/nd/kit";
import { Strip } from "@/components/nd/Strip";
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
 * rounded and already subtracted (docs/MACRO-RECONCILIATION.md § 5).
 *
 * ## The two densities
 *
 * This panel is rendered once for the day and once for every meal, so whatever
 * it costs is paid eight or nine times over on a full plan. Drawn identically
 * at both scales it would put thirty-odd seeking strips on one screen, and the
 * charter allows one authored animation precisely so that the animation still
 * means something when it runs.
 *
 * So the day gets the instrument — four full `GlyphBar`s, pulse included, the
 * same four the home screen draws, because two screens holding two opinions
 * about the same four numbers was the problem this redesign started from. Each
 * meal gets a still readout instead: one quiet strip for its energy, then the
 * four lines as type. The pulse belongs to the day, because the day is what you
 * are trying to close.
 *
 * Off-target carries red *and* a word — the sign in the reading, the state
 * spelled out for a screen reader — because colour alone says nothing to
 * someone who cannot see it. On-target is deliberately plain: no colour, no
 * icon, nothing that asks for attention. It used to be green, which contradicted
 * that sentence in the paragraph directly above it.
 */
export function MacroPanel({
  heading,
  reconciliation,
  density = "day",
}: {
  heading: string;
  reconciliation: Reconciliation;
  density?: "day" | "meal";
}) {
  const t = useTranslations("Plan");
  const headingId = useId();

  const verdict = reconciliation.onTarget
    ? t("reconcile.met")
    : t("reconcile.missed");
  const verdictClass = reconciliation.onTarget
    ? "text-sm"
    : "text-sm text-nd-red-ink";

  if (density === "meal") {
    return (
      <section className="flex flex-col gap-3">
        <Legend as="h3" id={headingId}>
          {heading}
        </Legend>

        {/* The meal's energy as light, thin enough to read as subordinate to
            the day's own strips. The `energia` row below states it in words. */}
        <Strip line={energyLine(reconciliation)} quiet height="h-2" />

        {/* Named by the legend rather than by a `<caption>` of its own: a
            caption here would put the same sentence into a screen reader
            twice, once as the heading and once as the table's name. */}
        <table
          aria-labelledby={headingId}
          className="w-full border-collapse text-left font-mono text-xs"
        >
          <tbody>
            {reconciliation.lines.map((line) => (
              <Row key={line.macro} line={line} />
            ))}
          </tbody>
        </table>

        <p className={verdictClass}>{verdict}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Legend as="h2">{heading}</Legend>
        <p className={verdictClass}>{verdict}</p>
      </div>

      {reconciliation.lines.map((line) => (
        <GlyphBar
          key={line.macro}
          label={t(`macroName.${line.macro}`)}
          reading={readingFor(t, line)}
          status={statusFor(t, line)}
          line={line}
        />
      ))}
    </section>
  );
}

/**
 * Energy is the last line by convention — it is a consequence of the three
 * above it, not a fourth dial (see `RECONCILE_MACROS`) — so it is found by name
 * rather than by index, and a reconciliation that somehow lacks it falls back
 * to the first line rather than crashing a whole meal.
 */
function energyLine(reconciliation: Reconciliation): MacroLine {
  return (
    reconciliation.lines.find((line) => line.macro === "kcal") ??
    reconciliation.lines[0]
  );
}

type Translate = ReturnType<typeof useTranslations<"Plan">>;

function readingFor(t: Translate, line: MacroLine): string {
  return line.macro === "kcal"
    ? t("reconcile.readingKcal", { actual: line.actual, target: line.target })
    : t("reconcile.readingGrams", { actual: line.actual, target: line.target });
}

function statusFor(t: Translate, line: MacroLine): string {
  const value = Math.abs(line.delta);
  const energy = line.macro === "kcal";

  if (line.state === "on") return t("reconcile.onLine");
  if (line.state === "over") {
    return energy
      ? t("reconcile.overKcal", { value })
      : t("reconcile.overGrams", { value });
  }
  return energy
    ? t("reconcile.shortKcal", { value })
    : t("reconcile.shortGrams", { value });
}

/**
 * One macro at meal scale: what it should be, what the plan makes it, and the
 * difference — with the sign written by hand, because "0" for a macro that
 * landed exactly is the calm reading and "+0" is not.
 */
function Row({ line }: { line: MacroLine }) {
  const t = useTranslations("Plan");

  const energy = line.macro === "kcal";
  const sign = line.delta > 0 ? "+" : line.delta < 0 ? "−" : "";
  const off = line.state !== "on";

  return (
    <tr>
      <th scope="row" className="py-0.5 pr-3 font-normal text-nd-dim">
        {t(`macroName.${line.macro}`)}
      </th>
      <td className="py-0.5 pr-3 text-right" data-numeric="">
        {readingFor(t, line)}
      </td>
      <td
        className={`py-0.5 text-right ${off ? "text-nd-red-ink" : "text-nd-dim"}`}
        data-numeric=""
      >
        {energy
          ? t("reconcile.deltaKcal", { sign, value: Math.abs(line.delta) })
          : t("reconcile.deltaGrams", { sign, value: Math.abs(line.delta) })}
        {off ? (
          <span className="sr-only"> {t(`reconcile.state.${line.state}`)}</span>
        ) : null}
      </td>
    </tr>
  );
}
