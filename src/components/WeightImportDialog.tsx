"use client";

import { useId, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";

import { Modal } from "@/components/Modal";
import { FileField } from "@/components/nd/FileField";
import { ActionButton, Ghost } from "@/components/nd/kit";
import type { IsoDate } from "@/lib/storage/types";
import {
  parseWeightCsv,
  type CsvSkipReason,
  type WeightCsvResult,
} from "@/lib/weight/csv";
import { WEIGHT_LIMITS, type WeightFormInput } from "@/lib/weight/validation";

/**
 * Bringing a weight history in from a spreadsheet (#57).
 *
 * The trend line is worth nothing on a log that starts today, and nobody is
 * going to type two hundred mornings into a form. Most people already have the
 * history somewhere — a planilha, a download from the app they used before — so
 * this is the door for it.
 *
 * Nothing is written until the user has seen what would be. The file is parsed
 * in the browser, the counts and the rejected lines are shown, and only then is
 * there a button that saves: picking the wrong file out of a folder should cost
 * a glance rather than a restore. The parsing itself is `lib/weight/csv.ts`,
 * where it can be tested against the files people actually have.
 */

const REASON_PARAMS: Partial<Record<CsvSkipReason, Record<string, number>>> = {
  weightRange: WEIGHT_LIMITS.weightKg,
  noteTooLong: { max: WEIGHT_LIMITS.noteChars },
};

/**
 * How many rejected lines are listed before the rest become a number.
 *
 * A file where every row was rejected is a file with the wrong columns, and
 * printing two hundred identical complaints does not make that clearer than
 * printing six of them does.
 */
const SKIPS_SHOWN = 6;

type Reading =
  | { kind: "idle" }
  | { kind: "reading"; name: string }
  | { kind: "unreadable" }
  | { kind: "parsed"; name: string; result: WeightCsvResult };

export function WeightImportDialog({
  today,
  existingDates,
  importing,
  onImport,
  onClose,
}: {
  today: IsoDate;
  /** The days already in the log, so the preview can say what it would take. */
  existingDates: ReadonlySet<string>;
  importing: boolean;
  onImport: (rows: readonly WeightFormInput[]) => void;
  onClose: () => void;
}) {
  const t = useTranslations("Weight.import");
  const errors = useTranslations("Weight.import.reasons");

  const [reading, setReading] = useState<Reading>({ kind: "idle" });
  const fileId = useId();

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file === undefined) return;

    setReading({ kind: "reading", name: file.name });

    void (async () => {
      try {
        // `File.text()` rather than a `FileReader`: this never leaves the page,
        // and the file is a few kilobytes of numbers.
        const text = await file.text();
        setReading({
          kind: "parsed",
          name: file.name,
          result: parseWeightCsv(text, today),
        });
      } catch {
        setReading({ kind: "unreadable" });
      }
    })();
  };

  const parse =
    reading.kind === "parsed" && reading.result.ok
      ? reading.result.parse
      : undefined;

  const replacing =
    parse?.rows.filter((row) => existingDates.has(row.date)).length ?? 0;

  return (
    <Modal title={t("title")} wide onClose={onClose}>
      <p className="text-sm leading-relaxed text-nd-dim">{t("lead")}</p>

      <FileField
        id={fileId}
        accept=".csv,.txt,text/csv,text/plain"
        label={t("fileLabel")}
        hint={t("fileHint")}
        action={t("fileAction")}
        empty={t("fileEmpty")}
        onChange={pick}
      />

      {reading.kind === "reading" ? (
        <p className="text-sm text-nd-dim">{t("reading")}</p>
      ) : null}

      {reading.kind === "unreadable" ? (
        <p className="text-sm text-nd-red-ink">{t("readError")}</p>
      ) : null}

      {reading.kind === "parsed" && !reading.result.ok ? (
        <p className="text-sm text-nd-red-ink">
          {t(`fileErrors.${reading.result.error}`)}
        </p>
      ) : null}

      {/*
        The preview is a ruled block, not a card. What separates it from the
        paragraphs above is a hairline and the space either side of it — the
        same device the rest of the app uses to say "this is a different kind of
        thing", and one that costs nothing on either ground.
      */}
      {parse === undefined ? null : (
        <div className="flex flex-col gap-3 border-t border-nd-unlit pt-4 text-sm">
          <p className="font-medium">
            {parse.rows.length === 0
              ? t("nothing")
              : t("ready", { count: parse.rows.length })}
          </p>

          {replacing === 0 ? null : (
            /*
             * The one thing in this preview that costs something, and the one
             * place red is right: these days are already measured and the file
             * is about to overwrite them. Red here means a value is off, which
             * is exactly the claim.
             */
            <p className="text-nd-red-ink">
              {t("replacing", { count: replacing })}
            </p>
          )}

          {parse.skipped.length === 0 ? null : (
            <div className="flex flex-col gap-1">
              <p className="text-nd-dim">
                {t("skipped", { count: parse.skipped.length })}
              </p>
              <ul className="flex flex-col gap-0.5 text-xs text-nd-dim">
                {parse.skipped.slice(0, SKIPS_SHOWN).map((skip) => (
                  <li key={skip.line}>
                    {t("skippedLine", {
                      line: skip.line,
                      reason: errors(skip.reason, REASON_PARAMS[skip.reason]),
                    })}
                  </li>
                ))}
                {parse.skipped.length > SKIPS_SHOWN ? (
                  <li>
                    {t("skippedMore", {
                      count: parse.skipped.length - SKIPS_SHOWN,
                    })}
                  </li>
                ) : null}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Ghost type="button" onClick={onClose}>
          {t("cancel")}
        </Ghost>

        <ActionButton
          type="button"
          // Nothing to import is not an error to be announced after the click.
          disabled={parse === undefined || parse.rows.length === 0 || importing}
          onClick={() => parse && onImport(parse.rows)}
        >
          {importing
            ? t("importing")
            : t("confirm", { count: parse?.rows.length ?? 0 })}
        </ActionButton>
      </div>
    </Modal>
  );
}
