"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { displayFontSize, DotText } from "@/components/dot/DotText";
import { CONTROL_BOX } from "@/components/Field";
import { GlyphBar } from "@/components/GlyphBar";
import {
  Action,
  ActionButton,
  Legend,
  Notice,
  Rule,
  Shell,
  TextLink,
} from "@/components/nd/kit";
import { todayIsoDate, calendarDate } from "@/lib/date";
import type { MacroLine, ReconcileMacro } from "@/lib/diet/reconcile";
import { portionCount, portionOf } from "@/lib/foods/portions";
import { getRepository } from "@/lib/storage";
import {
  loadToday,
  type TodayMeal,
  type TodayState,
} from "@/lib/today/summary";
import { saveWeightEntry } from "@/lib/weight/log";
import {
  WEIGHT_LIMITS,
  validateWeightForm,
  type WeightErrorCode,
} from "@/lib/weight/validation";

/**
 * The home screen: one question answered, in one viewport.
 *
 * What was here before was a heap of seven links — every route in the app laid
 * out flat, which put the burden of knowing where to go on the person least
 * able to carry it. The user's own words about it were that "everything just
 * thrown out on the first screen makes no sense".
 *
 * So this screen has a job instead of a menu. Standing in a kitchen holding a
 * phone, the question is "what am I eating today, and is this working". The
 * first answer used to be a number of calories and a row of lamps saying *2 of
 * 3 meals have food in them* — true, and not an answer: the words *arroz* and
 * *ovo* are, and they appeared nowhere outside the editor. So the meals are
 * named here now, with the grams the solve produced, and the target keeps the
 * headline because it is what the day is aimed at.
 *
 * Reading order is the order of the loop the app is for: the target, the food,
 * how much of the target that food covers, then the body. Everything else in
 * the app moved to `/mais`, which is where a thing you consult goes when the
 * thing you use lives here.
 *
 * The screen renders one of four states, and none of them is a spinner over an
 * empty layout: without a profile it asks for a profile, without a weighing it
 * asks for a weighing, without a diet it shows the targets it can already
 * compute and offers to build one. An empty state that explains what it is
 * missing is the onboarding this app has instead of a tour.
 *
 * Every number here comes from `loadToday`, which is an assembly of the
 * existing lib functions rather than a second opinion about them — the lesson
 * from docs/MACRO-RECONCILIATION.md is that a computed quantity gets exactly
 * one source of truth and the view reads it.
 */

/** Only the three that are actually solved for; kcal is the headline instead. */
const MACRO_ORDER: readonly ReconcileMacro[] = ["proteinG", "carbG", "fatG"];

export function Today() {
  const t = useTranslations("Today");
  const [state, setState] = useState<TodayState | "loading" | "error">(
    "loading",
  );
  /* Bumped by a weighing saved from this screen. Re-running the one load is
     the only honest way to redraw it: today's weight moves the energy target,
     which moves the solve, which moves every gram in the meal list — deriving
     any of that a second time here is how two answers to one number start. */
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    // Nothing on this screen exists on the server: it is all IndexedDB, so the
    // first paint is the loading line and the answer arrives after mount.
    let live = true;

    void (async () => {
      try {
        const next = await loadToday(getRepository(), todayIsoDate());
        if (live) setState(next);
      } catch {
        if (live) setState("error");
      }
    })();

    return () => {
      live = false;
    };
  }, [reloads]);

  if (state === "loading") return <Notice>{t("loading")}</Notice>;
  if (state === "error") return <Notice>{t("loadError")}</Notice>;

  if (state.status === "needs") {
    const which = state.needs === "profile" ? "needsProfile" : "needsWeight";
    return (
      <Shell>
        <section className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {t(`${which}.title` as "needsProfile.title")}
          </h1>
          <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
            {t(`${which}.body` as "needsProfile.body")}
          </p>
          <Action href={state.needs === "profile" ? "/perfil" : "/peso"}>
            {t(`${which}.action` as "needsProfile.action")}
          </Action>
        </section>
      </Shell>
    );
  }

  return (
    <Ready state={state} onWeighed={() => setReloads((count) => count + 1)} />
  );
}

