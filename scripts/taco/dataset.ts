/**
 * The shape of data/taco-4ed.json, shared by the script that writes it, the
 * script that seeds from it, and the test that checks it.
 *
 * The extracted file is the ingest's unit of review. It carries the provenance
 * fields alongside the rows so that what gets recorded in `dataset_versions`
 * comes from the same artefact as the numbers, and cannot drift from them.
 */

import { fileURLToPath } from "node:url";

import type { ParsedFood, ParsedGroup } from "./parse.ts";

export interface TacoDataset {
  readonly dataset: string;
  readonly edition: string;
  /** Of the source PDF, not of this file — it identifies what was read. */
  readonly sha256: string;
  readonly fileBytes: number;
  readonly sourceUrl: string;
  /**
   * When the file was downloaded, `YYYY-MM-DD`. A URL can change under a fixed
   * citation, so the date is part of the reference — ABNT asks for it and
   * `dataset_versions.retrieved_at` stores it.
   */
  readonly retrievedAt: string;
  readonly groups: readonly ParsedGroup[];
  readonly foods: readonly ParsedFood[];
}

export const DATA_FILE = fileURLToPath(
  new URL("../../data/taco-4ed.json", import.meta.url),
);
