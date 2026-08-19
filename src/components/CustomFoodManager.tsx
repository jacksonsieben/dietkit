"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import { Field } from "@/components/Field";
import { Link } from "@/i18n/navigation";
import {
  CUSTOM_FOOD_LIMITS,
  EMPTY_CUSTOM_FOOD_FORM,
  deriveKcal,
  toCustomFoodForm,
  validateCustomFoodForm,
  type CustomFoodErrorCode,
  type CustomFoodErrors,
  type CustomFoodField,
  type CustomFoodFormValues,
} from "@/lib/foods/custom";
import { saveCustomFood } from "@/lib/foods/persistence";
import { parseDecimal } from "@/lib/profile/validation";
import { getRepository } from "@/lib/storage";
import type { CustomFood, Id } from "@/lib/storage/types";

/**
 * Where the foods TACO does not have get typed in (#17).
 *
 * A client component for the reason `ProfileForm` is: these records only exist
 * on the device that owns them, so there is nothing for a server to render.
 *
 * The form and the list are one component rather than two because editing joins
 * them — pressing *Editar* on a row is what fills the boxes above, and a split
 * would mean the same state lifted into a parent that did nothing else.
 */

/** Bounds interpolated into the messages for the codes that quote them. */
const ERROR_PARAMS: Partial<Record<CustomFoodErrorCode, Record<string, number>>> = {
  nameLength: CUSTOM_FOOD_LIMITS.nameLength,
  brandLength: CUSTOM_FOOD_LIMITS.brandLength,
  macroRange: CUSTOM_FOOD_LIMITS.macroG,
  servingRange: CUSTOM_FOOD_LIMITS.servingG,
};

type Status =
  | "loading"
  | "ready"
  | "saving"
  | "saved"
  | "loadFailed"
  | "saveFailed"
  | "removeFailed";

