import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../../..");

const read = (relative: string) =>
  fs
    .readFileSync(path.join(ROOT, relative), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

const NOTICES = [
  "src/app/[locale]/privacidade/page.tsx",
  "src/app/[locale]/saude/page.tsx",
  "src/app/[locale]/termos/page.tsx",
];

/**
 * How a document behaves in a world built for readings (#70).
 *
 * The type ramp has a legend, a panel, a unit and a line of running text, and
 * none of those slots is "eleven paragraphs about data retention". The seam
 * where the notices meet the instrument is the one place the migration could
 * have quietly grown a second ramp, so the decisions that stop it are pinned
 * here rather than left to the next person's eye.
 */
describe("the documents", () => {
  it("sets prose from the container, not from the paragraphs", () => {
    // Every paragraph used to carry its own copy of the same four classes,
    // which is how one of them ends up a size out from its neighbours and
    // nobody notices for a year. `Prose` says it once; the notices say
    // nothing, and can therefore not disagree.
    for (const notice of NOTICES) {
      const source = read(notice);

      for (const pattern of [/text-(?:xs|sm|base|lg)\b/, /\bleading-/]) {
        expect(pattern.exec(source)?.[0], `${notice} sets its own type`)
          .toBeUndefined();
      }
    }
  });

  it("keeps that definition in one component", () => {
    expect(read("src/components/LegalPage.tsx")).toContain(
      "flex max-w-prose flex-col gap-3 text-sm leading-relaxed",
    );
  });

  it("draws the hierarchy inside a document instead of implying it", () => {
    // A rule above a label, not a second heading size. The world's own logic —
    // structure is visible — and it means a long document adds no new type
    // sizes to an app that already has eight.
    expect(read("src/components/LegalPage.tsx")).toMatch(
      /<Hairline \/>\s*<Legend as="h2">\{heading\}<\/Legend>/,
    );
  });

  it("names every screen the same way, documents included", () => {
    // A notice that reached for a bigger headline would be the one screen in
    // the app whose title is not a Legend.
    for (const notice of [...NOTICES, "src/app/[locale]/fontes/page.tsx"]) {
      const source = read(notice);
      const named =
        source.includes("<LegalPage") || source.includes('<Legend as="h1">');

      expect(named, `${notice} does not name itself in the label voice`).toBe(
        true,
      );
    }
  });

  it("marks the borrowed words as borrowed", () => {
    // #4's obligation is that the reader can tell NEPA's sentence and the
    // citation from ours. Italics alone do that for one of them and nothing
    // for the other, so both take the world's quotation mark: a 2px ink rule
    // down the left edge, the same weight as every other rule on the screen.
    const source = read("src/app/[locale]/fontes/page.tsx");
    const quoted = source.match(/border-l-2 border-nd-ink/g) ?? [];

    expect(quoted.length).toBe(2);
    expect(source).toMatch(
      /<blockquote[\s\S]*?border-l-2 border-nd-ink[\s\S]*?TACO_SOURCE\.permission/,
    );
  });

  it("builds /fontes out of the notices' own sections", () => {
    // It is a page of sections without being one of the three notices, and
    // hand-rolling its sections is how it drifts into a fourth rhythm.
    expect(read("src/app/[locale]/fontes/page.tsx")).toContain(
      'from "@/components/LegalPage"',
    );
  });
});
