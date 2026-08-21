import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import ptBR from "../../../messages/pt-BR.json";

import { IMPORT_NOTE_CODES } from "./import";
import { PROFILE_ISSUE_CODES } from "./profile";

const ROOT = path.resolve(import.meta.dirname, "../../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(ROOT, relative), "utf8");

/**
 * The parts of #22 that are true about how the screen is wired rather than
 * about what the import computes. `import.test.ts` covers the arithmetic and
 * the mapping; what is left only shows in the source and the catalogue — that
 * every note has words, that the file is read here and never sent, and that
 * the user is asked before anything is written.
 *
 * Read rather than rendered, for the reason `src/lib/diet/wiring.test.ts`
 * gives: next-intl resolves to its client build under Vitest and a server
 * component throws before it paints.
 */
describe("import wiring", () => {
  const component = () => read("src/components/DietImport.tsx");
  const messages = ptBR.Import as Record<string, unknown>;

  it("has words for every note the import can make", () => {
    // The issue's third condition — "unmapped items are reported, not silently
    // dropped" — is only met if the code the import emits reaches the screen as
    // a sentence. A missing key renders the key path, which reports nothing.
    const notes = messages.notes as Record<string, string>;

    expect(Object.keys(notes).sort()).toEqual([...IMPORT_NOTE_CODES].sort());
  });

  it("has words for every reason a file can be refused", () => {
    const issues = messages.issues as Record<string, string>;

    expect(Object.keys(issues).sort()).toEqual([...PROFILE_ISSUE_CODES].sort());
  });

  it("names the food or the key the note is about", () => {
    // A note that says "um alimento não foi encontrado" is a note the user
    // cannot act on. Every code carrying a subject must print it.
    const notes = messages.notes as Record<string, string>;

    for (const code of [
      "sexUnrecognised",
      "selectionOutOfRange",
      "valueClamped",
      "foodCorrected",
      "foodFoundInTaco",
      "foodOtherCultivar",
      "foodNotInTaco",
      "foodOtherPreparation",
      "foodNotPublished",
      "foodUnmapped",
      "compositionMissing",
      "itemWithoutFood",
      "substitutionGroupCreated",
    ]) {
      expect(notes[code], code).toContain("{subject");
    }
  });

  it("shows the notes before anything is written, not after", () => {
    // The order in the source is the order on screen: a review that appears
    // after `applyImport` is a changelog, not a confirmation.
    const source = component();

    expect(source.indexOf("<Notes")).toBeLessThan(source.indexOf("confirm()"));
    expect(source).toContain("importConflicts(");
  });

  it("reads the file on the device and posts nothing", () => {
    const source = component();

    expect(source).toContain("file.text()");
    // The only request it may make is for TACO rows by id — reference data,
    // asked for by numbers that come from `catalogue.data.ts`, not from the
    // file. Anything that uploads would be the one thing this app promises not
    // to do (#11).
    expect(source).not.toMatch(/method:\s*"POST"/);
    expect(source).not.toContain("FormData");
    expect(source).toContain("fetchCompositions(");
  });

  it("writes through the repository rather than reaching for a store", () => {
    const source = component();

    expect(source).toContain("applyImport(getRepository()");
    expect(source).not.toContain("dexie");
  });

  it("asks for the file in the page's own language", () => {
    // The native file input labels itself from the *browser's* locale, not the
    // page's: on a Portuguese screen it read "Choose File — No file chosen", in
    // a typeface nothing else here uses, and no border or padding on the input
    // reaches inside it. `FileField` is the replacement, and it is a wiring fact
    // rather than a styling one — the words come from `messages/pt-BR.json`.
    const source = component();

    expect(source).toContain("<FileField");
    expect(source).not.toMatch(/type="file"/);
    expect(messages.fileAction).toBeTypeOf("string");
    expect(messages.fileEmpty).toBeTypeOf("string");

    // Invisible, not absent. `sr-only` keeps the input focusable and keeps the
    // label bound to it, which `display: none` and `hidden` both destroy — and
    // an import that only works with a mouse is an import half the point of.
    const control = read("src/components/nd/FileField.tsx");

    expect(control).toContain('className="peer sr-only"');
    expect(control).not.toMatch(/type="file"[^>]*\shidden/);
  });

  it("is reachable from the screen that holds everything outside the loop", () => {
    // Importing is a once-ever errand, so it left the home screen for `/mais`
    // when the home screen became the day. It still has a way in, which is the
    // whole of what this test ever claimed.
    expect(read("src/app/[locale]/mais/page.tsx")).toContain('href: "/importar"');
  });
});
