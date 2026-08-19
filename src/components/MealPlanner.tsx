"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { CONTROL_CLASS } from "@/components/Field";
import { Link } from "@/i18n/navigation";
import { todayIsoDate } from "@/lib/date";
import { distributeTargets, sharePercents } from "@/lib/diet/distribute";
import {
  MEAL_LIMITS,
  addMeal,
  canAddMeal,
  canRemoveMeal,
  checkMealName,
  checkSharePercent,
  evenShares,
  mealsFromNames,
  moveMeal,
  removeMeal,
  renameMeal,
  setShare,
  type MealErrorCode,
} from "@/lib/diet/meals";
import { loadPlan, newPlan, savePlan } from "@/lib/diet/plan";
import { loadGoal } from "@/lib/energy/goal";
import { planMacros } from "@/lib/energy/macros";
import { loadEnergySummary } from "@/lib/energy/summary";
import { getRepository } from "@/lib/storage";
import type { Diet, Id, MacroSet, Meal } from "@/lib/storage/types";

/**
 * The day as a list the user writes (#18).
 *
 * The predecessor had four meals compiled into it and split the targets evenly
 * between them. This screen is the argument against both halves of that: the
 * list starts at three because a day has to start somewhere, and every row can
 * be renamed, reordered, deleted or resized. The percentage box is the part
 * that matters most — a plan where lunch is a third of the day and the
 * mid-afternoon snack is a twentieth is the ordinary case, not an advanced one.
 *
 * Whatever is typed, the day still closes: changing one share redistributes the
 * others (see `setShare`) and the grams are apportioned rather than rounded
 * (see `distributeTargets`), so the table under the target always adds back up
 * to it. That is the whole reason those two live in `lib` with tests instead of
 * here.
 *
 * A client component for the reason every personal-data screen here is one: the
 * profile, the goal and the plan are all in IndexedDB on the device, and there
 * is nothing a server could have rendered.
 */

type Status =
  "loading" | "ready" | "saving" | "saved" | "loadFailed" | "saveFailed";

interface Loaded {
  plan: Diet;
  /** Recomputed from the profile on every visit — see `savePlan`'s note. */
  targets: MacroSet;
  weightKg: number;
}

type MealErrors = Record<Id, { name?: MealErrorCode; share?: MealErrorCode }>;

