"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { DotText } from "@/components/dot/DotText";
import { GlyphBar } from "@/components/GlyphBar";
import { Link } from "@/i18n/navigation";
import { todayIsoDate, calendarDate } from "@/lib/date";
import type { MacroLine, ReconcileMacro } from "@/lib/diet/reconcile";
import { getRepository } from "@/lib/storage";
import { loadToday, type TodayState } from "@/lib/today/summary";

/**
 * The home screen: one question answered, in one viewport.
 *
 * What was here before was a heap of seven links — every route in the app laid
 * out flat, which put the burden of knowing where to go on the person least
 * able to carry it. The user's own words about it were that "everything just
 * thrown out on the first screen makes no sense".
 *
 * So this screen has a job instead of a menu. Standing in a kitchen holding a
 * phone, the question is "what am I eating today, and is this working", and the
 * answer is: the day's energy target as the largest object on the screen, the
 * three macros as strips of light underneath it, then the body, then the plan.
 * Reading order is the order of the loop the app is for. Everything else in the
 * app moved to `/mais`, which is where a thing you consult goes when the thing
 * you use lives here.
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
  }, []);

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

  return <Ready state={state} />;
}

function Ready({ state }: { state: Extract<TodayState, { status: "ready" }> }) {
  const t = useTranslations("Today");
  const macroName = useTranslations("Macros.macro");
  const format = useFormatter();

  const kcal = Math.round(state.targets.kcal);
  const lines = state.plan?.reconciliation.lines;

  return (
    <Shell>
      {/* The headline. Deliberately the largest object on the screen by a wide
          margin: at arm's length, across a kitchen, this is the one number the
          screen is for, and it is drawn in dots rather than set in type so it
          reads as an instrument's output rather than as a sentence. */}
      <section className="flex flex-col gap-3">
        <h1 className="text-xs font-medium tracking-[0.22em] text-nd-dim uppercase">
          {t("targetCaption")}
        </h1>
        <DotText
          className="block"
          style={{
            // One dial for the whole panel (see DotText): the cell pitch is the
            // font size, so the width of the number decides it. `48rem` and
            // `3rem` are the column's own cap and its two gutters — without them
            // the panel would keep sizing itself against a 1400 px window it is
            // not allowed to use. The `26px` ceiling is what a real display
            // does: the pitch stops growing, so a three-digit target is a
            // visibly shorter panel than a four-digit one rather than the same
            // block of light with fatter dots in it.
            fontSize: `min(26px, calc((min(100vw, 48rem) - 3rem) / ${String(kcal).length * 6}))`,
          }}
        >
          {String(kcal)}
        </DotText>
        <p className="text-sm tracking-[0.08em] uppercase">{t("energyUnit")}</p>
      </section>

      <Rule />

      <section className="flex flex-col gap-6">
        <h2 className="text-xs font-medium tracking-[0.22em] text-nd-dim uppercase">
          {t("macros")}
        </h2>
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
      </section>

      <Rule />

      {/* The plan, second: the target is what you act on, the plan is how far
          you have got with it. */}
      <section className="flex flex-col gap-3">
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
            <h2 className="text-xs font-medium tracking-[0.22em] text-nd-dim uppercase">
              {t("planTitle")}
            </h2>
            <p className="text-lg font-semibold tracking-tight">
              {state.plan.name}
            </p>
            <MealLamps
              filled={state.plan.filledMealCount}
              total={state.plan.mealCount}
            />
            <p className="text-sm text-nd-dim">
              {t("planMeals", {
                filled: state.plan.filledMealCount,
                total: state.plan.mealCount,
              })}
            </p>
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
            <Action href="/dieta">{t("planAction")}</Action>
          </>
        )}
      </section>

      <Rule />

      {/* The body, last: it is the evidence that the rest of it is working, and
          it is the thing the user changes least often. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium tracking-[0.22em] text-nd-dim uppercase">
          {t("bodyTitle")}
        </h2>
        {/* The same shape as the headline — label, readout, unit — one size
            down. Both numbers in the loop are measurements of the same body,
            and rendering one as light and the other as ordinary running text
            said they came from two different instruments. The pitch is fixed
            rather than fitted: this readout is never allowed to compete with
            the target above it. */}
        <DotText className="block" style={{ fontSize: "16px" }}>
          {format.number(tenths(state.weight.kg))}
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
        <Action href="/peso">{t("bodyAction")}</Action>
      </section>
    </Shell>
  );
}

/**
 * The plan's meals, as one lamp each.
 *
 * The macros are already read as strips of light, and a meal that has food in
 * it is the same kind of fact: countable, small-numbered, and answerable at a
 * glance. Fixed-width rather than stretched, because four lamps spread across
 * the column would read as a progress bar at 25 % — the wrong quantity
 * entirely. Hidden from assistive technology for the same reason `GlyphBar`'s
 * strip is: the sentence underneath already says it in words.
 */
function MealLamps({ filled, total }: { filled: number; total: number }) {
  return (
    <div aria-hidden="true" className="flex flex-wrap gap-[3px]">
      {Array.from({ length: total }, (unused, index) => (
        <span
          key={index}
          className="nd-seg h-5 w-8"
          // `on` and `off`, not booleans: `nd-seg` reads a lamp *state*, and
          // the third value it knows — `short` — is the seeking pulse a macro
          // strip uses. A meal either has food in it or does not.
          data-lit={index < filled ? "on" : "off"}
          style={{ "--nd-seg-index": index } as LampStyle}
        />
      ))}
    </div>
  );
}

interface LampStyle extends CSSProperties {
  "--nd-seg-index": number;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-10">
      {children}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <p className="text-sm text-nd-dim">{children}</p>
    </Shell>
  );
}

/** A rule, not a card: the world here is ruled sheets, not floating boxes. */
function Rule() {
  return <hr className="border-0 border-t-2 border-nd-ink" />;
}

function Action({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="nd-invert inline-flex w-fit items-center bg-nd-ink px-5 py-3 text-sm font-medium tracking-[0.08em] text-nd-ground uppercase"
    >
      {children}
    </Link>
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
