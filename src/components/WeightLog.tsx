"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Field } from "@/components/Field";
import { Link } from "@/i18n/navigation";
import { calendarDate, todayIsoDate } from "@/lib/date";
import { getRepository } from "@/lib/storage";
import type { Id, WeightEntry } from "@/lib/storage/types";
import { entryOn, loadWeightLog, saveWeightEntry } from "@/lib/weight/log";
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
 * The weight log (#23): one row per day, editable and backfillable.
 *
 * A client component because these measurements exist only on the device that
 * wrote them — there is nothing for a server to render, and nothing it is
 * allowed to know.
 *
 * The form and the list are one component because editing joins them: pressing
 * *Editar* on a row fills the boxes above. Saving onto a day that already has a
 * weight is the other half of that: a day is a slot, not a stack, so the old
 * value is replaced — and because that is a loss, it is asked about in a
 * `ConfirmDialog` rather than mentioned in advance and then done anyway.
 */

const ERROR_PARAMS: Partial<Record<WeightErrorCode, Record<string, number>>> = {
  weightRange: WEIGHT_LIMITS.weightKg,
  noteTooLong: { max: WEIGHT_LIMITS.noteChars },
};

type Status =
  | "loading"
  | "ready"
  | "saving"
  | "savedNew"
  | "savedReplaced"
  | "loadFailed"
  | "saveFailed"
  | "removeFailed";

function emptyForm(today: string): WeightFormValues {
  return { date: today, weightKg: "", note: "" };
}

/**
 * The question on screen, if one is being asked.
 *
 * One slot rather than a flag per dialog: two of these can never be true at
 * once, and a union makes that unrepresentable instead of merely unlikely. Each
 * variant carries what its wording needs, so the dialog is written from the
 * value that opened it and cannot describe a row that has since changed.
 */
type Pending =
  | { kind: "replace"; input: WeightFormInput; existing: WeightEntry }
  | { kind: "remove"; entry: WeightEntry };

/** Renders a stored number the way pt-BR writes one — see `toField`. */
function toField(value: number): string {
  return String(value).replace(".", ",");
}

export function WeightLog() {
  const t = useTranslations("Weight");
  const format = useFormatter();

  /**
   * Read once, on mount, rather than on every render. The component would
   * otherwise change what "today" means underneath a form left open past
   * midnight, moving the entry the user is filling in to a different day.
   */
  const [today] = useState(() => todayIsoDate());

  const [entries, setEntries] = useState<readonly WeightEntry[]>([]);
  const [values, setValues] = useState<WeightFormValues>(() => emptyForm(today));
  const [errors, setErrors] = useState<WeightErrors>({});
  const [status, setStatus] = useState<Status>("loading");
  /** The day the last save landed on, for the confirmation line. */
  const [savedDate, setSavedDate] = useState<string | undefined>(undefined);
  /**
   * The row whose *Editar* filled the boxes, if any.
   *
   * Separate from "the day in the box already has an entry", which is true the
   * moment the screen opens on a day that was logged this morning — and a
   * heading reading "Editando…" over three empty boxes is a lie the user has to
   * work out for themselves. This is the narrower fact: a row was picked.
   */
  const [editing, setEditing] = useState<WeightEntry | undefined>(undefined);
  const [pending, setPending] = useState<Pending | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const stored = await loadWeightLog(getRepository());
        if (cancelled) return;

        setEntries(stored);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("loadFailed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const update = (field: WeightField) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    // Moving the date makes this a different day's entry, whatever row it
    // started as, so the heading stops claiming to be editing the old one.
    if (field === "date") setEditing(undefined);
    setErrors((current) => {
      if (!(field in current)) return current;
      const { [field]: _cleared, ...rest } = current;
      return rest;
    });
    setStatus((current) =>
      current === "savedNew" || current === "savedReplaced" ? "ready" : current,
    );
  };

  const startEditing = (entry: WeightEntry) => {
    setValues({
      date: entry.date,
      weightKg: toField(entry.weightKg),
      note: entry.note ?? "",
    });
    setErrors({});
    setEditing(entry);
    setStatus("ready");
  };

  const reset = () => {
    setValues(emptyForm(today));
    setErrors({});
    setEditing(undefined);
    setStatus("ready");
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = validateWeightForm(values, today);
    if (!result.ok) {
      setErrors(result.errors);
      setStatus("ready");
      return;
    }

    setErrors({});

    // The day is a slot, so this save would take a measurement out of the log.
    // Ask first — and ask here rather than after writing, because there is
    // nothing to undo with once the old value is gone.
    const existing = entryOn(entries, result.value.date);
    if (existing !== undefined) {
      setPending({ kind: "replace", input: result.value, existing });
      return;
    }

    void save(result.value);
  };

  const save = async (input: WeightFormInput) => {
    setPending(undefined);
    setStatus("saving");

    try {
      const repository = getRepository();
      const { replaced } = await saveWeightEntry(
        repository,
        input,
        new Date().toISOString(),
      );

      // Re-read rather than splice: the order is the store's business, and a
      // list kept in step by hand would drift the first time a backfilled day
      // landed in the middle of it.
      setEntries(await loadWeightLog(repository));
      setSavedDate(input.date);
      setValues(emptyForm(today));
      setEditing(undefined);
      setStatus(replaced ? "savedReplaced" : "savedNew");
    } catch {
      setStatus("saveFailed");
    }
  };

  const remove = async (id: Id) => {
    setPending(undefined);

    try {
      const repository = getRepository();
      await repository.weight.remove(id);
      setEntries(await loadWeightLog(repository));
      setStatus("ready");
    } catch {
      setStatus("removeFailed");
    }
  };

  if (status === "loading") {
    return <p className="text-sm opacity-60">{t("loading")}</p>;
  }

  if (status === "loadFailed") {
    return <p className="text-sm text-red-700 dark:text-red-400">{t("loadError")}</p>;
  }

  const messageFor = (code: WeightErrorCode) => t(`errors.${code}`, ERROR_PARAMS[code]);

  const day = (date: string) =>
    format.dateTime(calendarDate(date), {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  return (
    <div className="flex flex-col gap-10">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <h2 className="text-sm font-semibold tracking-tight">
          {editing === undefined
            ? t("formTitle")
            : t("editTitle", { date: day(editing.date) })}
        </h2>

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

        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={status === "saving"}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {status === "saving" ? t("saving") : t("save")}
          </button>

          {values.date === today &&
          values.weightKg === "" &&
          values.note === "" ? null : (
            <button
              type="button"
              onClick={reset}
              className="text-sm underline underline-offset-4"
            >
              {t("cancel")}
            </button>
          )}

          <p aria-live="polite" className="text-sm">
            {status === "savedNew" && savedDate !== undefined ? (
              <span className="opacity-70">{t("savedNew", { date: day(savedDate) })}</span>
            ) : null}
            {status === "savedReplaced" && savedDate !== undefined ? (
              <span className="opacity-70">
                {t("savedReplaced", { date: day(savedDate) })}
              </span>
            ) : null}
            {status === "saveFailed" ? (
              <span className="text-red-700 dark:text-red-400">{t("saveError")}</span>
            ) : null}
            {status === "removeFailed" ? (
              <span className="text-red-700 dark:text-red-400">{t("removeError")}</span>
            ) : null}
          </p>
        </div>
      </form>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">{t("listTitle")}</h2>
          {entries.length === 0 ? null : (
            <p className="text-xs opacity-60">{t("listCount", { count: entries.length })}</p>
          )}
        </div>

        {entries.length === 0 ? (
          <p className="text-sm opacity-70">{t("listEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 rounded-md border border-black/10 px-4 py-3 dark:border-white/15"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-medium">
                    {t("entryWeight", { weight: entry.weightKg })}
                  </p>
                  <p className="text-xs opacity-60">
                    {[day(entry.date), entry.note, backfilledOn(entry, t, day)]
                      .filter((part) => part !== undefined)
                      .join(" · ")}
                  </p>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  <button
                    type="button"
                    onClick={() => startEditing(entry)}
                    className="underline underline-offset-4"
                  >
                    {t("edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPending({ kind: "remove", entry })}
                    className="underline underline-offset-4 opacity-70"
                  >
                    {t("remove")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-60">
          <Link href="/perfil" className="underline underline-offset-4">
            {t("profileLink")}
          </Link>
          <Link href="/energia" className="underline underline-offset-4">
            {t("energyLink")}
          </Link>
        </p>
      </section>

      {pending?.kind === "replace" ? (
        <ConfirmDialog
          title={t("replaceTitle", { date: day(pending.input.date) })}
          confirmLabel={t("replaceConfirm")}
          cancelLabel={t("replaceCancel")}
          tone="danger"
          onConfirm={() => void save(pending.input)}
          onCancel={() => setPending(undefined)}
        >
          {t("replaceBody", {
            current: pending.existing.weightKg,
            next: pending.input.weightKg,
          })}
        </ConfirmDialog>
      ) : null}

      {pending?.kind === "remove" ? (
        <ConfirmDialog
          title={t("removeTitle", { date: day(pending.entry.date) })}
          confirmLabel={t("removeConfirm")}
          cancelLabel={t("removeCancel")}
          tone="danger"
          onConfirm={() => void remove(pending.entry.id)}
          onCancel={() => setPending(undefined)}
        >
          {t("removeBody", { weight: pending.entry.weightKg })}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

/**
 * "Anotado depois, em …", when the entry was typed on a different day than the
 * one it measures.
 *
 * Only then: on an entry logged the same morning it happened, the two dates are
 * the same fact printed twice. On a backfilled one they are genuinely different
 * — and knowing a weight was filled in from memory a week later is part of
 * reading it honestly.
 */
function backfilledOn(
  entry: WeightEntry,
  t: (key: "backfilled", values: { date: string }) => string,
  day: (date: string) => string,
): string | undefined {
  const typedOn = todayIsoDate(new Date(entry.recordedAt));
  if (typedOn === entry.date) return undefined;

  return t("backfilled", { date: day(typedOn) });
}
