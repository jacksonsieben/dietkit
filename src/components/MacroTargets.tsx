"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { Field, UnitInput } from "@/components/Field";
import { DotText } from "@/components/dot/DotText";
import { ActionButton, Hairline, Legend } from "@/components/nd/kit";
import {
  ADJUSTMENT_UNITS,
  FAT_UNITS,
  adjustmentLimits,
  fatLimits,
  loadGoal,
  needsAdjustment,
  presetForm,
  saveGoal,
  toGoalForm,
  validateGoalForm,
  type GoalErrorCode,
  type GoalErrors,
  type GoalField,
  type GoalFormValues,
} from "@/lib/energy/goal";
import {
  ATWATER,
  FAT_FLOOR_PERCENT,
  MACRO_GOAL_LIMITS,
  planMacros,
  type MacroPlan,
} from "@/lib/energy/macros";
import type { EnergySummary } from "@/lib/energy/summary";
import { getRepository } from "@/lib/storage";
import {
  ENERGY_UNITS,
  GOAL_KINDS,
  type EnergyUnit,
  type GoalKind,
} from "@/lib/storage/types";

/**
 * TDEE turned into grams (#15).
 *
 * The form asks one question. Picking *Emagrecer*, *Manter peso* or
 * *Hipertrofia* fills in an adjustment, a protein coefficient and a fat share
 * all at once, and every number is folded away under "ajuste fino" — because
 * the first version of this screen opened by asking how many grams of fat per
 * kilogram of bodyweight you wanted, which is a question most people close the
 * tab on rather than answer.
 *
 * What is not folded away is the arithmetic below: the goal that produced the
 * target, the target, the grams, and what the grams add back up to. The last of
 * those is the part that usually gets hidden: three whole-gram numbers almost
 * never total exactly the kilocalorie figure printed above them, and an app
 * that quietly prints the target as the total is teaching its user that the two
 * are the same number when they are not. The difference is small, it is
 * rounding, and it is shown.
 *
 * A section of the energy screen rather than a page of its own, because a macro
 * split is meaningless without the expenditure it was split from.
 */

type Status = "loading" | "ready" | "saving" | "saved" | "loadFailed" | "saveFailed";

