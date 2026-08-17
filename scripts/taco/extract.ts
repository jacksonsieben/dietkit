/**
 * Extracts TACO's Tabela 1 from the publication into data/taco-4ed.json.
 *
 *   node scripts/taco/extract.ts path/to/taco_4_edicao_ampliada_e_revisada.pdf
 *
 * Add `--retrieved=YYYY-MM-DD` if the file was downloaded on a day other than
 * today; it becomes `dataset_versions.retrieved_at`.
 *
 * Run by hand, rarely — once per edition of the source. The result is checked
 * in, so seeding, testing and CI never need the PDF, and any change to the
 * numbers we ship shows up as a reviewable diff rather than as a different
 * outcome from the same command.
 *
 * The file is identified by hash before it is read. `TACO_SOURCE.sha256` pins
 * the exact document the citation names; a different printing of "TACO 4th
 * edition" is a different set of numbers published under the same title, and
 * quietly ingesting it would make the attribution false.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argv } from "node:process";

import { TACO_SOURCE } from "../../src/lib/attribution.ts";
import { parseTable } from "./parse.ts";
import { readPages } from "./pdf.ts";
import { DATA_FILE, type TacoDataset } from "./dataset.ts";

const RETRIEVED_FLAG = /^--retrieved=(\d{4}-\d{2}-\d{2})$/;

async function main(): Promise<void> {
  const args = argv.slice(2);
  const path = args.find((argument) => !argument.startsWith("--"));
  if (!path) {
    throw new Error(
      "Usage: node scripts/taco/extract.ts <taco.pdf> [--retrieved=YYYY-MM-DD]",
    );
  }

  const flag = args.find((argument) => argument.startsWith("--retrieved"));
  const retrieved = flag ? RETRIEVED_FLAG.exec(flag) : undefined;
  if (flag && !retrieved) {
    throw new Error(`Expected --retrieved=YYYY-MM-DD, got "${flag}"`);
  }
  const retrievedAt =
    retrieved?.[1] ?? new Date().toISOString().slice(0, "YYYY-MM-DD".length);

  const file = await readFile(path);
  const sha256 = createHash("sha256").update(file).digest("hex");
  if (sha256 !== TACO_SOURCE.sha256) {
    throw new Error(
      `${path} is not the pinned publication.\n` +
        `  expected ${TACO_SOURCE.sha256}\n` +
        `  found    ${sha256}\n` +
        `Download it from ${TACO_SOURCE.url}. If NEPA has republished the file, ` +
        `that is a decision to make in docs/TACO-LICENSING.md, not a pin to edit.`,
    );
  }

  const pages = await readPages(new Uint8Array(file));
  const { groups, foods } = parseTable(pages);

  if (foods.length !== TACO_SOURCE.foodCount) {
    throw new Error(
      `Parsed ${foods.length} foods; the publication contains ` +
        `${TACO_SOURCE.foodCount}`,
    );
  }

  const dataset: TacoDataset = {
    dataset: "taco",
    edition: TACO_SOURCE.editionShort,
    sha256,
    fileBytes: file.byteLength,
    sourceUrl: TACO_SOURCE.url,
    retrievedAt,
    groups,
    foods,
  };

  await writeFile(DATA_FILE, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${foods.length} foods in ${groups.length} groups to ${DATA_FILE}`,
  );
}

await main();
