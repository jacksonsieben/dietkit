"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Action, ActionButton, Legend, TextLink } from "@/components/nd/kit";
import { todayIsoDate } from "@/lib/date";
import type { FoodSearchResult } from "@/lib/db/foods";
import type { PresetRow } from "@/lib/db/presets";
import {
  copyPreset,
  presetShape,
  PresetWithoutDefault,
} from "@/lib/diet/fromPreset";
import { loadGoal } from "@/lib/energy/goal";
import { planMacros } from "@/lib/energy/macros";
import { loadEnergySummary } from "@/lib/energy/summary";
import { applyPresetCopy, fetchPresetCatalog } from "@/lib/presets/store";
import { getRepository } from "@/lib/storage";
import type { Diet, MacroSet } from "@/lib/storage/types";

/**
 * Starting a plan from a published model instead of from an empty list (#114).
 *
 * What a preset ships is a shape: how many meals the day has, how much of it
 * each one carries, which foods sit in which meal, and where the day offers a
 * choice or a swap. What it does not ship — and the reason this screen exists
 * rather than a "modelos" tab on the server — is anybody's kilocalories. The
 * targets come off this device's own profile and weight, the copy is solved
 * here before it is written, and the page says so, because a plan that arrives
 * already in grams looks exactly like a plan somebody else sized for you.
 *
 * The copy is a copy. Nothing written by the button below names the preset it
 * came from, nothing re-reads it, and re-seeding `src/lib/diet/presets.ts`
 * tomorrow cannot reach a plan somebody started today (`lib/diet/fromPreset`).
 *
 * The catalogue is one unauthenticated GET with no query string, so the server
 * cannot learn which model was chosen — and once it has been fetched the
 * service worker holds it, which is why the failure below distinguishes "no
 * signal" from "the server said no". An empty list would be a lie about the
 * app rather than the truth about the connection.
 */

const LIST = "flex list-disc flex-col gap-1 pl-5 text-sm marker:text-nd-dim";

type Screen =
  | { readonly kind: "loading" }
  /** The device could not be read at all: nothing to size a plan against. */
  | { readonly kind: "deviceFailed" }
  | { readonly kind: "missing"; readonly needs: "profile" | "weight" }
  | { readonly kind: "offline" }
  | { readonly kind: "unavailable" }
  | {
      readonly kind: "ready";
      readonly presets: readonly PresetRow[];
      readonly foods: readonly FoodSearchResult[];
      readonly targets: MacroSet;
      readonly weightKg: number;
    }
  | { readonly kind: "done"; readonly diet: Diet };

type Action =
  | { readonly kind: "idle" }
  | { readonly kind: "copying"; readonly slug: string }
  | { readonly kind: "failed" }
  /** A set with no default: the preset is wrong, and it is named. */
  | { readonly kind: "incomplete"; readonly set: string };

