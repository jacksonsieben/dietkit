import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { TABS } from "@/lib/nav/tabs";

import ptBR from "../../../messages/pt-BR.json";
import { CSV_ERROR_CODES } from "./csv";
import { WEIGHT_ERROR_CODES } from "./validation";

const ROOT = path.resolve(import.meta.dirname, "../../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(ROOT, relative), "utf8");

/**
 * The parts of #23 that are about how the pieces are wired rather than about
 * what any one of them computes. Components cannot be rendered here —
 * `next-intl/server` resolves to its client build under Vitest — so the source
 * is read instead, and each check is written to fail if the thing it names is
 * removed rather than merely moved.
 */
describe("weight log wiring", () => {
  it("has a message for every way an entry can be rejected", () => {
    // next-intl renders the key path when a message is missing, so a new code
    // ships as "Weight.errors.xyz" in red under an input.
    for (const code of WEIGHT_ERROR_CODES) {
      expect(ptBR.Weight.errors, `no message for ${code}`).toHaveProperty(code);
    }
  });

  it("has no message left over for a code nothing can produce", () => {
    expect(Object.keys(ptBR.Weight.errors).sort()).toEqual(
      [...WEIGHT_ERROR_CODES].sort(),
    );
  });

  it("asks before saving over an existing day, and does not save until told", () => {
    // The defined duplicate-date behaviour is "the day is a slot": choosing an
    // occupied one replaces what is in it. A user who is not asked is one who
    // loses a measurement to a keystroke.
    const source = read("src/components/WeightLog.tsx");

    const submit = source.slice(source.indexOf("const submit ="));
    const body = submit.slice(0, submit.indexOf("const save"));

    // The occupied day is found before anything is written…
    expect(body).toContain("entryOn(entries, input.date)");

    // …and everything between finding it and the save is the branch that opens
    // the question and leaves. Sliced up to `void save(` rather than to the
    // first `return`, which would be the invalid-input one above and would pass
    // no matter what this branch did.
    const occupied = body.slice(
      body.indexOf("if (existing !== undefined"),
      body.indexOf("void save("),
    );

    expect(occupied).toContain('kind: "replace"');
    expect(occupied).toContain("return;");

    // …but not when the occupied day is the row being edited. Asking "trocar os
    // 82,4 kg do dia 17 pelos 82,4 kg do dia 17?" is a question about nothing,
    // and it would be asked on every correction anyone ever makes.
    expect(occupied).toContain("existing.id !== form?.entry?.id");
  });

  it("quotes both weights in the question, not just the new one", () => {
    // "Substituir?" with no numbers in it is a question about nothing. The
    // decision is whether the value on screen is worth the one already saved,
    // so both have to be in the sentence.
    expect(ptBR.Weight.replaceBody).toContain("{current, number}");
    expect(ptBR.Weight.replaceBody).toContain("{next, number}");
  });

  it("asks the same way before deleting a row", () => {
    // Delete is the other way a measurement leaves this screen, and it is worth
    // no less than an overwrite. One dialog for both, so neither can quietly
    // become the easy one.
    const source = read("src/components/WeightLog.tsx");

    expect(source).toContain('setOpen({ kind: "remove", entry })');

    const dialog = source.slice(source.indexOf('open?.kind === "remove"'));
    const call = dialog.slice(0, dialog.indexOf("</ConfirmDialog>"));
    expect(call).toContain("void remove(open.entry.id)");
    expect(call).toContain('tone="danger"');
  });

  it("asks through the shared dialog rather than a line of text on the page", () => {
    // Small print under the inputs sits outside the path from the last box to
    // the button, which is how the warning it replaced went unread.
    const source = read("src/components/WeightLog.tsx");

    expect(source).toContain(
      'import { ConfirmDialog } from "@/components/ConfirmDialog"',
    );
    expect(source).not.toContain("replaceWarning");
  });

  it("offers a day other than today", () => {
    // Backfilling is half of what the issue asks for, and a date input pinned
    // to today would make the other half unreachable from the screen.
    const source = read("src/components/WeightEntryDialog.tsx");

    expect(source).toContain('type="date"');
    expect(source).toContain("max={today}");
  });

  it("writes through the repository, not the store underneath it", () => {
    const source = read("src/components/WeightLog.tsx");

    expect(source).toContain("getRepository()");
    expect(source).not.toContain("dexie");
    expect(source).not.toContain("indexedDB");
  });

  it("sends nothing anywhere", () => {
    // A weight is the most personal number this app holds, and the promise is
    // that it never leaves the device (docs/DECISIONS.md § D1).
    const source = read("src/components/WeightLog.tsx");

    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("navigator.sendBeacon");
  });

  it("is reachable without hunting for it", () => {
    // The home screen stopped being a list of links when the shell grew a tab
    // bar, so the claim moved with it: the weight log is one of the five slots,
    // and the day's screen points at it as well.
    expect(TABS).toContainEqual({ id: "weight", href: "/peso" });
    expect(read("src/components/Today.tsx")).toContain('href="/peso"');
  });

  it("keeps the form off the page and behind a button", () => {
    // The page is for reading: the chart and the rows. A form that is always
    // there puts three empty boxes between the user and the line they opened
    // the page to see, every visit, for a ten-second errand done once a day.
    const source = read("src/components/WeightLog.tsx");

    expect(source).toContain("<WeightEntryDialog");
    expect(source).not.toContain("<form");
    expect(read("src/components/WeightEntryDialog.tsx")).toContain(
      'from "@/components/Modal"',
    );
  });

  it("puts the chart above the rows", () => {
    // The trend is the answer to "how is it going", which is the question the
    // page is opened with. The rows are the evidence, and evidence goes under.
    const source = read("src/components/WeightLog.tsx");

    expect(source).toContain("<WeightTrend entries={entries} />");
    expect(source.indexOf("<WeightTrend")).toBeLessThan(source.indexOf("<ul"));
  });

  it("offers the import from the same place as the form", () => {
    // A history that can only be typed in one morning at a time is a trend line
    // that starts empty for everyone who has been weighing themselves for years.
    const source = read("src/components/WeightLog.tsx");

    expect(source).toContain("<WeightImportDialog");
    expect(source).toContain('t("import.open")');
  });

  it("shows the file before it writes any of it", () => {
    // Picking the wrong file out of a folder should cost a glance, not a
    // restore, so the parse is rendered and the button is what saves it.
    const source = read("src/components/WeightImportDialog.tsx");

    expect(source).toContain("parseWeightCsv(");
    expect(source).not.toContain("getRepository");
    expect(source).toContain("onImport(parse.rows)");
  });

  it("reads the file on the device rather than uploading it", () => {
    // A weight history is the most personal thing this app holds
    // (docs/DECISIONS.md § D1), and a file input is the one control that makes
    // shipping it somewhere a one-line mistake.
    const source = read("src/components/WeightImportDialog.tsx");

    expect(source).toContain("file.text()");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("FormData");
  });

  it("asks for the file in Portuguese, including on an English browser", () => {
    // The control the browser draws for `type="file"` writes its own words —
    // "Choose File", "No file chosen" — in the browser's language, not the
    // page's, and no styling can retranslate them. Most people here run Chrome
    // in English, which would put the only two English words on the screen on
    // the one control they have to use.
    const source = read("src/components/WeightImportDialog.tsx");

    expect(source).toContain('className="peer sr-only"');
    expect(source).toContain('htmlFor={fileId}');
    expect(source).toContain('t("fileNone")');

    // Not `hidden`, which would take the input out of the tab order with it.
    expect(source).not.toMatch(/className="[^"]*\bhidden\b[^"]*"[^>]*type="file"/);
  });

  it("has a message for every reason a line can be left out", () => {
    // next-intl renders the key path when a message is missing, so a new reason
    // ships as "Weight.import.reasons.xyz" in the skipped list.
    for (const reason of [...WEIGHT_ERROR_CODES, "duplicateDate"]) {
      expect(
        ptBR.Weight.import.reasons,
        `no message for ${reason}`,
      ).toHaveProperty(reason);
    }
  });

  it("has a message for every way a file can be refused outright", () => {
    expect(Object.keys(ptBR.Weight.import.fileErrors).sort()).toEqual(
      [...CSV_ERROR_CODES].sort(),
    );
  });

  it("renders the day in words rather than as a stored string", () => {
    // `new Date("2026-08-19")` is UTC midnight — the evening of the 18th in
    // Brazil — so every row would print the day before the one it measures.
    const source = read("src/components/WeightLog.tsx");

    expect(source).toContain("calendarDate(");
    expect(source).toContain("format.dateTime(");
  });
});
