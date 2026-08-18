"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { Field } from "@/components/Field";
import {
  GOAL_MODES,
  loadGoal,
  magnitudeLimits,
  needsMagnitude,
  saveGoal,
  toGoalForm,
  validateGoalForm,
  type GoalErrorCode,
  type GoalErrors,
  type GoalField,
  type GoalFormValues,
  type GoalMode,
} from "@/lib/energy/goal";
import {
  ATWATER,
  MACRO_GOAL_LIMITS,
  planMacros,
  type MacroPlan,
} from "@/lib/energy/macros";
import type { EnergySummary } from "@/lib/energy/summary";
import { getRepository } from "@/lib/storage";

/**
 * TDEE turned into grams (#15).
 *
 * The arithmetic is deliberately all on screen at once — the goal that produced
 * the target, the target, the grams, and what the grams add back up to. The
 * last of those is the part that usually gets hidden: three whole-gram numbers
 * almost never total exactly the kilocalorie figure printed above them, and an
 * app that quietly prints the target as the total is teaching its user that the
 * two are the same number when they are not. The difference is small, it is
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
        // grams, and the defaults are visible enough to argue with.
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
    return <p className="text-sm text-red-700 dark:text-red-400">{t("loadError")}</p>;
  }

  if (status === "loading" || !values) {
    return <p className="text-sm opacity-60">{t("loading")}</p>;
  }

  const update = (field: GoalField) => (value: string) => {
    setValues((current) => current && { ...current, [field]: value });
    // Clears this field's complaint as it is being addressed, rather than
    // leaving stale red text under a value the user has already fixed.
    setErrors((current) => {
      if (!(field in current)) return current;
      const { [field]: _cleared, ...rest } = current;
      return rest;
    });
    setStatus((current) => (current === "saved" ? "ready" : current));
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
  // is watching a coefficient move the grams, and a plan that only appeared
  // after saving would make every adjustment a commitment.
  const plan = previewPlan(values, summary);
  const mode = currentMode(values.mode);

  const messageFor = (code: GoalErrorCode) => t(`errors.${code}`, errorParams(code, mode));

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium opacity-70">{t("heading")}</h2>
        <p className="text-sm opacity-80">{t("lead")}</p>
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <Field
          label={t("modeLabel")}
          hint={t("modeHint")}
          error={errors.mode && messageFor(errors.mode)}
        >
          {(props) => (
            <select
              {...props}
              value={values.mode}
              onChange={(event) => update("mode")(event.target.value)}
            >
              {GOAL_MODES.map((option) => (
                <option key={option} value={option}>
                  {t(`mode.${option}`)}
                </option>
              ))}
            </select>
          )}
        </Field>

        {/* Hidden on maintenance: a magnitude box next to "manutenção" is a
            question with no answer, and a number left in it from a previous
            choice is ignored by the validator rather than quietly becoming a
            deficit nobody asked for. */}
        {needsMagnitude(mode) && (
          <Field
            label={isPercent(mode) ? t("magnitudePercentLabel") : t("magnitudeKcalLabel")}
            hint={t("magnitudeHint", magnitudeLimits(mode))}
            error={errors.magnitude && messageFor(errors.magnitude)}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={values.magnitude}
                onChange={(event) => update("magnitude")(event.target.value)}
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

        <Field
          label={t("fatLabel")}
          hint={t("coefficientHint", MACRO_GOAL_LIMITS.fatGPerKg)}
          error={errors.fatGPerKg && messageFor(errors.fatGPerKg)}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={values.fatGPerKg}
              onChange={(event) => update("fatGPerKg")(event.target.value)}
            />
          )}
        </Field>

        <p className="text-xs opacity-60">{t("carbNote")}</p>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={status === "saving"}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {status === "saving" ? t("saving") : t("save")}
          </button>

          <p aria-live="polite" className="text-sm">
            {status === "saved" ? <span className="opacity-70">{t("saved")}</span> : null}
            {status === "saveFailed" ? (
              <span className="text-red-700 dark:text-red-400">{t("saveError")}</span>
            ) : null}
          </p>
        </div>
      </form>

      {plan ? (
        <MacroPlanView plan={plan} weightKg={summary.weightKg} />
      ) : (
        <p className="text-sm opacity-70">{t("noPlan")}</p>
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
        <h3 className="text-sm font-medium opacity-70">{t("targetLabel")}</h3>
        <p className="font-mono text-3xl font-semibold tracking-tight">
          {t("kcalPerDay", { kcal: kcal(plan.targetKcal) })}
        </p>
        {/* The adjustment written out, for the same reason the TDEE equation
            above it is: a target with no visible arithmetic is a number to take
            on faith. A percentage is shown as the kilocalories it came to,
            because that is the figure the grams were actually divided from. */}
        <p className="font-mono text-sm opacity-70">
          {t("targetEquation", {
            tdee: kcal(plan.totalDailyEnergyExpenditure),
            adjustment: format.number(Math.round(plan.adjustmentKcal), {
              signDisplay: "always",
            }),
            target: kcal(plan.targetKcal),
          })}
        </p>
        <p className="text-xs opacity-60">
          {t("basis", { weight: format.number(weightKg) })}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/15 text-left dark:border-white/20">
              <th className="py-2 pr-4 font-medium">{t("macroColumn")}</th>
              <th className="py-2 pr-4 font-medium">{t("gramsColumn")}</th>
              <th className="py-2 pr-4 font-medium">{t("kcalColumn")}</th>
              <th className="py-2 font-medium">{t("shareColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-black/5 last:border-0 dark:border-white/10"
              >
                <td className="py-2 pr-4">{t(`macro.${row.id}`)}</td>
                <td className="py-2 pr-4 font-mono">
                  {t("gramsValue", { grams: format.number(row.grams) })}
                </td>
                <td className="py-2 pr-4 font-mono">{kcal(row.kcal)}</td>
                <td className="py-2 font-mono">
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

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium opacity-70">{t("reconcileHeading")}</h3>
        {/* #15's last done-when, and the reason this block exists at all: whole
            grams do not add up to the target, and the honest thing is to print
            both numbers and their difference rather than print the target twice
            and hope nobody adds the grams up. */}
        <p className="font-mono text-sm">
          {t("reconcile", {
            sum: kcal(plan.targets.kcal),
            target: kcal(plan.targetKcal),
          })}
        </p>
        {/* One explanation or the other, never both. When the coefficients
            alone overshoot, the gap is the overshoot — printing the rounding
            note beside it would put "at most 8 kcal" under a difference of
            several hundred, which reads as a broken calculation rather than as
            a goal that cannot be met. */}
        {plan.carbShortfallKcal > 0 ? (
          <p className="text-sm text-red-700 dark:text-red-400">
            {t("shortfall", { excess: kcal(plan.carbShortfallKcal) })}
          </p>
        ) : (
          <p className="text-xs opacity-60">
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
 * The mode the select is showing, as a `GoalMode`.
 *
 * The form holds strings, and a value that is not a mode is a real possibility
 * — a restored snapshot, a hand-edited store. It falls back to maintenance for
 * the two decisions taken before validation runs (whether to show the magnitude
 * field, and which units the range message quotes); the submit path still
 * refuses it with `invalidMode` rather than silently saving maintenance.
 */
function currentMode(raw: string): GoalMode {
  return GOAL_MODES.find((candidate) => candidate === raw) ?? "maintain";
}

function isPercent(mode: GoalMode): boolean {
  return mode === "deficitPercent" || mode === "surplusPercent";
}

/** Bounds interpolated into the messages for the codes that quote them. */
function errorParams(
  code: GoalErrorCode,
  mode: GoalMode,
): Record<string, number> | undefined {
  if (code === "kcalRange" || code === "percentRange") return magnitudeLimits(mode);
  if (code === "proteinRange") return MACRO_GOAL_LIMITS.proteinGPerKg;
  if (code === "fatRange") return MACRO_GOAL_LIMITS.fatGPerKg;

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
