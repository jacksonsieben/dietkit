"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { WeightEntryDialog } from "@/components/WeightEntryDialog";
import { WeightImportDialog } from "@/components/WeightImportDialog";
import { WeightTrend } from "@/components/WeightTrend";
import { Link } from "@/i18n/navigation";
import { calendarDate, todayIsoDate } from "@/lib/date";
import { getRepository } from "@/lib/storage";
import type { Id, WeightEntry } from "@/lib/storage/types";
import {
  entryOn,
  importWeightEntries,
  loadWeightLog,
  saveWeightEntry,
} from "@/lib/weight/log";
import type { WeightFormInput } from "@/lib/weight/validation";

/**
 * The weight log (#23): the trend on top, one row per day under it, and every
 * way of changing it behind a button (#57).
 *
 * A client component because these measurements exist only on the device that
 * wrote them — there is nothing for a server to render, and nothing it is
 * allowed to know.
 *
 * The form used to live permanently at the top of this page, which put three
 * empty boxes between the user and the thing they opened the page to see. It is
 * a modal now, and what is left here is the reading view plus the decisions that
 * are about the log rather than about any one form: which day is already taken,
 * what a save is allowed to overwrite, and what leaves the device (nothing).
 *
 * The trend (#24) is rendered from the same `entries` this component already
 * holds, rather than reading the store again — so the line moves the moment a
 * weighing is saved, and there is no second copy of the log to fall behind.
 */

type Status =
  | "loading"
  | "ready"
  | "saving"
  | "importing"
  | "savedNew"
  | "savedReplaced"
  | "imported"
  | "loadFailed"
  | "saveFailed"
  | "importFailed"
  | "removeFailed";

/**
 * The dialog on screen over the log, if there is one.
 *
 * One slot rather than a flag apiece: no two of these can be open at once, and
 * a union makes that unrepresentable instead of merely unlikely. Each variant
 * carries what its wording needs, so a dialog is written from the value that
 * opened it and cannot describe a row that has since changed.
 *
 * The entry form is deliberately not in here: `replace` opens *over* it, and
 * answering that question "não" has to put the user back in the form they
 * filled in rather than throw it away. So the form has its own slot, and this
 * one is what is stacked on top of it.
 */