function Ready({
  state,
  onWeighed,
}: {
  state: Extract<TodayState, { status: "ready" }>;
  onWeighed: () => void;
}) {
  const t = useTranslations("Today");
  const macroName = useTranslations("Macros.macro");
  const format = useFormatter();

  const kcal = Math.round(state.targets.kcal);
  const lines = state.plan?.reconciliation.lines;

  /* Formatted rather than stringified, for the same reason /peso's panel is:
     `DotText` lights exactly the characters it is handed, and `String(82.4)`
     would light a full stop on a device set to pt-BR. */
  const weight = format.number(tenths(state.weight.kg));

  return (
    <Shell>
      {/* The headline. Deliberately the largest object on the screen by a wide
          margin: at arm's length, across a kitchen, this is the one number the
          screen is for, and it is drawn in dots rather than set in type so it
          reads as an instrument's output rather than as a sentence. */}
      <section className="flex flex-col gap-3">
        <Legend as="h1">{t("targetCaption")}</Legend>
        <DotText
          className="block"
          style={{ fontSize: displayFontSize(String(kcal)) }}
        >
          {String(kcal)}
        </DotText>
        <p className="text-sm tracking-[0.08em] uppercase">{t("energyUnit")}</p>
      </section>

      <Rule />

      {/* The food, first of the sections: it is the part of the day a person
          acts on, and it is what they came to look up. */}
      <section className="flex flex-col gap-4">
        {state.plan === undefined ? (
          <>
            <h2 className="text-base font-semibold tracking-tight">
              {t("noPlanTitle")}
            </h2>
            <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
              {t("noPlanBody")}
            </p>
            <Action href="/dieta">{t("noPlanAction")}</Action>
          </>
        ) : (
          <>
            <Legend as="h2">{t("planTitle")}</Legend>
            <p className="text-sm text-nd-dim">{state.plan.name}</p>
            <Meals meals={state.plan.meals} />
            <Action href="/dieta">{t("planAction")}</Action>
          </>
        )}
      </section>

      <Rule />

      {/* What the plan covers — not what is left to eat today. The distinction
          is the whole reason this section was renamed: nothing in the app knows
          whether lunch has been eaten, so "faltam 97 g" was a sentence about a
          plan being unfinished that read as an instruction to go and eat. */}
      <section className="flex flex-col gap-6">
        <Legend as="h2">{t("macros")}</Legend>
        {MACRO_ORDER.map((macro) => {
          const target = Math.round(state.targets[macro]);
          const line =
            lines === undefined
              ? emptyLine(macro, target)
              : lineFor(lines, macro);

          return (
            <GlyphBar
              key={macro}
              label={macroName(MACRO_KEYS[macro])}
              reading={t("macroReading", { actual: line.actual, target })}
              status={statusText(line, t)}
              line={line}
            />
          );
        })}
        {state.plan !== undefined && (
          <p
            className={
              state.plan.reconciliation.onTarget
                ? "text-sm"
                : "text-sm text-nd-red-ink"
            }
          >
            {state.plan.reconciliation.onTarget
              ? t("planMet")
              : t("planMissed")}
          </p>
        )}
      </section>

      <Rule />

      {/* The body, last: it is the evidence that the rest of it is working, and
          it is the thing the user changes least often. */}
      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("bodyTitle")}</Legend>
        {/* The same shape as the headline — label, readout, unit — one size
            down. Both numbers in the loop are measurements of the same body,
            and rendering one as light and the other as ordinary running text
            said they came from two different instruments. The 16 is a ceiling,
            not a pitch: this readout is never allowed to compete with the
            target above it, and it still has to fit the column, which a bare
            `16px` did not — `82,4` is 384 px wide at that size and the phone
            gives it 342. */}
        <DotText
          className="block"
          style={{ fontSize: displayFontSize(weight, 16) }}
        >
          {weight}
        </DotText>
        <p className="text-sm tracking-[0.08em] uppercase">{t("bodyUnit")}</p>
        <p className="text-sm text-nd-dim">
          {t("bodyMeasured", {
            date: format.dateTime(calendarDate(state.weight.on), {
              day: "numeric",
              month: "short",
            }),
          })}
        </p>
        <p className="text-sm text-nd-dim">{changeText(state, t)}</p>
        <WeighIn
          previous={state.weight.kg}
          alreadyToday={state.weight.on === todayIsoDate()}
          onSaved={onWeighed}
        />
        <TextLink href="/peso">{t("bodyAction")}</TextLink>
      </section>
    </Shell>
  );
}

