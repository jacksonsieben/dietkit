"use client";

import { useCallback, useEffect, useId, useState, type ChangeEvent } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FileField } from "@/components/nd/FileField";
import { ActionButton, Legend, Rule } from "@/components/nd/kit";
import {
  BACKUP_ACCEPT,
  BACKUP_MIME,
  backupFilename,
} from "@/lib/backup/file";
import {
  describeSnapshot,
  parseSnapshotFile,
  type Drop,
  type SnapshotError,
  type SnapshotSummary,
} from "@/lib/backup/snapshot";
import { exportBackup, restoreBackup } from "@/lib/backup/store";
import { getRepository } from "@/lib/storage";
import type { Settings, Snapshot } from "@/lib/storage/types";

/**
 * The screen where the only copy of everything gets made, and put back (#26).
 *
 * This app keeps every personal record in one browser's IndexedDB and sends
 * none of it anywhere (docs/DECISIONS.md § D1). That is the right trade for
 * privacy and the wrong one for durability, and the whole of the second half is
 * paid for here: a file the user can hold, and a way back from it. Without this
 * screen, "clear site data" is a feature that destroys a year of logs.
 *
 * Restore is the dangerous direction, so it is built the long way round: read
 * the file, say what is in it *next to* what is on the device, list what could
 * not be read, and only then offer a button — behind a dialog. Nobody should
 * discover that a restore replaces rather than merges by having it happen.
 */

/** How many unreadable records are named before the rest become a number. */
const DROPS_SHOWN = 5;

type Exporting =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "done"; name: string }
  | { kind: "failed" };

type Restoring =
  | { kind: "choosing" }
  | { kind: "reading" }
  | { kind: "unreadable" }
  | { kind: "invalid"; error: SnapshotError; version?: number }
  | { kind: "reviewing"; snapshot: Snapshot; drops: readonly Drop[] }
  | { kind: "saving" }
  | { kind: "done" }
  | { kind: "failed" };

/**
 * Hands the file to the user, by whichever route this device actually has.
 *
 * The share sheet first, because on a phone it is the only route that ends
 * somewhere the user will find the file again — Drive, WhatsApp, Arquivos —
 * whereas a download on iOS lands in a folder many people have never opened. On
 * a desktop, or anywhere the share sheet cannot take files, the anchor is both
 * the fallback and the better answer.
 *
 * A cancelled share sheet throws `AbortError`, which is a user saying no rather
 * than a failure; it is reported as success because from the app's side nothing
 * went wrong, and the alternative — an error message after a deliberate
 * cancel — is the kind of thing that makes people stop trusting the button.
 */
async function deliver(text: string, name: string): Promise<void> {
  const file = new File([text], name, { type: BACKUP_MIME });

  if (
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // Anything else — a permissions policy, an OS-level refusal — falls
      // through to the download, which is the whole point of having two.
    }
  }

  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  // Freed on the next turn rather than immediately: revoking before the browser
  // has started reading the blob cancels the download in some of them.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function Row({
  label,
  device,
  file,
}: {
  label: string;
  device: string;
  file: string;
}) {
  return (
    <tr className="border-t border-nd-unlit">
      <th scope="row" className="py-1.5 pr-3 text-left font-normal">
        {label}
      </th>
      {/* `data-numeric` rather than `tabular-nums`: the figures are what make
          this a comparison, and the rule that lines them up lives in one place
          in globals.css so every table in the app agrees about it. */}
      <td className="py-1.5 pr-3 text-nd-dim" data-numeric>
        {device}
      </td>
      <td className="py-1.5 font-medium" data-numeric>
        {file}
      </td>
    </tr>
  );
}