export function MealPlanner() {
  const t = useTranslations("Plan");
  const format = useFormatter();

  const [loaded, setLoaded] = useState<Loaded | undefined>(undefined);
  const [missing, setMissing] = useState<"profile" | "weight" | undefined>(
    undefined,
  );
  const [errors, setErrors] = useState<MealErrors>({});
  const [status, setStatus] = useState<Status>("loading");
  const [dirty, setDirty] = useState(false);

  /**
   * The share box being typed in, and the characters in it.
   *
   * Held apart from the plan because the two disagree on purpose while someone
   * types: "3" on the way to "30" is a valid 3%, and applying it would rewrite
   * every other row's percentage between two keystrokes. So the edited box
   * shows what was typed and the rest of the table shows the plan, and on blur
   * the box goes back to reading from the plan like the others.
   */
  const [typing, setTyping] = useState<{ id: Id; text: string } | undefined>(
    undefined,
  );

  // A ref rather than an effect dependency: these are read once, to name the
  // meals of a plan that does not exist yet, and re-running the load because a
  // translation function was re-created would throw away the user's edits.
  const defaultNames = useRef([
    t("defaultMeal.breakfast"),
    t("defaultMeal.lunch"),
    t("defaultMeal.dinner"),
  ]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const repository = getRepository();
        const [energy, goal, stored] = await Promise.all([
          loadEnergySummary(repository, todayIsoDate()),
          loadGoal(repository),
          loadPlan(repository),
        ]);
        if (cancelled) return;

        if (energy.status === "missing") {
          setMissing(energy.needs);
          setStatus("ready");
          return;
        }

        const macros = planMacros({
          totalDailyEnergyExpenditure:
            energy.summary.totalDailyEnergyExpenditure,
          weightKg: energy.summary.weightKg,
          goal,
        });

        setLoaded({
          targets: macros.targets,
          weightKg: energy.summary.weightKg,
          // `newPlan` builds without writing: someone who opens this screen and
          // leaves should not find a diet in their store tomorrow.
          plan:
            stored ??
            newPlan(
              { id: crypto.randomUUID(), name: t("planName") },
              mealsFromNames(
                defaultNames.current.map((name) => ({
                  id: crypto.randomUUID(),
                  name,
                })),
              ),
              macros.targets,
              energy.summary.weightKg,
              new Date().toISOString(),
            ),
        });
        setStatus("ready");
      } catch {
        // Includes the deliberate throws from `planMacros` on a body the store
        // should never have held — better this than grams built from nonsense.
        if (!cancelled) setStatus("loadFailed");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see `defaultNames`
  }, []);

  if (status === "loading") {
    return <p className="text-sm opacity-60">{t("loading")}</p>;
  }

  if (status === "loadFailed") {
    return (
      <p className="text-sm text-red-700 dark:text-red-400">{t("loadError")}</p>
    );
  }

  if (missing) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm opacity-80">
          {missing === "profile" ? t("missingProfile") : t("missingWeight")}
        </p>
        <Link
          href="/perfil"
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          {t("missingLink")}
        </Link>
      </div>
    );
  }

  if (!loaded) {
    return (
      <p className="text-sm text-red-700 dark:text-red-400">{t("loadError")}</p>
    );
  }

  const meals = loaded.plan.meals;
  const rows = distributeTargets(loaded.targets, meals);
  const percents = sharePercents(meals);

  /** Drops the "salvo" note, so a reassurance never stands over changed numbers. */
  const apply = (next: Meal[]) => {
    setLoaded(
      (current) =>
        current && { ...current, plan: { ...current.plan, meals: next } },
    );
    setDirty(true);
    setStatus((current) => (current === "saved" ? "ready" : current));
  };

  const clearError = (id: Id, field: "name" | "share") => {
    setErrors((current) => {
      if (!current[id]?.[field]) return current;
      const { [field]: _cleared, ...rest } = current[id];
      return { ...current, [id]: rest };
    });
  };

  const onRename = (id: Id, name: string) => {
    apply(renameMeal(meals, id, name));
    clearError(id, "name");
  };

  const onShare = (id: Id, text: string) => {
    setTyping({ id, text });

    const checked = checkSharePercent(text);
    if ("error" in checked) {
      setErrors((current) => ({
        ...current,
        [id]: { ...current[id], share: checked.error },
      }));
      return;
    }

    clearError(id, "share");
    apply(setShare(meals, id, checked.value));
  };

  const onAdd = () => {
    apply(
      addMeal(meals, {
        id: crypto.randomUUID(),
        name: t("newMealName", { position: meals.length + 1 }),
        share: 0,
        items: [],
      }),
    );
  };

  const onRemove = (id: Id) => {
    setTyping(undefined);
    apply(removeMeal(meals, id));
    setErrors((current) => {
      const { [id]: _gone, ...rest } = current;
      return rest;
    });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // The whole form in one pass, as everywhere else here: making someone
    // discover the next bad row only after fixing the last one is a worse form.
    const found: MealErrors = {};
    for (const meal of meals) {
      const checked = checkMealName(meal.name);
      if ("error" in checked)
        found[meal.id] = { ...found[meal.id], name: checked.error };
      if (errors[meal.id]?.share) {
        found[meal.id] = { ...found[meal.id], share: errors[meal.id].share };
      }
    }

    if (Object.keys(found).length > 0) {
      setErrors(found);
      setStatus("ready");
      return;
    }

    setErrors({});
    setStatus("saving");

    try {
      const saved = await savePlan(
        getRepository(),
        {
          ...loaded.plan,
          meals: meals.map((meal) => ({ ...meal, name: meal.name.trim() })),
          targets: loaded.targets,
          basedOnWeightKg: loaded.weightKg,
        },
        new Date().toISOString(),
      );

      setLoaded((current) => current && { ...current, plan: saved });
      setDirty(false);
      setStatus("saved");
    } catch {
      setStatus("saveFailed");
    }
  };

  const grams = (value: number) => format.number(value);
  const kcal = (value: number) => format.number(Math.round(value));

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium opacity-70">{t("targetLabel")}</h2>
        <p className="font-mono text-3xl font-semibold tracking-tight">
          {t("kcalPerDay", { kcal: kcal(loaded.targets.kcal) })}
        </p>
        <p className="font-mono text-sm opacity-70">
          {t("targetMacros", {
            protein: loaded.targets.proteinG,
            carb: loaded.targets.carbG,
            fat: loaded.targets.fatG,
          })}
        </p>
        <Link href="/energia" className="text-sm underline underline-offset-4">
          {t("energyLink")}
        </Link>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">
            {t("mealsHeading")}
          </h2>
          <p className="text-xs opacity-60">
            {t("mealCount", { count: meals.length })}
          </p>
        </div>

        <p className="text-xs opacity-60">{t("shareNote")}</p>

        <ul className="flex flex-col gap-3">
          {meals.map((meal, index) => (
            <MealRow
              key={meal.id}
              meal={meal}
              position={index + 1}
              percent={percents[index]}
              targets={rows[index].targets}
              first={index === 0}
              last={index === meals.length - 1}
              removable={canRemoveMeal(meals)}
              errors={errors[meal.id] ?? {}}
              shareText={typing?.id === meal.id ? typing.text : undefined}
              onRename={(name) => onRename(meal.id, name)}
              onShare={(text) => onShare(meal.id, text)}
              onBlurShare={() => setTyping(undefined)}
              onMove={(offset) => apply(moveMeal(meals, meal.id, offset))}
              onRemove={() => onRemove(meal.id)}
            />
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onAdd}
            disabled={!canAddMeal(meals)}
            className="rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/20 disabled:opacity-40"
          >
            {t("add")}
          </button>

          <button
            type="button"
            onClick={() => apply(evenShares(meals))}
            className="rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
          >
            {t("even")}
          </button>

          {canAddMeal(meals) ? null : (
            <p className="text-xs opacity-60">
              {t("addLimit", { max: MEAL_LIMITS.count.max })}
            </p>
          )}
        </div>
      </section>

      {/* The check, printed. Every rule in `lib/diet` exists so that this line
          equals the target above it, and putting the sum on screen is what
          makes that claim falsifiable by the person using the app. */}
      <section className="flex flex-col gap-1 border-t border-black/10 pt-4 dark:border-white/15">
        <h2 className="text-sm font-medium opacity-70">{t("totalLabel")}</h2>
        <p className="font-mono text-sm">
          {t("macros", {
            protein: grams(sum(rows, "proteinG")),
            carb: grams(sum(rows, "carbG")),
            fat: grams(sum(rows, "fatG")),
          })}
          {" · "}
          {t("kcal", { kcal: sum(rows, "kcal") })}
        </p>
        <p className="text-xs opacity-60">{t("roundingNote")}</p>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={status === "saving"}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {status === "saving" ? t("saving") : t("save")}
        </button>

        <p aria-live="polite" className="text-sm">
          {status === "saved" ? (
            <span className="opacity-70">{t("saved")}</span>
          ) : null}
          {status === "saveFailed" ? (
            <span className="text-red-700 dark:text-red-400">
              {t("saveError")}
            </span>
          ) : null}
          {dirty && status !== "saveFailed" ? (
            <span className="opacity-60">{t("unsaved")}</span>
          ) : null}
        </p>
      </div>

      <p className="text-xs opacity-60">{t("itemsNote")}</p>
    </form>
  );
}