type Open =
  | { kind: "import" }
  | { kind: "replace"; input: WeightFormInput; existing: WeightEntry }
  | { kind: "remove"; entry: WeightEntry };

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
  const [status, setStatus] = useState<Status>("loading");
  /** The day the last save landed on, for the confirmation line. */
  const [savedDate, setSavedDate] = useState<string | undefined>(undefined);
  /** What the last import did, for the same reason. */
  const [imported, setImported] = useState({ added: 0, replaced: 0 });
  const [open, setOpen] = useState<Open | undefined>(undefined);
  /**
   * The entry form, and the row it was opened from if it was opened by *Editar*.
   * A wrapper object rather than a bare `WeightEntry | undefined`, because
   * "closed" and "open on a new weighing" are different states.
   */
  const [form, setForm] = useState<{ entry?: WeightEntry } | undefined>(undefined);

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

  const existingDates = useMemo(
    () => new Set(entries.map((entry) => entry.date)),
    [entries],
  );

  const openForm = (entry?: WeightEntry) => {
    setForm({ entry });
    setStatus("ready");
  };

  const closeForm = () => {
    setForm(undefined);
    setOpen(undefined);
  };

  const submit = (input: WeightFormInput) => {
    // The day is a slot, so this save would take a measurement out of the log.
    // Ask first — and ask here rather than after writing, because there is
    // nothing to undo with once the old value is gone.
    const existing = entryOn(entries, input.date);
    if (existing !== undefined && existing.id !== form?.entry?.id) {
      setOpen({ kind: "replace", input, existing });
      return;
    }

    void save(input);
  };

  const save = async (input: WeightFormInput) => {
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
      closeForm();
      setStatus(replaced ? "savedReplaced" : "savedNew");
    } catch {
      setStatus("saveFailed");
    }
  };

  const runImport = async (rows: readonly WeightFormInput[]) => {
    setStatus("importing");

    try {
      const repository = getRepository();
      const counts = await importWeightEntries(
        repository,
        rows,
        new Date().toISOString(),
      );

      setEntries(await loadWeightLog(repository));
      setImported(counts);
      setOpen(undefined);
      setStatus("imported");
    } catch {
      setStatus("importFailed");
    }
  };

  const remove = async (id: Id) => {
    setOpen(undefined);

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

  const day = (date: string) =>
    format.dateTime(calendarDate(date), {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  return (
    <div className="flex flex-col gap-10">
      <WeightTrend entries={entries} />

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-sm font-semibold tracking-tight">{t("listTitle")}</h2>
            {entries.length === 0 ? null : (
              <p className="text-xs opacity-60">
                {t("listCount", { count: entries.length })}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => openForm()}
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
            >
              {t("add")}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen({ kind: "import" });
                setStatus("ready");
              }}
              className="rounded-md border border-black/15 px-4 py-2 text-sm dark:border-white/20"
            >
              {t("import.open")}
            </button>
          </div>
        </div>

        <p aria-live="polite" className="text-sm empty:hidden">
          {status === "savedNew" && savedDate !== undefined ? (
            <span className="opacity-70">{t("savedNew", { date: day(savedDate) })}</span>
          ) : null}
          {status === "savedReplaced" && savedDate !== undefined ? (
            <span className="opacity-70">
              {t("savedReplaced", { date: day(savedDate) })}
            </span>
          ) : null}
          {status === "imported" ? (
            <span className="opacity-70">
              {t("import.done", imported)}
            </span>
          ) : null}
          {status === "saveFailed" ? (
            <span className="text-red-700 dark:text-red-400">{t("saveError")}</span>
          ) : null}
          {status === "importFailed" ? (
            <span className="text-red-700 dark:text-red-400">
              {t("import.error")}
            </span>
          ) : null}
          {status === "removeFailed" ? (
            <span className="text-red-700 dark:text-red-400">{t("removeError")}</span>
          ) : null}
        </p>

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
                    onClick={() => openForm(entry)}
                    className="underline underline-offset-4"
                  >
                    {t("edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen({ kind: "remove", entry })}
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

      {/*
       * Kept mounted while the replace question is on screen, so answering it
       * "não" returns to the filled-in form rather than to an empty page.
       */}
      {form === undefined ? null : (
        <WeightEntryDialog
          today={today}
          entry={form.entry}
          saving={status === "saving"}
          onSubmit={submit}
          onClose={closeForm}
        />
      )}

      {open?.kind === "import" ? (
        <WeightImportDialog
          today={today}
          existingDates={existingDates}
          importing={status === "importing"}
          onImport={(rows) => void runImport(rows)}
          onClose={() => setOpen(undefined)}
        />
      ) : null}

      {open?.kind === "replace" ? (
        <ConfirmDialog
          title={t("replaceTitle", { date: day(open.input.date) })}
          confirmLabel={t("replaceConfirm")}
          cancelLabel={t("replaceCancel")}
          tone="danger"
          onConfirm={() => void save(open.input)}
          onCancel={() => setOpen(undefined)}
        >
          {t("replaceBody", {
            current: open.existing.weightKg,
            next: open.input.weightKg,
          })}
        </ConfirmDialog>
      ) : null}

      {open?.kind === "remove" ? (
        <ConfirmDialog
          title={t("removeTitle", { date: day(open.entry.date) })}
          confirmLabel={t("removeConfirm")}
          cancelLabel={t("removeCancel")}
          tone="danger"
          onConfirm={() => void remove(open.entry.id)}
          onCancel={() => setOpen(undefined)}
        >
          {t("removeBody", { weight: open.entry.weightKg })}
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
