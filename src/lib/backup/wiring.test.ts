import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import ptBR from "../../../messages/pt-BR.json";

import { DROP_KINDS, SNAPSHOT_ERRORS } from "./snapshot";

const ROOT = path.resolve(import.meta.dirname, "../../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(ROOT, relative), "utf8");

/**
 * The half of #26 that lives in the wiring rather than in the arithmetic.
 *
 * `snapshot.test.ts` and the rest cover what a file means; what is left is only
 * visible in the source and the catalogue — that every refusal and every
 * dropped record reaches the screen as a sentence, that the destructive
 * direction is behind a preview and a dialog, that the file never leaves the
 * device, and that the onboarding says where the data actually lives.
 *
 * Read rather than rendered, for the reason `src/lib/import/wiring.test.ts`
 * gives: next-intl resolves to its client build under Vitest.
 */
describe("backup wiring", () => {
  const panel = () => read("src/components/BackupPanel.tsx");
  const reminder = () => read("src/components/BackupReminder.tsx");
  const messages = ptBR.Backup.restore as Record<string, unknown>;

  it("has words for every reason a file can be refused", () => {
    // A missing key renders the key path. Someone whose only backup will not
    // open deserves a sentence telling them which kind of wrong it is, since
    // one of the three — a file from a newer version — is recoverable.
    const errors = messages.errors as Record<string, string>;

    expect(Object.keys(errors).sort()).toEqual([...SNAPSHOT_ERRORS].sort());
  });

  it("has words for every kind of record that can be dropped", () => {
    const drops = messages.drops as Record<string, string>;

    expect(Object.keys(drops).sort()).toEqual([...DROP_KINDS].sort());
  });

  it("shows the comparison before it offers the button", () => {
    // The issue asks for "preview before overwrite". The order in the source is
    // the order on screen: a summary rendered after the write is a receipt.
    const source = panel();

    expect(source.indexOf("<ReviewPanel")).toBeLessThan(
      source.indexOf("<ConfirmDialog"),
    );
    expect(source).toContain('tone="danger"');
  });

  it("never restores straight off a click", () => {
    // Every path to `apply` goes through `confirming`, which only the dialog's
    // own confirm can act on. The file picker must not write anything.
    const source = panel();

    expect(source).toContain("onRestore={() => setConfirming(true)}");
    expect(source).toContain("onConfirm={() => void apply(reviewing.snapshot)}");
    expect(source).not.toContain("onChange={() => void apply");
  });

  it("reads the file on the device and sends nothing", () => {
    // The one promise this app makes (#11): personal data does not leave the
    // browser. A backup screen is exactly where that would be easiest to break.
    const source = panel();

    expect(source).toContain("file.text()");
    expect(source).not.toContain("fetch(");
    expect(source).not.toMatch(/method:\s*"POST"/);
    expect(source).not.toContain("FormData");
  });

  it("writes through the repository rather than reaching for a store", () => {
    expect(panel()).toContain("restoreBackup(getRepository()");
    expect(panel()).not.toContain("dexie");
    expect(reminder()).not.toContain("dexie");
  });

  it("labels the file input itself, not the browser's control", () => {
    // Chrome writes "Choose File" / "No file chosen" in the *browser's* locale,
    // not the page's — a pt-BR page with English chrome in the middle of it.
    // Same fix as the CSV import: hide the input, label it ourselves.
    const source = panel();

    expect(source).toContain('className="peer sr-only"');
    expect(source).toContain("htmlFor={fileId}");
    expect(source).toContain('{chosen ?? t("restore.fileNone")}');
  });

  it("keeps the reminder off the page it points at", () => {
    // Being told to back up while standing on the backup screen reads as the
    // app not knowing where you are.
    const source = reminder();

    expect(source).toContain('const BACKUP_PATH = "/backup"');
    expect(source).toContain("pathname === BACKUP_PATH) return null");
  });

  it("mounts the reminder everywhere rather than on one screen", () => {
    // The prompt is only worth having if it finds people where they already
    // are, which is anywhere but here.
    expect(read("src/app/[locale]/layout.tsx")).toContain("<BackupReminder />");
  });

  it("says on the home screen that the data lives on this device", () => {
    // The issue's last condition, and the one that costs nothing to forget:
    // "onboarding states plainly that data lives on this device".
    const home = read("src/app/[locale]/page.tsx");

    expect(home).toContain('href="/backup"');
    expect(home).toContain('t("dataLocation")');
    expect(ptBR.Home.dataLocation).toContain("neste navegador");
  });
});