function sum(rows: { targets: MacroSet }[], macro: keyof MacroSet): number {
  return rows.reduce((total, row) => total + row.targets[macro], 0);
}

/**
 * One meal: what it is called, how much of the day it carries, and what that
 * comes to in grams.
 *
 * The grams sit next to the percentage rather than in a table of their own,
 * because the percentage is the control and the grams are the consequence —
 * reading one under the other is how someone decides that 15% of breakfast is
 * more protein than they will actually eat before work.
 */
function MealRow({
  meal,
  position,
  percent,
  targets,
  first,
  last,
  removable,
  errors,
  shareText,
  onRename,
  onShare,
  onBlurShare,
  onMove,
  onRemove,
}: {
  meal: Meal;
  position: number;
  percent: number;
  targets: MacroSet;
  first: boolean;
  last: boolean;
  removable: boolean;
  errors: { name?: MealErrorCode; share?: MealErrorCode };
  shareText?: string;
  onRename: (name: string) => void;
  onShare: (text: string) => void;
  onBlurShare: () => void;
  onMove: (offset: number) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("Plan");
  const format = useFormatter();

  const nameId = `${meal.id}-name`;
  const shareId = `${meal.id}-share`;
  const errorId = `${meal.id}-error`;
  const error = errors.name ?? errors.share;

  const message = (code: MealErrorCode) =>
    t(`errors.${code}`, {
      max: MEAL_LIMITS.nameLength.max,
      min: MEAL_LIMITS.sharePercent.min,
    });

  return (
    <li className="flex flex-col gap-2 rounded-md border border-black/10 px-4 py-3 dark:border-white/15">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-40 flex-1 flex-col gap-1">
          <label htmlFor={nameId} className="sr-only">
            {t("nameLabel", { position })}
          </label>
          <input
            id={nameId}
            type="text"
            autoComplete="off"
            placeholder={t("namePlaceholder")}
            value={meal.name}
            onChange={(event) => onRename(event.target.value)}
            aria-invalid={errors.name !== undefined}
            aria-describedby={error ? errorId : undefined}
            className={CONTROL_CLASS}
          />
        </div>

        <div className="flex w-28 flex-col gap-1">
          <label htmlFor={shareId} className="sr-only">
            {t("shareLabel", { position })}
          </label>
          {/* `inputMode="decimal"` and a text type, as on every number in this
              app: a `number` input hides what was typed behind the browser's
              own parsing, and this one has to accept a comma. */}
          <input
            id={shareId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={shareText ?? String(percent)}
            onChange={(event) => onShare(event.target.value)}
            onBlur={onBlurShare}
            aria-invalid={errors.share !== undefined}
            aria-describedby={error ? errorId : undefined}
            className={`${CONTROL_CLASS} text-right font-mono`}
          />
        </div>
      </div>

      {error ? (
        <p id={errorId} className="text-xs text-red-700 dark:text-red-400">
          {message(error)}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs opacity-70">
          {t("macros", {
            protein: format.number(targets.proteinG),
            carb: format.number(targets.carbG),
            fat: format.number(targets.fatG),
          })}
          {" · "}
          {t("kcal", { kcal: targets.kcal })}
        </p>

        <div className="flex items-center gap-2">
          <RowButton
            label={t("moveUp")}
            disabled={first}
            onClick={() => onMove(-1)}
          />
          <RowButton
            label={t("moveDown")}
            disabled={last}
            onClick={() => onMove(1)}
          />
          <button
            type="button"
            onClick={onRemove}
            disabled={!removable}
            title={removable ? undefined : t("removeLimit")}
            className="rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20 disabled:opacity-40"
          >
            {t("remove")}
          </button>
        </div>
      </div>
    </li>
  );
}

function RowButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-black/15 px-2 py-1 text-xs dark:border-white/20 disabled:opacity-40"
    >
      {label}
    </button>
  );
}
