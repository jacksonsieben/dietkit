"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { Field } from "@/components/Field";
import { ActionButton, TextLink } from "@/components/nd/kit";
import { todayIsoDate } from "@/lib/date";
import { ageYearsOn } from "@/lib/energy/age";
import { ACTIVITY_LEVELS, isCustomActivity } from "@/lib/profile/activity";
import { loadProfileForm, saveProfileForm, toField } from "@/lib/profile/persistence";
import {
  PROFILE_LIMITS,
  type ProfileErrorCode,
  type ProfileErrors,
  type ProfileField,
  type ProfileFormValues,
  validateProfileForm,
} from "@/lib/profile/validation";
import { getRepository } from "@/lib/storage";

/**
 * The one screen that asks the user for something about their body.
 *
 * A client component, and not by preference: `getRepository()` throws where
 * there is no IndexedDB, on purpose (see src/lib/storage/index.ts). Personal
 * data never reaches a server in this architecture, so there is nothing for a
 * server component to render here — the values do not exist until this code
 * runs on the device that owns them.
 *
 * Weight is captured here but does not live in `Profile`. It is written to the
 * weight log as today's entry, because the log is the single source of the
 * current weight (#23, #25) and a profile field beside it would go stale the
 * first time somebody weighed themselves.
 */

const EMPTY: ProfileFormValues = {
  weightKg: "",
  heightCm: "",
  birthDate: "",
  sex: "",
  activityFactor: "",
};

/** Bounds interpolated into the message for the codes that quote them. */
const ERROR_PARAMS: Partial<Record<ProfileErrorCode, Record<string, number>>> = {
  weightRange: PROFILE_LIMITS.weightKg,
  heightRange: PROFILE_LIMITS.heightCm,
  activityRange: PROFILE_LIMITS.activityFactor,
  implausibleAge: { max: PROFILE_LIMITS.ageYears.max },
};

type Status =
  | "loading"
  | "ready"
  | "saving"
  | "saved"
  | "invalid"
  | "loadFailed"
  | "saveFailed";