export function DietPresets() {
  const t = useTranslations("Presets");

  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [action, setAction] = useState<Action>({ kind: "idle" });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      let energy, goal;
      try {
        const repository = getRepository();
        [energy, goal] = await Promise.all([
          loadEnergySummary(repository, todayIsoDate()),
          loadGoal(repository),
        ]);
      } catch {
        if (!cancelled) setScreen({ kind: "deviceFailed" });
        return;
      }
      if (cancelled) return;

      // Before the network, and instead of it: without a profile there is
      // nothing to size a copy against, so a list of models would be a list of
      // buttons that cannot be pressed.
      if (energy.status === "missing") {
        setScreen({ kind: "missing", needs: energy.needs });
        return;
      }

      const fetched = await fetchPresetCatalog(undefined, controller.signal);
      if (cancelled) return;

      if (fetched.status !== "ok") {
        setScreen({ kind: fetched.status });
        return;
      }

      try {
        const macros = planMacros({
          totalDailyEnergyExpenditure:
            energy.summary.totalDailyEnergyExpenditure,
          weightKg: energy.summary.weightKg,
          goal,
        });

        setScreen({
          kind: "ready",
          presets: fetched.catalog.presets,
          foods: fetched.catalog.foods,
          targets: macros.targets,
          weightKg: energy.summary.weightKg,
        });
      } catch {
        // `planMacros` throws on a body this store should never have held.
        setScreen({ kind: "deviceFailed" });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const choose = async (preset: PresetRow) => {
    if (screen.kind !== "ready") return;
    setAction({ kind: "copying", slug: preset.slug });

    try {
      const copy = copyPreset({
        preset,
        foods: screen.foods,
        name: t("dietName"),
        targets: screen.targets,
        basedOnWeightKg: screen.weightKg,
        now: new Date().toISOString(),
        newId: () => crypto.randomUUID(),
      });

      await applyPresetCopy(getRepository(), copy);
      setScreen({ kind: "done", diet: copy.diet });
      setAction({ kind: "idle" });
    } catch (error) {
      setAction(
        error instanceof PresetWithoutDefault
          ? { kind: "incomplete", set: error.setName }
          : { kind: "failed" },
      );
    }
  };

  if (screen.kind === "loading") {
    return <p className="text-sm text-nd-dim">{t("loading")}</p>;
  }

  if (screen.kind === "deviceFailed") {
    return <p className="text-sm text-nd-red-ink">{t("loadError")}</p>;
  }

  if (screen.kind === "missing") {
    return (
      <section className="flex flex-col items-start gap-4">
        <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
          {screen.needs === "profile"
            ? t("missingProfile")
            : t("missingWeight")}
        </p>
        <Action href="/perfil">{t("missingLink")}</Action>
      </section>
    );
  }

  // Two failures, two sentences. "Sem modelos" is what neither of them means,
  // and it is what an empty list would have said.
  if (screen.kind === "offline" || screen.kind === "unavailable") {
    return (
      <section className="flex flex-col items-start gap-4 border-l-2 border-nd-red pl-4">
        <Legend as="h2">
          {screen.kind === "offline"
            ? t("offlineTitle")
            : t("unavailableTitle")}
        </Legend>
        <p className="max-w-prose text-sm leading-relaxed text-nd-red-ink">
          {screen.kind === "offline" ? t("offlineLead") : t("unavailableLead")}
        </p>
        <Action href="/dieta">{t("buildLink")}</Action>
      </section>
    );
  }

  if (screen.kind === "done") {
    return <Done diet={screen.diet} />;
  }

  if (screen.presets.length === 0) {
    return (
      <section className="flex flex-col items-start gap-4">
        <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
          {t("empty")}
        </p>
        <Action href="/dieta">{t("buildLink")}</Action>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-prose text-sm leading-relaxed text-nd-dim">
        {t("keeps")}
      </p>

      {screen.presets.map((preset) => (
        <Preset
          key={preset.slug}
          preset={preset}
          targets={screen.targets}
          busy={action.kind === "copying"}
          copying={action.kind === "copying" && action.slug === preset.slug}
          onChoose={() => void choose(preset)}
        />
      ))}

      {action.kind === "failed" ? (
        <p className="text-sm text-nd-red-ink">{t("copyError")}</p>
      ) : null}

      {action.kind === "incomplete" ? (
        <p className="text-sm text-nd-red-ink">
          {t("incomplete", { set: action.set })}
        </p>
      ) : null}

      <Credit />
    </div>
  );
}

function Preset({
  preset,
  targets,
  busy,
  copying,
  onChoose,
}: {
  preset: PresetRow;
  targets: MacroSet;
  busy: boolean;
  copying: boolean;
  onChoose: () => void;
}) {
  const t = useTranslations("Presets");
  const shape = presetShape(preset);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Legend as="h2">{preset.name}</Legend>
        <p className="max-w-prose text-sm leading-relaxed">
          {preset.description}
        </p>
      </div>

      <ul className={LIST}>
        <li>
          {t("shapeMeals", {
            count: shape.meals.length,
            meals: shape.meals
              .map((meal) =>
                t("mealShare", { name: meal.name, percent: meal.percent }),
              )
              .join(", "),
          })}
        </li>
        <li>{t("shapeChoices", { count: shape.choices })}</li>
        <li>{t("shapeSwaps", { count: shape.swaps })}</li>
        <li>{t("shapeFoods", { count: shape.foods })}</li>
        {/* Said on the card, beside the button, rather than only after the
            copy: the numbers this plan arrives in are this device's. */}
        <li>
          {t("shapeTargets", {
            kcal: Math.round(targets.kcal),
            protein: Math.round(targets.proteinG),
            carb: Math.round(targets.carbG),
            fat: Math.round(targets.fatG),
          })}
        </li>
      </ul>

      <div>
        <ActionButton type="button" onClick={onChoose} disabled={busy}>
          {copying ? t("copying") : t("choose")}
        </ActionButton>
      </div>
    </section>
  );
}

function Done({ diet }: { diet: Diet }) {
  const t = useTranslations("Presets");

  return (
    <section className="flex flex-col gap-4">
      <Legend as="h2">{t("doneTitle")}</Legend>
      <p className="max-w-prose text-sm leading-relaxed">{t("doneLead")}</p>

      <ul className={LIST}>
        <li>
          {t("doneSized", {
            weight: diet.basedOnWeightKg ?? 0,
            kcal: Math.round(diet.targets.kcal),
            protein: Math.round(diet.targets.proteinG),
            carb: Math.round(diet.targets.carbG),
            fat: Math.round(diet.targets.fatG),
          })}
        </li>
        <li>{t("doneMeals", { count: diet.meals.length })}</li>
        <li>{t("doneOwned")}</li>
      </ul>

      <div className="flex flex-wrap items-center gap-4">
        <Action href="/dieta">{t("planLink")}</Action>
        <TextLink href="/alimentos/grupos">{t("groupsLink")}</TextLink>
      </div>
    </section>
  );
}

/**
 * Whose numbers these are, on the screen that hands them over.
 *
 * The footer already carries the TACO credit on every page, which is what the
 * licence asks for. This says the other half, which the licence does not: the
 * arrangement of the meals is this project's and the composition of the foods
 * is theirs, and a model is not a prescription from either of us.
 */
function Credit() {
  const t = useTranslations("Presets");

  return (
    <p className="max-w-prose text-xs leading-relaxed text-nd-dim">
      {t("credit")} <TextLink href="/fontes">{t("creditLink")}</TextLink>
    </p>
  );
}
