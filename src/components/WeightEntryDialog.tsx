"use client";

import { useState, type FormEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { Field } from "@/components/Field";
import { Modal } from "@/components/Modal";
import { ActionButton, Ghost } from "@/components/nd/kit";
import { calendarDate } from "@/lib/date";
import type { WeightEntry } from "@/lib/storage/types";
import {
  WEIGHT_LIMITS,
  validateWeightForm,
  type WeightErrorCode,
  type WeightErrors,
  type WeightField,
  type WeightFormInput,
  type WeightFormValues,
} from "@/lib/weight/validation";

/**
 * Anotar or editing one weighing, in a modal of its own (#57).
 *
 * It used to sit permanently at the top of `/peso`, above the chart, which meant
 * the screen opened on three empty boxes and the user had to scroll past a form
 * they were not filling in to reach the line they came to look at. A weighing is
 * a ten-second errand done once a morning; the log is what the page is *for*.
 * So the form is now something you open, and the page underneath is the chart
 * and the rows.
 *
 * The values live here rather than in `WeightLog` because they die with the
 * dialog: opening it fresh should not show what was typed into it and abandoned
 * yesterday. What crosses back out is a validated `WeightFormInput` — the parent
 * decides what to do about a day that is already taken, since that question is
 * about the log rather than about this form.
 */

const ERROR_PARAMS: Partial<Record<WeightErrorCode, Record<string, number>>> = {
  weightRange: WEIGHT_LIMITS.weightKg,
  noteTooLong: { max: WEIGHT_LIMITS.noteChars },
};

/** Renders a stored number the way pt-BR writes one, for editing. */
function toField(value: number): string {
  return String(value).replace(".", ",");
}

export function WeightEntryDialog({
  today,
  entry,
  saving,
  onSubmit,
  onClose,
}: {
  today: string;
  /** The row whose *Editar* opened this, if it was not opened empty. */
  entry?: WeightEntry;
  saving: boolean;
  onSubmit: (input: WeightFormInput) => void;
  onClose: () => void;
}) {
  const t = useTranslations("Weight");
  const format = useFormatter();

  const [values, setValues] = useState<WeightFormValues>(() =>
    entry === undefined
      ? { date: today, weightKg: "", note: "" }
      : {
          date: entry.date,
          weightKg: toField(entry.weightKg),
          note: entry.note ?? "",
        },
  );
  const [errors, setErrors] = useState<WeightErrors>({});

  const update = (field: WeightField) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!(field in current)) return current;
      const { [field]: _cleared, ...rest } = current;
      return rest;
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = validateWeightForm(values, today);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setErrors({});
    onSubmit(result.value);
  };

  const messageFor = (code: WeightErrorCode) =>
    t(`errors.${code}`, ERROR_PARAMS[code]);

  return (
    <Modal
      title={
        entry === undefined
          ? t("formTitle")
          : t("editTitle", {
              date: format.dateTime(calendarDate(entry.date), {
                day: "numeric",
                month: "long",
                year: "numeric",
              }),
            })
      }
      wide
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label={t("dateLabel")}
            hint={t("dateHint")}
            error={errors.date && messageFor(errors.date)}
          >
            {(props) => (
              <input
                {...props}
                type="date"
                max={today}
                value={values.date}
                onChange={(event) => update("date")(event.target.value)}
              />
            )}
          </Field>

          <Field
            label={t("weightLabel")}
            hint={t("weightHint")}
            error={errors.weightKg && messageFor(errors.weightKg)}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                /*
                 * The one box the user came here to fill in. Focused rather
                 * than the date, which is already right on the overwhelmingly
                 * common day — today — and would cost a Tab every morning.
                 *
                 * Read by `Modal` after `showModal()`, not by React: `autoFocus`
                 * runs during commit and is then overruled by the dialog, which
                 * focuses the first control — the date — instead.
                 */
                data-autofocus
                value={values.weightKg}
                onChange={(event) => update("weightKg")(event.target.value)}
              />
            )}
          </Field>
        </div>

        <Field
          label={t("noteLabel")}
          hint={t("noteHint")}
          error={errors.note && messageFor(errors.note)}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              autoComplete="off"
              maxLength={WEIGHT_LIMITS.noteChars}
              value={values.note}
              onChange={(event) => update("note")(event.target.value)}
            />
          )}
        </Field>

        {/*
          Cancel first in the DOM, so `showModal()`'s focus does not land on the
          save — but `data-autofocus` on the weight box moves it there anyway,
          which is the right answer for a form: the reader opened this to type a
          number, not to answer a question.
        */}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Ghost type="button" onClick={onClose}>
            {t("cancel")}
          </Ghost>

          <ActionButton type="submit" disabled={saving}>
            {saving ? t("saving") : t("save")}
          </ActionButton>
        </div>
      </form>
    </Modal>
  );
}