export function MacroTargets({ summary }: { summary: EnergySummary }) {
  const t = useTranslations("Macros");

  const [values, setValues] = useState<GoalFormValues | undefined>(undefined);
  const [errors, setErrors] = useState<GoalErrors>({});
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        // Falls back to `DEFAULT_MACRO_GOAL`, so the section opens on a usable
        // split rather than on empty boxes: someone who never chose still gets
        // grams, and the preset is visible enough to argue with.
        const goal = await loadGoal(getRepository());
        if (cancelled) return;

        setValues(toGoalForm(goal));
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("loadFailed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "loadFailed") {
    return <p className="text-sm text-nd-red-ink">{t("loadError")}</p>;
  }

  if (status === "loading" || !values) {
    return <p className="text-sm text-nd-dim">{t("loading")}</p>;
  }

  /** Drops the "salvo" note, so a reassurance never stands over changed numbers. */
  const touched = () => {
    setStatus((current) => (current === "saved" ? "ready" : current));
  };

  const update = (field: GoalField) => (value: string) => {
    setValues((current) => current && { ...current, [field]: value });
    // Clears this field's complaint as it is being addressed, rather than
    // leaving stale red text under a value the user has already fixed.
    setErrors((current) => {
      if (!(field in current)) return current;
      const { [field]: _cleared, ...rest } = current;
      return rest;
    });
    touched();
  };

  /**
   * Picking a goal replaces every number under it, including ones edited by
   * hand. That is the deal the presets offer — the goal *is* the answer — and a
   * *Hipertrofia* that kept the 500 kcal typed under *Emagrecer* would still be
   * a deficit, since nothing on screen would have visibly changed.
   */
  const chooseGoal = (raw: string) => {
    const kind = GOAL_KINDS.find((candidate) => candidate === raw);
    setValues(kind ? presetForm(kind) : (current) => current && { ...current, kind: raw });
    setErrors({});
    touched();
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = validateGoalForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      setStatus("ready");
      return;
    }

    setErrors({});
    setStatus("saving");

    try {
      await saveGoal(getRepository(), result.value);
      setStatus("saved");
    } catch {
      setStatus("saveFailed");
    }
  };

  // Recomputed on every keystroke rather than on save: the point of the section
  // is watching a number move the grams, and a plan that only appeared after
  // saving would make every adjustment a commitment.
  const plan = previewPlan(values, summary);
  const kind = currentKind(values.kind);
  const adjustmentUnit = currentUnit(values.adjustmentUnit, "kcal");
  const fatUnit = currentUnit(values.fatUnit, "percent");

  const messageFor = (code: GoalErrorCode) =>
    t(`errors.${code}`, errorParams(code, adjustmentUnit, fatUnit));

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Legend as="h2">{t("heading")}</Legend>
        <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
          {t("lead")}
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <Field
          label={t("goalLabel")}
          hint={t("goalHint")}
          error={errors.kind && messageFor(errors.kind)}
        >
          {(props) => (
            <select
              {...props}
              value={values.kind}
              onChange={(event) => chooseGoal(event.target.value)}
            >
              {GOAL_KINDS.map((option) => (
                <option key={option} value={option}>
                  {t(`goal.${option}`)}
                </option>
              ))}
            </select>
          )}
        </Field>

        {/* Folded, not removed. The numbers are the whole of any disagreement
            someone might have with the preset, so they stay one click away
            rather than behind a settings page — and inside the same form, so
            the button that saves the goal is the button that saves them. */}
        {/* Marked off by a rule with the fold hanging under it rather than by
            a bordered box: a card is the old world's shape, and a panel drawn
            round these fields would say they are a different kind of thing from
            the goal above, when they are the same question in more detail. */}
        <details className="border-t-2 border-nd-ink pt-4">
          <summary className="cursor-pointer text-xs font-medium tracking-[0.22em] uppercase">
            {t("advancedLabel")}
          </summary>

          <div className="mt-4 flex flex-col gap-6">
            <p className="max-w-prose text-xs leading-relaxed text-nd-dim">
              {t("advancedHint")}
            </p>

            {/* Hidden on maintenance: an adjustment box next to "manter peso"
                is a question with no answer, and a number left in it from a
                previous choice is ignored by the validator rather than quietly
                becoming a deficit nobody asked for. */}
            {needsAdjustment(kind) && (
              <Field
                label={t("adjustmentLabel")}
                hint={t(`adjustmentHint.${adjustmentUnit}`, adjustmentLimits(adjustmentUnit))}
                error={
                  (errors.adjustment ?? errors.adjustmentUnit) &&
                  messageFor((errors.adjustment ?? errors.adjustmentUnit)!)
                }
              >
                {(props) => (
                  <UnitInput
                    control={props}
                    value={values.adjustment}
                    onValueChange={update("adjustment")}
                    unit={values.adjustmentUnit}
                    onUnitChange={update("adjustmentUnit")}
                    units={ADJUSTMENT_UNITS}
                    unitLabel={t("unitLabel")}
                    unitName={(option) => t(`unit.${option}`)}
                  />
                )}
              </Field>
            )}

            <Field
              label={t("proteinLabel")}
              hint={t("coefficientHint", MACRO_GOAL_LIMITS.proteinGPerKg)}
              error={errors.proteinGPerKg && messageFor(errors.proteinGPerKg)}
            >
              {(props) => (
                <input
                  {...props}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={values.proteinGPerKg}
                  onChange={(event) => update("proteinGPerKg")(event.target.value)}
                />
              )}
            </Field>

            {/* A share of the energy rather than grams per kilogram, which is
                how the guidance behind the presets is written — and a fixed
                g/kg would quietly take a larger share of every deficit the user
                deepens, squeezing the carbohydrate that is left. */}
            <Field
              label={t("fatLabel")}
              hint={t(`fatHint.${fatUnit}`, fatLimits(fatUnit))}
              error={
                (errors.fat ?? errors.fatUnit) &&
                messageFor((errors.fat ?? errors.fatUnit)!)
              }
            >
              {(props) => (
                <UnitInput
                  control={props}
                  value={values.fat}
                  onValueChange={update("fat")}
                  unit={values.fatUnit}
                  onUnitChange={update("fatUnit")}
                  units={FAT_UNITS}
                  unitLabel={t("unitLabel")}
                  unitName={(option) => t(`unit.${option}`)}
                />
              )}
            </Field>

            <p className="max-w-prose text-xs leading-relaxed text-nd-dim">
              {t("carbNote")}
            </p>
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-4">
          <ActionButton type="submit" disabled={status === "saving"}>
            {status === "saving" ? t("saving") : t("save")}
          </ActionButton>

          <p aria-live="polite" className="text-sm">
            {status === "saved" ? (
              <span className="text-nd-dim">{t("saved")}</span>
            ) : null}
            {status === "saveFailed" ? (
              <span className="text-nd-red-ink">{t("saveError")}</span>
            ) : null}
          </p>
        </div>
      </form>

      {plan ? (
        <MacroPlanView plan={plan} weightKg={summary.weightKg} />
      ) : (
        <p className="text-sm text-nd-dim">{t("noPlan")}</p>
      )}
    </section>
  );
}