export function CustomFoodManager() {
  const t = useTranslations("MyFoods");

  const [foods, setFoods] = useState<readonly CustomFood[]>([]);
  const [values, setValues] = useState<CustomFoodFormValues>(EMPTY_CUSTOM_FOOD_FORM);
  const [errors, setErrors] = useState<CustomFoodErrors>({});
  const [status, setStatus] = useState<Status>("loading");
  /** The food the boxes are currently holding, if it is one that exists. */
  const [editing, setEditing] = useState<Id | undefined>(undefined);
  /**
   * The row that has asked "are you sure".
   *
   * In state rather than in a native `confirm` dialog: that dialog is the one
   * piece of UI here that cannot be translated, styled, or read by the tests,
   * and deleting a food is a two-press action either way.
   */
  const [confirming, setConfirming] = useState<Id | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const stored = await getRepository().customFoods.list();
        if (cancelled) return;

        setFoods(stored);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("loadFailed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const update = (field: CustomFoodField) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    // Clears this field's complaint as it is being addressed. `macroSum` marks
    // all three boxes, so fixing any one of them clears only its own — the
    // other two are re-decided by the next validation pass, which is the only
    // thing that can tell whether the sum still fails.
    setErrors((current) => {
      if (!(field in current)) return current;
      const { [field]: _cleared, ...rest } = current;
      return rest;
    });
    setStatus((current) => (current === "saved" ? "ready" : current));
  };

  const startEditing = (food: CustomFood) => {
    setValues(toCustomFoodForm(food));
    setErrors({});
    setEditing(food.id);
    setStatus("ready");
  };

  const stopEditing = () => {
    setValues(EMPTY_CUSTOM_FOOD_FORM);
    setErrors({});
    setEditing(undefined);
    setStatus("ready");
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = validateCustomFoodForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      setStatus("ready");
      return;
    }

    setErrors({});
    setStatus("saving");

    try {
      const repository = getRepository();
      await saveCustomFood(repository, result.value, editing, new Date().toISOString());

      // Re-read rather than splice: the store decides the order (by name), and
      // a list kept in step by hand would drift from it the first time someone
      // renamed a food.
      setFoods(await repository.customFoods.list());
      setValues(EMPTY_CUSTOM_FOOD_FORM);
      setEditing(undefined);
      setStatus("saved");
    } catch {
      setStatus("saveFailed");
    }
  };

  const remove = async (id: Id) => {
    setConfirming(undefined);

    try {
      const repository = getRepository();
      await repository.customFoods.remove(id);
      setFoods(await repository.customFoods.list());

      // The boxes were holding the food that just stopped existing. Left alone,
      // saving them would write it back under the same id — see
      // `saveCustomFood`, which is deliberately willing to do that.
      if (editing === id) stopEditing();
      else setStatus("ready");
    } catch {
      setStatus("removeFailed");
    }
  };

  if (status === "loading") {
    return <p className="text-sm opacity-60">{t("loading")}</p>;
  }

  if (status === "loadFailed") {
    return (
      <p className="text-sm text-red-700 dark:text-red-400">{t("loadError")}</p>
    );
  }

  const messageFor = (code: CustomFoodErrorCode) =>
    t(`errors.${code}`, ERROR_PARAMS[code]);

  const kcal = previewKcal(values);

  return (
    <div className="flex flex-col gap-10">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <h2 className="text-sm font-semibold tracking-tight">
          {editing === undefined
            ? t("formTitle")
            : t("editTitle", { name: nameOf(foods, editing, values.name) })}
        </h2>

        <Field
          label={t("nameLabel")}
          hint={t("nameHint")}
          error={errors.name && messageFor(errors.name)}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              autoComplete="off"
              placeholder={t("namePlaceholder")}
              value={values.name}
              onChange={(event) => update("name")(event.target.value)}
            />
          )}
        </Field>

        <Field
          label={t("brandLabel")}
          hint={t("brandHint")}
          error={errors.brand && messageFor(errors.brand)}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              autoComplete="off"
              placeholder={t("brandPlaceholder")}
              value={values.brand}
              onChange={(event) => update("brand")(event.target.value)}
            />
          )}
        </Field>

        <div className="grid gap-6 sm:grid-cols-3">
          <MacroField
            label={t("proteinLabel")}
            hint={t("macroHint")}
            error={errors.proteinG && messageFor(errors.proteinG)}
            value={values.proteinG}
            onChange={update("proteinG")}
          />
          <MacroField
            label={t("carbLabel")}
            hint={t("macroHint")}
            error={errors.carbG && messageFor(errors.carbG)}
            value={values.carbG}
            onChange={update("carbG")}
          />
          <MacroField
            label={t("fatLabel")}
            hint={t("macroHint")}
            error={errors.fatG && messageFor(errors.fatG)}
            value={values.fatG}
            onChange={update("fatG")}
          />
        </div>

        {/*
          Energy is shown, never asked for. A typed kcal that disagreed with the
          typed macros would be a food that contradicts itself, and the plan is
          built from the macros regardless — so the arithmetic is done here, in
          the open, while the boxes are still being filled.
        */}
        <div className="flex flex-col gap-1">
          <p className="font-mono text-sm tabular-nums">
            {kcal === undefined ? null : t("energyPreview", { value: kcal })}
          </p>
          <p className="text-xs opacity-60">{t("energyPreviewHint")}</p>
        </div>

        <Field
          label={t("servingLabel")}
          hint={t("servingHint")}
          error={errors.servingG && messageFor(errors.servingG)}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={values.servingG}
              onChange={(event) => update("servingG")(event.target.value)}
            />
          )}
        </Field>

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={status === "saving"}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {status === "saving" ? t("saving") : t("save")}
          </button>

          {editing === undefined ? null : (
            <button
              type="button"
              onClick={stopEditing}
              className="text-sm underline underline-offset-4"
            >
              {t("cancel")}
            </button>
          )}

          <p aria-live="polite" className="text-sm">
            {status === "saved" ? (
              <span className="opacity-70">{t("saved")}</span>
            ) : null}
            {status === "saveFailed" ? (
              <span className="text-red-700 dark:text-red-400">
                {t("saveError")}
              </span>
            ) : null}
            {status === "removeFailed" ? (
              <span className="text-red-700 dark:text-red-400">
                {t("removeError")}
              </span>
            ) : null}
          </p>
        </div>
      </form>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">
            {t("listTitle")}
          </h2>
          {/*
            Hidden at zero on purpose: the empty state right below already says
            there is nothing here, and a counter next to it would say it twice
            — the second time as "0 alimento", which is what pt's plural rule
            asks for and not what anyone writes.
          */}
          {foods.length === 0 ? null : (
            <p className="text-xs opacity-60">
              {t("listCount", { count: foods.length })}
            </p>
          )}
        </div>

        {foods.length === 0 ? (
          <p className="text-sm opacity-70">{t("listEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {foods.map((food) => (
              <li
                key={food.id}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 rounded-md border border-black/10 px-4 py-3 dark:border-white/15"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-medium">{food.name}</p>
                  <p className="text-xs opacity-60">
                    {[
                      food.brand,
                      t("macros", {
                        protein: food.per100g.proteinG,
                        carb: food.per100g.carbG,
                        fat: food.per100g.fatG,
                        kcal: food.per100g.kcal,
                      }),
                      food.servingG === undefined
                        ? undefined
                        : t("serving", { value: food.servingG }),
                    ]
                      .filter((part) => part !== undefined)
                      .join(" · ")}
                  </p>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  {confirming === food.id ? (
                    <>
                      <span className="text-xs opacity-60">
                        {t("removeWarning")}
                      </span>
                      <button
                        type="button"
                        onClick={() => void remove(food.id)}
                        className="text-red-700 underline underline-offset-4 dark:text-red-400"
                      >
                        {t("removeConfirm")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(undefined)}
                        className="underline underline-offset-4"
                      >
                        {t("removeCancel")}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEditing(food)}
                        className="underline underline-offset-4"
                      >
                        {t("edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(food.id)}
                        className="underline underline-offset-4 opacity-70"
                      >
                        {t("remove")}
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-60">
          <Link href="/alimentos" className="underline underline-offset-4">
            {t("searchLink")}
          </Link>
          <Link href="/alimentos/grupos" className="underline underline-offset-4">
            {t("groupsLink")}
          </Link>
        </p>
      </section>
    </div>
  );
}

function MacroField({
  label,
  hint,
  error,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  error: string | undefined;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(props) => (
        <input
          {...props}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

/**
 * The energy line, while the boxes are still being filled.
 *
 * Deliberately more forgiving than the validator: it does not care whether a
 * figure is in range, only whether all three parse, so the number updates as
 * the third box is typed rather than waiting for a submit. Nothing is stored
 * from here — `validateCustomFoodForm` derives the kcal that gets saved.
 */
function previewKcal(values: CustomFoodFormValues): number | undefined {
  const protein = parseDecimal(values.proteinG);
  const carb = parseDecimal(values.carbG);
  const fat = parseDecimal(values.fatG);

  if (protein === undefined || carb === undefined || fat === undefined) {
    return undefined;
  }

  return deriveKcal(protein, carb, fat);
}

/**
 * What to call the food being edited: the stored name, until the box changes it.
 *
 * Reads the typed name once it is no longer the stored one, so the heading does
 * not keep announcing the old name while the user is renaming it. Falls back to
 * the stored record when the box has been emptied, which is a state the form
 * allows and the heading should not render as a blank.
 */
function nameOf(
  foods: readonly CustomFood[],
  editing: Id,
  typed: string,
): string {
  const trimmed = typed.trim();
  if (trimmed !== "") return trimmed;

  return foods.find((food) => food.id === editing)?.name ?? "";
}