export function BackupPanel() {
  const t = useTranslations("Backup");
  const format = useFormatter();

  const [device, setDevice] = useState<
    { summary: SnapshotSummary; settings: Settings } | undefined
  >(undefined);
  const [exporting, setExporting] = useState<Exporting>({ kind: "idle" });
  const [restore, setRestore] = useState<Restoring>({ kind: "choosing" });
  const [confirming, setConfirming] = useState(false);
  const fileId = useId();

  /**
   * The device's own summary, re-read after anything that changes it. Reading
   * the whole store to count six things is not free, but it is the only way to
   * be sure the numbers on the left of the comparison are the ones a restore
   * would actually replace.
   */
  const read = useCallback(async () => {
    const repository = getRepository();
    const [snapshot, settings] = await Promise.all([
      repository.exportAll(),
      repository.settings.get(),
    ]);
    return { summary: describeSnapshot(snapshot), settings };
  }, []);

  /** After anything that changed the store, so the comparison stays honest. */
  const reload = useCallback(async () => {
    setDevice(await read());
  }, [read]);

  useEffect(() => {
    // The answer arrives a tick after the render that asked for it, so it is
    // dropped if the panel has gone by then. Nothing renders until it lands,
    // which is also what keeps server and client agreeing: the numbers live in
    // IndexedDB, which the server has no view of.
    let live = true;

    void (async () => {
      const next = await read();
      if (live) setDevice(next);
    })();

    return () => {
      live = false;
    };
  }, [read]);

  const download = async () => {
    setExporting({ kind: "working" });
    try {
      const name = backupFilename(new Date());
      const { text } = await exportBackup(
        getRepository(),
        new Date().toISOString(),
      );
      await deliver(text, name);
      setExporting({ kind: "done", name });
      await reload();
    } catch {
      setExporting({ kind: "failed" });
    }
  };

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file === undefined) return;

    setRestore({ kind: "reading" });

    void (async () => {
      let text: string;
      try {
        text = await file.text();
      } catch {
        setRestore({ kind: "unreadable" });
        return;
      }

      const parse = parseSnapshotFile(text);
      setRestore(
        parse.ok
          ? { kind: "reviewing", snapshot: parse.snapshot, drops: parse.drops }
          : { kind: "invalid", error: parse.error, ...(parse.version === undefined ? {} : { version: parse.version }) },
      );
    })();
  };

  const apply = async (snapshot: Snapshot) => {
    setConfirming(false);
    setRestore({ kind: "saving" });
    try {
      await restoreBackup(getRepository(), snapshot, new Date().toISOString());
      setRestore({ kind: "done" });
      setExporting({ kind: "idle" });
      await reload();
    } catch {
      setRestore({ kind: "failed" });
    }
  };

  const day = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "long" });

  const yesNo = (value: boolean) => (value ? t("restore.yes") : t("restore.no"));

  const weightCell = (summary: SnapshotSummary) =>
    summary.weightFrom === undefined || summary.weightTo === undefined
      ? t("restore.count", { count: summary.weight })
      : t("restore.weightWithRange", {
          count: summary.weight,
          from: day(`${summary.weightFrom}T12:00:00.000Z`),
          to: day(`${summary.weightTo}T12:00:00.000Z`),
        });

  const empty =
    device !== undefined &&
    device.summary.weight === 0 &&
    device.summary.diets === 0 &&
    device.summary.customFoods === 0 &&
    device.summary.groups === 0 &&
    !device.summary.hasTraining &&
    !device.summary.hasProfile;

  const reviewing = restore.kind === "reviewing" ? restore : undefined;

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("export.heading")}</Legend>
        <p className="text-sm leading-relaxed text-nd-dim">{t("export.body")}</p>

        {device === undefined ? null : (
          <p className="text-xs text-nd-dim">
            {device.settings.lastBackupAt === undefined
              ? t("export.lastNever")
              : t("export.lastAt", { date: day(device.settings.lastBackupAt) })}
          </p>
        )}

        {empty ? (
          <p className="text-sm text-nd-dim">{t("export.empty")}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <ActionButton
            type="button"
            onClick={download}
            disabled={
              exporting.kind === "working" || device === undefined || empty
            }
          >
            {exporting.kind === "working"
              ? t("export.working")
              : t("export.action")}
          </ActionButton>
        </div>

        {/*
          Announced rather than merely drawn: the button that started this is
          where the eye already is, and on a phone the message lands below it.

          A finished export is not drawn in green. This world has one colour
          besides ink, it means a number is off target, and a second colour for
          "fine" would make the absence of green start to read as a warning on
          every other screen. Success is a sentence in ink; only the failure
          takes red, because a backup that did not happen is a real fault.
        */}
        <p aria-live="polite" className="text-sm">
          {exporting.kind === "done" ? (
            <span>{t("export.done", { name: exporting.name })}</span>
          ) : null}
          {exporting.kind === "failed" ? (
            <span className="text-nd-red-ink">{t("export.failed")}</span>
          ) : null}
        </p>
      </section>

      <Rule />

      <section className="flex flex-col gap-3">
        <Legend as="h2">{t("restore.heading")}</Legend>
        <p className="text-sm leading-relaxed text-nd-dim">
          {t("restore.body")}
        </p>

        <FileField
          id={fileId}
          accept={BACKUP_ACCEPT}
          label={t("restore.fileLabel")}
          hint={t("restore.fileHint")}
          action={t("restore.fileAction")}
          empty={t("restore.fileEmpty")}
          onChange={pick}
        />

        <div aria-live="polite" className="flex flex-col gap-3">
          {restore.kind === "reading" ? (
            <p className="text-sm text-nd-dim">{t("restore.reading")}</p>
          ) : null}

          {restore.kind === "unreadable" ? (
            <p className="text-sm text-nd-red-ink">{t("restore.readError")}</p>
          ) : null}

          {restore.kind === "invalid" ? (
            <p className="text-sm text-nd-red-ink">
              {t(`restore.errors.${restore.error}`)}
            </p>
          ) : null}

          {restore.kind === "saving" ? (
            <p className="text-sm text-nd-dim">{t("restore.working")}</p>
          ) : null}

          {restore.kind === "done" ? (
            <p className="text-sm">{t("restore.done")}</p>
          ) : null}

          {restore.kind === "failed" ? (
            <p className="text-sm text-nd-red-ink">{t("restore.failed")}</p>
          ) : null}
        </div>

        {reviewing === undefined || device === undefined ? null : (
          <ReviewPanel
            file={describeSnapshot(reviewing.snapshot)}
            device={device.summary}
            drops={reviewing.drops}
            day={day}
            yesNo={yesNo}
            weightCell={weightCell}
            onRestore={() => setConfirming(true)}
          />
        )}
      </section>

      {confirming && reviewing !== undefined ? (
        <ConfirmDialog
          title={t("restore.confirmTitle")}
          confirmLabel={t("restore.confirmAction")}
          cancelLabel={t("restore.confirmCancel")}
          tone="danger"
          onConfirm={() => void apply(reviewing.snapshot)}
          onCancel={() => setConfirming(false)}
        >
          {t("restore.confirmBody")}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

/**
 * The file and the device, side by side.
 *
 * A table rather than two paragraphs, because the question the user is actually
 * asking is a comparison — "is this the newer one?" — and a comparison is read
 * across a row. The device column is dimmed and the file column is not: what is
 * about to arrive is the thing being decided about.
 */
function ReviewPanel({
  file,
  device,
  drops,
  day,
  yesNo,
  weightCell,
  onRestore,
}: {
  file: SnapshotSummary;
  device: SnapshotSummary;
  drops: readonly Drop[];
  day: (iso: string) => string;
  yesNo: (value: boolean) => string;
  weightCell: (summary: SnapshotSummary) => string;
  onRestore: () => void;
}) {
  const t = useTranslations("Backup.restore");

  return (
    <div className="flex flex-col gap-4 border-t border-nd-unlit pt-4">
      <p className="text-sm text-nd-dim">
        {file.exportedAt === undefined
          ? t("exportedUnknown")
          : t("exportedAt", { date: day(file.exportedAt) })}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("compare")}</caption>
          <thead>
            <tr className="text-xs font-medium tracking-[0.22em] text-nd-dim uppercase">
              <th scope="col" className="pb-1 pr-3 text-left font-medium">
                {t("compare")}
              </th>
              <th scope="col" className="pb-1 pr-3 text-left font-medium">
                {t("device")}
              </th>
              <th scope="col" className="pb-1 text-left font-medium">
                {t("file")}
              </th>
            </tr>
          </thead>
          <tbody>
            <Row
              label={t("rows.profile")}
              device={yesNo(device.hasProfile)}
              file={yesNo(file.hasProfile)}
            />
            <Row
              label={t("rows.goal")}
              device={yesNo(device.hasGoal)}
              file={yesNo(file.hasGoal)}
            />
            <Row
              label={t("rows.weight")}
              device={weightCell(device)}
              file={weightCell(file)}
            />
            <Row
              label={t("rows.diets")}
              device={t("count", { count: device.diets })}
              file={t("count", { count: file.diets })}
            />
            <Row
              label={t("rows.customFoods")}
              device={t("count", { count: device.customFoods })}
              file={t("count", { count: file.customFoods })}
            />
            <Row
              label={t("rows.groups")}
              device={t("count", { count: device.groups })}
              file={t("count", { count: file.groups })}
            />
            <Row
              label={t("rows.training")}
              device={yesNo(device.hasTraining)}
              file={yesNo(file.hasTraining)}
            />
          </tbody>
        </table>
      </div>

      {drops.length === 0 ? null : (
        <div className="flex flex-col gap-1">
          {/*
            What the file cannot carry over. Red, because this is the one thing
            on the screen that is genuinely off — data that exists now and will
            not exist after the button below is pressed.
          */}
          <p className="text-sm text-nd-red-ink">
            {t("dropsHeading", { count: drops.length })}
          </p>
          {/* Named one by one, in the order the file had them: "3 registros"
              tells nobody whether the missing one was last Tuesday's weight or
              their only diet. */}
          <ul className="flex flex-col gap-0.5 text-xs text-nd-dim">
            {drops.slice(0, DROPS_SHOWN).map((drop, index) => (
              <li key={`${drop.kind}-${drop.subject ?? index}`}>
                {drop.subject === undefined
                  ? t(`drops.${drop.kind}`)
                  : t("dropNamed", {
                      what: t(`drops.${drop.kind}`),
                      subject: drop.subject,
                    })}
              </li>
            ))}
            {drops.length > DROPS_SHOWN ? (
              <li>{t("dropsMore", { count: drops.length - DROPS_SHOWN })}</li>
            ) : null}
          </ul>
        </div>
      )}

      {/*
        Not a red button. Restoring is what the reader came to this screen to
        do — it is the intention, so it is the filled block, the same one every
        other screen uses for the thing it is for. The confirmation it opens is
        where the cost gets stated, and that dialog draws *Manter* as the filled
        answer, which is where the hesitation belongs.
      */}
      <div className="flex justify-end">
        <ActionButton type="button" onClick={onRestore}>
          {t("action")}
        </ActionButton>
      </div>
    </div>
  );
}
