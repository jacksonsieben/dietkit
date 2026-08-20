import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseWeightCsv } from "./csv";
import type { IsoDate } from "@/lib/storage/types";

const TODAY = "2026-08-20" as IsoDate;

/** Unwraps a parse that is expected to succeed, so the tests read as prose. */
function parse(text: string) {
  const result = parseWeightCsv(text, TODAY);
  if (!result.ok) throw new Error(`expected a parse, got ${result.error}`);
  return result.parse;
}

/**
 * The importer's whole job is turning somebody else's spreadsheet into this
 * app's rows, so what it is tested against is the shape of files people
 * actually have: an Excel export from a pt-BR machine, a Google Sheets
 * download, a two-column paste with no header at all.
 */
describe("parseWeightCsv", () => {
  it("reads the file Excel writes in Brazil", () => {
    // Semicolons because the comma is busy being a decimal point. Guessing
    // wrong here turns every weight into a syntax error.
    const { rows } = parse("Data;Peso\n05/01/2026;81,7\n06/01/2026;81,2\n");

    expect(rows).toEqual([
      { date: "2026-01-05", weightKg: 81.7, note: undefined },
      { date: "2026-01-06", weightKg: 81.2, note: undefined },
    ]);
  });

  it("reads the file the rest of the world writes", () => {
    const { rows } = parse("date,weight\n2026-01-05,81.7\n");

    expect(rows).toEqual([{ date: "2026-01-05", weightKg: 81.7, note: undefined }]);
  });

  it("reads a tab-separated paste out of a spreadsheet", () => {
    const { rows } = parse("data\tpeso\n2026-01-05\t81,7\n");

    expect(rows).toHaveLength(1);
    expect(rows[0].weightKg).toBe(81.7);
  });

  it("keeps the first row when nothing names the columns", () => {
    // A two-column paste has no header, and reading its first line as one
    // would silently swallow the oldest weigh-in in the file.
    const { rows, hadHeader } = parse("05/01/2026;81,7\n06/01/2026;81,2\n");

    expect(hadHeader).toBe(false);
    expect(rows).toHaveLength(2);
  });

  it("takes the columns by name even when they are in the other order", () => {
    const { rows } = parse("peso;data\n81,7;05/01/2026\n");

    expect(rows).toEqual([{ date: "2026-01-05", weightKg: 81.7, note: undefined }]);
  });

  it("finds the columns among ones it has no use for", () => {
    const { rows } = parse(
      "Data;Gordura;Peso (kg);Nota\n05/01/2026;22,4;81,7;em jejum\n",
    );

    expect(rows).toEqual([
      { date: "2026-01-05", weightKg: 81.7, note: "em jejum" },
    ]);
  });

  it("falls back to position when the names are in a third language", () => {
    // "Fecha;Peso corporal" is a spreadsheet, not an error, and the columns are
    // in the order every export writes them in anyway.
    const { rows, hadHeader } = parse("Fecha;Peso corporal\n05/01/2026;81,7\n");

    expect(hadHeader).toBe(true);
    expect(rows).toEqual([{ date: "2026-01-05", weightKg: 81.7, note: undefined }]);
  });

  it("ignores accents and capitals in a column name", () => {
    const { rows } = parse("DATA;PESO;Observação\n05/01/2026;81,7;pós-treino\n");

    expect(rows[0].note).toBe("pós-treino");
  });

  it("survives the byte Excel puts at the front of the file", () => {
    // Left in place, the first column is named "﻿Peso" rather than "peso",
    // the header goes unrecognised, and the file silently falls back to reading
    // its columns in the order they are not in.
    const { rows } = parse("﻿Peso;Data\n81,7;05/01/2026\n");

    expect(rows).toEqual([{ date: "2026-01-05", weightKg: 81.7, note: undefined }]);
  });

  it("reads a file saved on Windows", () => {
    const { rows } = parse("Data;Peso\r\n05/01/2026;81,7\r\n");

    expect(rows).toHaveLength(1);
  });

  it("keeps a note that has a comma in it", () => {
    const { rows } = parse(
      'data,peso,nota\n2026-01-05,81.7,"de manhã, em jejum"\n',
    );

    expect(rows[0].note).toBe("de manhã, em jejum");
  });

  it("unescapes a doubled quote inside a quoted note", () => {
    const { rows } = parse('data,peso,nota\n2026-01-05,81.7,"a ""boa"" balança"\n');

    expect(rows[0].note).toBe('a "boa" balança');
  });

  it("drops the unit somebody typed next to the number", () => {
    const { rows } = parse("Data;Peso\n05/01/2026;81,7 kg\n");

    expect(rows[0].weightKg).toBe(81.7);
  });

  it("keeps the day and drops the clock from a timestamp", () => {
    // The log holds a day, not a moment: `IsoDate` has nowhere to put 07:12.
    const { rows } = parse("data,peso\n2026-01-05T07:12:00,81.7\n");

    expect(rows[0].date).toBe("2026-01-05");
  });

  it("skips the rows it cannot read instead of refusing the file", () => {
    // Two hundred good rows should not be lost to one line where the scale
    // printed "ERR". The bad line is named so it can be fixed.
    const { rows, skipped } = parse(
      "Data;Peso\n05/01/2026;81,7\n06/01/2026;ERR\n07/01/2026;81,2\n",
    );

    expect(rows).toHaveLength(2);
    expect(skipped).toEqual([{ line: 3, reason: "notANumber" }]);
  });

  it("counts lines the way the spreadsheet does", () => {
    // 1-based and counting the header, because the number is only useful if it
    // matches the row the user has to go and look at.
    const { skipped } = parse("Data;Peso\n05/01/2026;81,7\n06/01/2026;0\n");

    expect(skipped).toEqual([{ line: 3, reason: "weightRange" }]);
  });

  it("rejects a row for the same reasons the form would", () => {
    const { skipped } = parse(
      "Data;Peso\n01/01/2200;81,7\n01/01/1899;81,7\n;81,7\nnão é data;81,7\n",
    );

    expect(skipped.map((skip) => skip.reason)).toEqual([
      "future",
      "ancientDate",
      "required",
      "notADate",
    ]);
  });

  it("reports one reason per bad row rather than one per bad cell", () => {
    // Two hundred lines each listing three problems is a wall of text nobody
    // reads to the end of.
    const { skipped } = parse("Data;Peso\nnão é data;ERR\n");

    expect(skipped).toHaveLength(1);
  });

  it("keeps the last of two rows for the same day", () => {
    // A day is a slot in the log, and a row added below an earlier one reads as
    // a correction to it — the same rule the form applies when it offers to
    // replace an existing entry.
    const { rows, skipped } = parse(
      "Data;Peso\n05/01/2026;81,7\n05/01/2026;82,1\n",
    );

    expect(rows).toEqual([{ date: "2026-01-05", weightKg: 82.1, note: undefined }]);
    expect(skipped).toEqual([{ line: 2, reason: "duplicateDate" }]);
  });

  it("hands back the rows oldest first however the file was sorted", () => {
    // The chart reads oldest-first and the list newest-first; neither should
    // depend on how somebody happened to sort their spreadsheet.
    const { rows } = parse(
      "Data;Peso\n07/01/2026;81,2\n05/01/2026;81,7\n06/01/2026;81,5\n",
    );

    expect(rows.map((row) => row.date)).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
    ]);
  });

  it("lists the skipped lines in file order", () => {
    // A duplicate is discovered later than the line it refers to, so without
    // sorting the list jumps backwards halfway down.
    const { skipped } = parse(
      "Data;Peso\n05/01/2026;81,7\n06/01/2026;ERR\n05/01/2026;82,1\n",
    );

    expect(skipped.map((skip) => skip.line)).toEqual([2, 3]);
  });

  it("ignores blank lines wherever they are", () => {
    const { rows, skipped } = parse(
      "Data;Peso\n\n05/01/2026;81,7\n\n06/01/2026;81,2\n\n",
    );

    expect(rows).toHaveLength(2);
    expect(skipped).toEqual([]);
  });

  it("says so when the file is empty", () => {
    expect(parseWeightCsv("\n\n  \n", TODAY)).toEqual({
      ok: false,
      error: "empty",
    });
  });

  it("says so when the file is not a table", () => {
    // A one-column file is not missing a header, it is the wrong file.
    expect(parseWeightCsv("81.7\n81.2\n", TODAY)).toEqual({
      ok: false,
      error: "noColumns",
    });
  });

  it("still explains itself when it could use none of the rows", () => {
    // "0 de 200 linhas" next to the reasons is something the user can act on;
    // refusing the file outright tells them only that it did not work.
    const { rows, skipped } = parse("Data;Peso\nnão é data;ERR\n");

    expect(rows).toEqual([]);
    expect(skipped).toEqual([{ line: 2, reason: "notADate" }]);
  });

  it("writes nothing anywhere", () => {
    // What comes back is what the screen shows *before* anything is saved: a
    // file that turned out to be the wrong one should cost a glance, not a
    // restore. The module has no way to reach the store, and this is what keeps
    // it that way when the next hand adds a convenience to it.
    const source = fs.readFileSync(
      path.join(import.meta.dirname, "csv.ts"),
      "utf8",
    );

    expect(source).not.toContain("getRepository");
    expect(source).not.toContain("async");
  });
});
