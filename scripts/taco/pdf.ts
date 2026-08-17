/**
 * The pdfjs half of the ingest: a PDF file in, positioned text out.
 *
 * Separated from parse.ts so that the parsing rules can be tested against a
 * checked-in fixture without a 700 KB publication and a WASM-adjacent renderer
 * in the loop.
 */

import { getDocument, Util } from "pdfjs-dist/legacy/build/pdf.mjs";

import type { Page, TextItem } from "./parse.ts";

/**
 * Tabela 1 — centesimal composition, minerals, vitamins and cholesterol —
 * occupies PDF pages 29 to 68; page 28 is its title page. Tabela 2 (fatty
 * acids) and Tabela 3 (amino acids) follow and are out of scope: the schema
 * holds the 26 nutrients of Tabela 1.
 */
export const TABLE_1_PAGES = { first: 29, last: 68 } as const;

export async function readPages(
  file: Uint8Array,
  range: { first: number; last: number } = TABLE_1_PAGES,
): Promise<Page[]> {
  const task = getDocument({ data: file, useSystemFonts: true });
  const document = await task.promise;
  const pages: Page[] = [];

  for (let number = range.first; number <= range.last; number += 1) {
    const page = await document.getPage(number);
    // Every page of the table is rotated 90°, so an item's own transform is in
    // an unrotated space where columns read as rows. Composing the viewport
    // transform puts it back on the page as printed — without this the
    // clustering below groups one nutrient across many foods and calls it a row.
    const { transform } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const items: TextItem[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const text = item.str.trim();
      if (text === "") continue;
      const placed = Util.transform(transform, item.transform);
      items.push({ text, x: placed[4]!, y: placed[5]! });
    }

    pages.push({ number, items });
  }

  await task.destroy();
  return pages;
}
