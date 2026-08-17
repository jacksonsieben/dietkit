import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import ptBR from "../../messages/pt-BR.json";
import { TACO_CITATION, TACO_SOURCE } from "./attribution";

const repoRoot = path.resolve(import.meta.dirname, "../..");

function read(relative: string): string {
  return readFileSync(path.join(repoRoot, relative), "utf8");
}

/** Markdown wraps and quotes; the sentence underneath is what we compare. */
function prose(markdown: string): string {
  return markdown.replace(/^>\s?/gm, "").replace(/\s+/g, " ");
}

describe("TACO attribution", () => {
  const licensingDoc = read("docs/TACO-LICENSING.md");

  it("cites publisher, edition, place, year and where to get it", () => {
    // The five things a reference needs to be checkable. A credit that names
    // TACO but not the edition would send a reader to the wrong numbers.
    expect(TACO_CITATION).toContain("NEPA");
    expect(TACO_CITATION).toContain(TACO_SOURCE.editionShort);
    expect(TACO_CITATION).toContain(TACO_SOURCE.city);
    expect(TACO_CITATION).toContain(String(TACO_SOURCE.year));
    expect(TACO_CITATION).toContain(TACO_SOURCE.url);
  });

  it("matches the citation agreed in docs/TACO-LICENSING.md", () => {
    // Two copies of a licence obligation is one copy too many. If the wording is
    // renegotiated, this fails until the doc and the code say the same thing.
    expect(prose(licensingDoc)).toContain(prose(TACO_CITATION));
  });

  it("quotes NEPA's permission notice exactly as the doc records it", () => {
    expect(prose(licensingDoc)).toContain(prose(TACO_SOURCE.permission));
    // The condition itself, in NEPA's words. Losing this clause would turn a
    // quoted permission into a claim that the data is simply free.
    expect(TACO_SOURCE.permission).toContain("desde que seja citada a fonte");
  });

  it("pins the same file hash the doc records", () => {
    // #3 refuses to ingest a PDF whose hash is not this one, so the hash is part
    // of the provenance claim rather than a note.
    expect(licensingDoc).toContain(TACO_SOURCE.sha256);
  });

  it("credits the source in the pt-BR catalogue, with the facts filled in", () => {
    const { credit } = ptBR.Attribution;

    expect(credit).toContain("TACO");
    for (const placeholder of ["{publisher}", "{edition}", "{year}"]) {
      expect(credit, `credit must interpolate ${placeholder}`).toContain(
        placeholder,
      );
    }
  });

  it("renders the credit from the root layout, not from individual pages", () => {
    // The licence condition applies to every screen that shows a TACO value.
    // Mounting the footer in the layout is what makes that true of screens
    // nobody has written yet, so it is checked rather than remembered.
    const layout = read("src/app/[locale]/layout.tsx");

    expect(layout).toContain("SourceFooter");
    expect(layout).toMatch(/<SourceFooter\s*\/>/);
  });

  it("keeps the sources page reachable at the path the footer links to", () => {
    expect(read("src/components/SourceFooter.tsx")).toContain('href="/fontes"');
    expect(() => read("src/app/[locale]/fontes/page.tsx")).not.toThrow();
  });
});