export function ProfileForm() {
  const t = useTranslations("Profile");
  const format = useFormatter();

  const [values, setValues] = useState<ProfileFormValues>(EMPTY);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [status, setStatus] = useState<Status>("loading");
  /** The day the weight in the field was measured, when it came from the log. */
  const [weightFrom, setWeightFrom] = useState<string | undefined>(undefined);
  /**
   * Whether the activity field is showing its number box instead of the ladder.
   *
   * UI state, not form data: the factor itself lives in `values` either way, so
   * nothing here changes what gets saved. It exists because a `<select>` cannot
   * both offer five rungs and accept a sixth number, and because a stored value
   * between two rungs has to reopen in the mode that can display it.
   */
  const [customActivity, setCustomActivity] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  /**
   * How many times this form has been submitted and refused.
   *
   * A counter rather than a flag because the effect below has to run again
   * when the same field fails a second time, and `errors` is the wrong thing
   * to watch: it also changes while the user is typing, which would drag the
   * page back to a field they had already left.
   */
  const [refusals, setRefusals] = useState(0);

  /*
   * Take the user to the first thing that is wrong.
   *
   * Every complaint this form makes was already drawn under its own field, and
   * it still read as a dead button: on a phone the activity dropdown sits below
   * the fold, so pressing "Salvar" left the screen exactly as it was, with the
   * red text on a part of the form nobody was looking at. The fields carry no
   * ids we own — `Field` mints its own — so the DOM is asked which control is
   * flagged rather than told.
   *
   * `preventScroll` and then a scroll of our own: focus alone would stop the
   * moment the field cleared the edge of the viewport, which is the position
   * that makes it hardest to see what is written underneath it.
   */
  useEffect(() => {
    if (refusals === 0) return;

    const invalid = formRef.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    );
    if (!invalid) return;

    invalid.focus({ preventScroll: true });
    invalid.scrollIntoView({ block: "center" });
  }, [refusals]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        // "Editable after creation" is this, and nothing else: the form is the
        // same form whether or not there is already something to read.
        const loaded = await loadProfileForm(getRepository());
        if (cancelled) return;

        setValues(loaded.values);
        setWeightFrom(loaded.weightFrom);
        setCustomActivity(isCustomActivity(loaded.values.activityFactor));
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("loadFailed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const update = (field: ProfileField) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    // Clears this field's complaint as it is being addressed, rather than
    // leaving stale red text under a value the user has already fixed.
    setErrors((current) => {
      if (!(field in current)) return current;
      const { [field]: _cleared, ...rest } = current;
      return rest;
    });
    setStatus((current) =>
      current === "saved" || current === "invalid" ? "ready" : current,
    );
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const today = todayIsoDate();
    const result = validateProfileForm(values, today);
    if (!result.ok) {
      setErrors(result.errors);
      setStatus("invalid");
      setRefusals((count) => count + 1);
      return;
    }

    setErrors({});
    setStatus("saving");

    try {
      await saveProfileForm(
        getRepository(),
        result.value,
        today,
        new Date().toISOString(),
      );

      setWeightFrom(today);
      setStatus("saved");
    } catch {
      setStatus("saveFailed");
    }
  };

  if (status === "loading") {
    return <p className="text-sm text-nd-dim">{t("loading")}</p>;
  }

  if (status === "loadFailed") {
    return <p className="text-sm text-nd-red-ink">{t("loadError")}</p>;
  }

  const today = todayIsoDate();
  const age =
    values.birthDate !== "" && !errors.birthDate && values.birthDate <= today
      ? ageOrUndefined(values.birthDate, today)
      : undefined;

  const messageFor = (code: ProfileErrorCode) => t(`errors.${code}`, ERROR_PARAMS[code]);

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-6"
    >
      <Field
        label={t("weightLabel")}
        hint={
          weightFrom
            ? `${t("weightHint")} ${t("weightFrom", { date: formatDay(format, weightFrom) })}`
            : t("weightHint")
        }
        error={errors.weightKg && messageFor(errors.weightKg)}
      >
        {(props) => (
          <input
            {...props}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={values.weightKg}
            onChange={(event) => update("weightKg")(event.target.value)}
          />
        )}
      </Field>

      <Field
        label={t("heightLabel")}
        hint={t("heightHint")}
        error={errors.heightCm && messageFor(errors.heightCm)}
      >
        {(props) => (
          <input
            {...props}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={values.heightCm}
            onChange={(event) => update("heightCm")(event.target.value)}
          />
        )}
      </Field>

      <Field
        label={t("birthDateLabel")}
        hint={
          age === undefined
            ? t("birthDateHint")
            : `${t("birthDateHint")} ${t("ageValue", { years: age })}`
        }
        error={errors.birthDate && messageFor(errors.birthDate)}
      >
        {(props) => (
          <input
            {...props}
            // Yields `YYYY-MM-DD` in `.value` whatever the display format is,
            // which is exactly the shape everything downstream expects.
            type="date"
            max={today}
            value={values.birthDate}
            onChange={(event) => update("birthDate")(event.target.value)}
          />
        )}
      </Field>

      <Field
        label={t("sexLabel")}
        hint={t("sexHint")}
        error={errors.sex && messageFor(errors.sex)}
      >
        {(props) => (
          <select
            {...props}
            value={values.sex}
            onChange={(event) => update("sex")(event.target.value)}
          >
            <option value="" />
            <option value="male">{t("sexMale")}</option>
            <option value="female">{t("sexFemale")}</option>
          </select>
        )}
      </Field>

      <Field
        label={t("activityLabel")}
        hint={t("activityHint")}
        // The error belongs to whichever control is holding the number. When
        // the box is open the select is showing a mode, not a value, and red
        // text under it would be pointing at the wrong thing.
        error={
          !customActivity && errors.activityFactor
            ? messageFor(errors.activityFactor)
            : undefined
        }
      >
        {(props) => (
          <select
            {...props}
            value={customActivity ? CUSTOM_ACTIVITY : values.activityFactor}
            onChange={(event) => {
              if (event.target.value === CUSTOM_ACTIVITY) {
                // Keeps whatever number was selected, so the box opens on the
                // value they are adjusting rather than on an empty field.
                setCustomActivity(true);
                return;
              }

              setCustomActivity(false);
              update("activityFactor")(event.target.value);
            }}
          >
            <option value="" />
            {ACTIVITY_LEVELS.map((level) => (
              <option key={level.id} value={toField(level.factor)}>
                {/* The multiplier is shown next to the rung, not hidden behind
                    it (#14). It is the only part of this calculation that is a
                    convention rather than a measurement, so it is also the only
                    part someone needs in order to reconcile our answer with a
                    different one somewhere else. */}
                {t("activityOption", {
                  label: t(`activityLevel.${level.id}`),
                  factor: formatFactor(format, level.factor),
                })}
              </option>
            ))}
            <option value={CUSTOM_ACTIVITY}>{t("activityCustomOption")}</option>
          </select>
        )}
      </Field>

      {customActivity && (
        <Field
          label={t("activityCustomLabel")}
          hint={t("activityCustomHint", PROFILE_LIMITS.activityFactor)}
          error={errors.activityFactor && messageFor(errors.activityFactor)}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={values.activityFactor}
              onChange={(event) => update("activityFactor")(event.target.value)}
            />
          )}
        </Field>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <ActionButton type="submit" disabled={status === "saving"}>
          {status === "saving" ? t("saving") : t("save")}
        </ActionButton>

        {/* Always offered, not only after a save: someone arriving with a
            profile already on the device came here to look at the result, and
            hiding the way to it behind a save they do not need is a dead end. */}
        <TextLink href="/energia">{t("energyLink")}</TextLink>

        <p aria-live="polite" className="text-sm">
          {status === "saved" ? (
            <span className="text-nd-dim">{t("saved")}</span>
          ) : null}
          {status === "saveFailed" ? (
            <span className="text-nd-red-ink">{t("saveError")}</span>
          ) : null}
          {/* Said here as well as at the field, because this is where the eye
              is when the button does not do what it was pressed to do. */}
          {status === "invalid" ? (
            <span className="text-nd-red-ink">{t("invalidForm")}</span>
          ) : null}
        </p>
      </div>

      {/* The follow-up § D10 left open: the health notice belongs beside the
          body-metrics input, not only in the footer where it is easy to walk
          past. */}
      <p className="text-xs text-nd-dim">
        {t("disclaimer")}{" "}
        <TextLink href="/saude" className="text-xs">
          {t("disclaimerLink")}
        </TextLink>
      </p>
    </form>
  );
}

/**
 * The select value that means "I will type the number myself".
 *
 * A word rather than a sentinel number, so it can never collide with a factor:
 * every real value in this field is a decimal string.
 */
const CUSTOM_ACTIVITY = "custom";

/**
 * The multiplier as pt-BR writes it — 1,375 rather than 1.375.
 *
 * Three fraction digits because that is what the ladder actually holds, and a
 * factor rendered as "1,38" beside a result computed from 1,375 is a small lie
 * that makes the arithmetic impossible to check by hand.
 */
function formatFactor(format: ReturnType<typeof useFormatter>, factor: number) {
  return format.number(factor, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 3,
  });
}

/** `undefined` rather than a throw — the date came from an input, not from us. */
function ageOrUndefined(birthDate: string, today: string): number | undefined {
  try {
    return ageYearsOn(birthDate, today);
  } catch {
    return undefined;
  }
}

function formatDay(format: ReturnType<typeof useFormatter>, day: string): string {
  // `timeZone: "UTC"` for the same reason as src/lib/legal.ts: the string is a
  // calendar day, `new Date` reads it as UTC midnight, and rendering that in
  // São Paulo prints the day before.
  return format.dateTime(new Date(`${day}T00:00:00Z`), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}