function MacroPlanView({ plan, weightKg }: { plan: MacroPlan; weightKg: number }) {
  const t = useTranslations("Macros");
  const format = useFormatter();

  const kcal = (value: number) => format.number(Math.round(value));

  // Each row prices its own grams with its own Atwater factor rather than
  // taking a share of the total, so the kcal column is something a reader can
  // check with a calculator and the 4/4/9 asymmetry is visible in the numbers.
  const rows = [
    {
      id: "protein",
      grams: plan.targets.proteinG,
      kcal: plan.targets.proteinG * ATWATER.proteinKcalPerG,
    },
    {
      id: "carb",
      grams: plan.targets.carbG,
      kcal: plan.targets.carbG * ATWATER.carbKcalPerG,
    },
    {
      id: "fat",
      grams: plan.targets.fatG,
      kcal: plan.targets.fatG * ATWATER.fatKcalPerG,
    },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        {/*
          The second panel on the screen, and deliberately the smaller one. The
          expenditure above it is what the body does; this is what the user
          decided to eat against it, and the fixed 16px pitch says which of the
          two the page is named for — the same arrangement /hoje uses for the
          target and the body weight. Both are dots because both are readings
          off the same instrument; setting one in running type would say they
          came off two.
        */}
        <Legend as="h3">{t("targetLabel")}</Legend>
        <DotText className="block" style={{ fontSize: "16px" }}>
          {String(Math.round(plan.targetKcal))}
        </DotText>
        <p className="text-sm tracking-[0.08em] uppercase">{t("energyUnit")}</p>
        {/* The adjustment written out, for the same reason the TDEE equation
            above it is: a target with no visible arithmetic is a number to take
            on faith. A percentage is shown as the kilocalories it came to,
            because that is the figure the grams were actually divided from.
            Maintenance gets a sentence instead of the sum, because "2.606 +0 =
            2.606" is arithmetic that shows nothing — and a `+0` reads like a
            number that failed to arrive rather than one that was never asked
            for. */}
        <p className="text-sm text-nd-dim" data-numeric>
          {plan.adjustmentKcal === 0
            ? t("targetSame")
            : t("targetEquation", {
                tdee: kcal(plan.totalDailyEnergyExpenditure),
                adjustment: format.number(Math.round(plan.adjustmentKcal), {
                  signDisplay: "always",
                }),
                target: kcal(plan.targetKcal),
              })}
        </p>
        <p className="text-xs text-nd-dim">
          {t("basis", { weight: format.number(weightKg) })}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-medium tracking-[0.22em] text-nd-dim uppercase">
              <th scope="col" className="pb-1 pr-3 text-left font-medium">
                {t("macroColumn")}
              </th>
              <th scope="col" className="pb-1 pr-3 text-left font-medium">
                {t("gramsColumn")}
              </th>
              <th scope="col" className="pb-1 pr-3 text-left font-medium">
                {t("kcalColumn")}
              </th>
              <th scope="col" className="pb-1 text-left font-medium">
                {t("shareColumn")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-nd-unlit">
                <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                  {t(`macro.${row.id}`)}
                </th>
                <td className="py-1.5 pr-3 font-medium" data-numeric>
                  {t("gramsValue", { grams: format.number(row.grams) })}
                </td>
                <td className="py-1.5 pr-3 text-nd-dim" data-numeric>
                  {kcal(row.kcal)}
                </td>
                <td className="py-1.5 text-nd-dim" data-numeric>
                  {/* Out of what the grams are worth, not out of the target —
                      so the column totals 100% instead of leaving the drift to
                      show up as a percentage that does not close. */}
                  {format.number(
                    plan.targets.kcal === 0 ? 0 : row.kcal / plan.targets.kcal,
                    { style: "percent", maximumFractionDigits: 0 },
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Only reachable by typing fat in kilocalories: as a percentage the form
          will not take anything under the floor. Said rather than refused —
          the arithmetic is sound and it is the diet that is the problem, and
          the user may know something about their case that we do not. */}
      {plan.fatBelowFloor && (
        <p className="max-w-prose text-sm leading-relaxed text-nd-red-ink">
          {t("fatFloor", {
            share: format.number(plan.fatShare, {
              style: "percent",
              maximumFractionDigits: 0,
            }),
            floor: FAT_FLOOR_PERCENT,
          })}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Hairline />
        <Legend as="h3">{t("reconcileHeading")}</Legend>
        {/* #15's last done-when, and the reason this block exists at all: whole
            grams do not add up to the target, and the honest thing is to print
            both numbers and their difference rather than print the target twice
            and hope nobody adds the grams up. */}
        <p className="text-sm" data-numeric>
          {t("reconcile", {
            sum: kcal(plan.targets.kcal),
            target: kcal(plan.targetKcal),
          })}
        </p>
        {/* One explanation or the other, never both. When protein and fat alone
            overshoot, the gap is the overshoot — printing the rounding note
            beside it would put "at most 8 kcal" under a difference of several
            hundred, which reads as a broken calculation rather than as a goal
            that cannot be met. */}
        {plan.carbShortfallKcal > 0 ? (
          <p className="max-w-prose text-sm leading-relaxed text-nd-red-ink">
            {t("shortfall", { excess: kcal(plan.carbShortfallKcal) })}
          </p>
        ) : (
          <p className="text-xs text-nd-dim">
            {Math.round(plan.driftKcal) === 0
              ? t("driftNone")
              : t("drift", {
                  drift: format.number(Math.round(plan.driftKcal), {
                    signDisplay: "always",
                  }),
                })}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The goal the select is showing, as a `GoalKind`.
 *
 * The form holds strings, and a value that is not a goal is a real possibility
 * — a restored snapshot, a hand-edited store. It falls back to maintenance for
 * the decision taken before validation runs (whether to show the adjustment
 * field at all); the submit path still refuses it with `invalidGoal` rather
 * than silently saving maintenance.
 */
function currentKind(raw: string): GoalKind {
  return GOAL_KINDS.find((candidate) => candidate === raw) ?? "maintain";
}

/** The same fallback, for the unit that decides which bounds a message quotes. */
function currentUnit(raw: string, fallback: EnergyUnit): EnergyUnit {
  return ENERGY_UNITS.find((candidate) => candidate === raw) ?? fallback;
}

/** Bounds interpolated into the messages for the codes that quote them. */
function errorParams(
  code: GoalErrorCode,
  adjustmentUnit: EnergyUnit,
  fatUnit: EnergyUnit,
): Record<string, number> | undefined {
  if (code === "kcalRange" || code === "percentRange") {
    return adjustmentLimits(adjustmentUnit);
  }
  if (code === "proteinRange") return MACRO_GOAL_LIMITS.proteinGPerKg;
  if (code === "fatPercentRange" || code === "fatKcalRange") return fatLimits(fatUnit);

  return undefined;
}

/**
 * The plan for what is currently typed, or `undefined` while it is not a goal
 * yet.
 *
 * `planMacros` throws on a target of zero or less, which is reachable inside
 * the form's own bounds — a 1500 kcal deficit on a small expenditure. That is a
 * real answer to give ("this is not a goal"), not a crash, so it is caught here
 * and the section says so instead.
 */
function previewPlan(
  values: GoalFormValues,
  summary: EnergySummary,
): MacroPlan | undefined {
  const validated = validateGoalForm(values);
  if (!validated.ok) return undefined;

  try {
    return planMacros({
      totalDailyEnergyExpenditure: summary.totalDailyEnergyExpenditure,
      weightKg: summary.weightKg,
      goal: validated.value,
    });
  } catch {
    return undefined;
  }
}