/**
 * The day's meals, named.
 *
 * A ruled list rather than cards: the meals are one series of the same kind of
 * thing, and a card around each would draw three boxes on a screen whose whole
 * complaint was that it had too much furniture on it. The food name is set in
 * running text and the quantity in the mono face used everywhere numbers are
 * meant to be compared down a column.
 *
 * An empty meal keeps its row and says so, with the way in beside it. The
 * alternative — hiding it — would leave the person who has filled in breakfast
 * looking at a screen that quietly agrees their day is done.
 */
function Meals({ meals }: { meals: readonly TodayMeal[] }) {
  const t = useTranslations("Today");
  const tPortion = useTranslations("Portions");

  return (
    <ul className="flex flex-col">
      {meals.map((meal) => (
        <li
          key={meal.id}
          className="flex flex-col gap-2 border-t border-nd-unlit py-4 first:border-t-0 first:pt-0"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-xs font-medium tracking-[0.22em] uppercase">
              {meal.name}
            </h3>
            <span
              className="shrink-0 font-mono text-xs text-nd-dim"
              data-numeric=""
            >
              {meal.foods.length === 0
                ? t("mealToFill", { kcal: Math.round(meal.targetKcal) })
                : t("mealKcal", { kcal: Math.round(meal.kcal) })}
            </span>
          </div>

          {meal.foods.length === 0 ? (
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm text-nd-dim">{t("mealEmpty")}</p>
              <TextLink
                href={`/dieta?refeicao=${meal.id}`}
                className="shrink-0 text-xs tracking-[0.08em] uppercase"
              >
                {t("mealBuild")}
              </TextLink>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {meal.foods.map((food, index) => {
                /* The gloss is drawn from the ref every time rather than
                   stored: `~2 xícaras` is this app's estimate of a helping,
                   never a number that crosses into storage (#D). */
                const portion = portionOf(food.food);
                const units =
                  portion === undefined
                    ? undefined
                    : portionCount(food.quantityG, portion);

                return (
                  /* Stacked rather than name-left / grams-right: TACO writes
                     "Ovo, de galinha, inteiro, cozido/10minutos", which wraps
                     to two lines on a phone and leaves the number floating
                     beside the first of them. The name is the thing being
                     read; the quantity is the thing being checked. */
                  <li
                    key={`${food.name}-${index}`}
                    className="flex flex-col gap-0.5"
                  >
                    <span className="text-sm">{food.name}</span>
                    <span
                      className="font-mono text-xs text-nd-dim"
                      data-numeric=""
                    >
                      {t("mealGrams", { grams: Math.round(food.quantityG) })}
                      {portion !== undefined &&
                        units !== undefined &&
                        ` · ${tPortion(portion.unit, { count: units })}`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

const ERROR_PARAMS: Partial<Record<WeightErrorCode, Record<string, number>>> = {
  weightRange: WEIGHT_LIMITS.weightKg,
};

/**
 * This morning's weighing, from where the person already is.
 *
 * It was a link to `/peso`, where a dialog had to be opened before a number
 * could be typed — three taps and two screens for the one thing this app asks
 * of a user every day. Here it is a field with yesterday's number already in
 * it, because the answer is nearly always within a kilo of that, and a button.
 *
 * `/peso` keeps everything this does not: backfilling an older day, a note, the
 * chart, corrections to the log. This box only ever writes today, which is also
 * why it can save without the replace confirmation that screen asks for —
 * today's slot is the one the person is deliberately aiming at, and the line
 * above the field says when there is already a value in it.
 */
function WeighIn({
  previous,
  alreadyToday,
  onSaved,
}: {
  previous: number;
  alreadyToday: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations("Today");
  const tWeight = useTranslations("Weight");

  const [value, setValue] = useState(() =>
    String(tenths(previous)).replace(".", ","),
  );
  const [error, setError] = useState<WeightErrorCode>();
  const [status, setStatus] = useState<"ready" | "saving" | "saved" | "failed">(
    "ready",
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const today = todayIsoDate();
    const result = validateWeightForm(
      { date: today, weightKg: value, note: "" },
      today,
    );

    if (!result.ok) {
      // Only the one field is on this form; a date or note error here would be
      // this component's bug rather than something to show a user.
      setError(result.errors.weightKg ?? "notANumber");
      setStatus("ready");
      return;
    }

    setError(undefined);
    setStatus("saving");

    void (async () => {
      try {
        await saveWeightEntry(
          getRepository(),
          result.value,
          new Date().toISOString(),
        );
        setStatus("saved");
        onSaved();
      } catch {
        setStatus("failed");
      }
    })();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">{t("weighLabel")}</span>
          <input
            className={`${CONTROL_BOX} w-24 text-right font-mono`}
            data-numeric=""
            inputMode="decimal"
            value={value}
            aria-invalid={error !== undefined}
            onChange={(event) => {
              setValue(event.target.value);
              setError(undefined);
              if (status !== "saving") setStatus("ready");
            }}
          />
          <span className="tracking-[0.08em] uppercase">{t("bodyUnit")}</span>
        </label>
        <ActionButton type="submit" disabled={status === "saving"}>
          {status === "saving" ? t("weighSaving") : t("weighAction")}
        </ActionButton>
      </div>

      {error !== undefined && (
        <p className="text-sm text-nd-red-ink">
          {tWeight(`errors.${error}`, ERROR_PARAMS[error])}
        </p>
      )}
      {error === undefined && status === "ready" && alreadyToday && (
        <p className="text-sm text-nd-dim">{t("weighReplaces")}</p>
      )}
      {status === "saved" && (
        <p className="text-sm text-nd-good">{t("weighSaved")}</p>
      )}
      {status === "failed" && (
        <p className="text-sm text-nd-red-ink">{t("weighError")}</p>
      )}
    </form>
  );
}

/**
 * The three words come from `Macros.macro`, which already owns them — a second
 * copy in a `Today` namespace would be a second thing to keep in step, and the
 * day these are renamed is the day the two would drift.
 */
const MACRO_KEYS = {
  proteinG: "protein",
  carbG: "carb",
  fatG: "fat",
  kcal: "protein",
} as const;

function lineFor(
  lines: readonly MacroLine[],
  macro: ReconcileMacro,
): MacroLine {
  return lines.find((line) => line.macro === macro) ?? emptyLine(macro, 0);
}

/**
 * The row for a macro when there is no plan yet: the target stands, nothing is
 * accounted for. Written out rather than skipped so the strips are on screen
 * from the first day, dark, which is a truer picture than an absence.
 */
function emptyLine(macro: ReconcileMacro, target: number): MacroLine {
  return { macro, target, actual: 0, delta: -target, state: "under" };
}

function statusText(
  line: MacroLine,
  t: ReturnType<typeof useTranslations<"Today">>,
): string {
  if (line.state === "on") return t("macroMet");
  if (line.state === "over") return t("macroOver", { value: line.delta });
  return t("macroShort", { value: -line.delta });
}

function changeText(
  state: Extract<TodayState, { status: "ready" }>,
  t: ReturnType<typeof useTranslations<"Today">>,
): string {
  const change = state.weight.change;
  if (change === undefined) return t("bodyChangeNone");

  const kg = tenths(Math.abs(change.kg));
  if (kg === 0) return t("bodyChangeNone");

  return t(change.kg < 0 ? "bodyChangeDown" : "bodyChangeUp", {
    value: String(kg).replace(".", ","),
    days: change.days,
  });
}

/** Weights are read to a tenth of a kilo. Nothing below that is a measurement. */
function tenths(kg: number): number {
  return Math.round(kg * 10) / 10;
}
