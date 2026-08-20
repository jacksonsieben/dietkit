import type { IsoDate } from "@/lib/storage/types";

import {
  validateWeightForm,
  type WeightErrorCode,
  type WeightFormInput,
} from "./validation";

/**
 * Reading a weight history out of a spreadsheet.
 *
 * The people this app is for have years of weigh-ins somewhere already — a
 * Google Sheet, a Notes export, whatever the last app let them download — and
 * the trend line (#24) is worth nothing on a log that starts today. Typing two
 * hundred rows into a form is not a migration path, so this is one.
 *
 * Everything here is a pure function of a string, which is the whole reason it
 * is not inside the component: what counts as a date, what counts as a weight,
 * and which row gets dropped are decisions that deserve to be readable and
 * tested, not discovered by uploading a file and seeing what happens.
 *
 * Nothing is written. The parser returns what it *would* import, the screen
 * shows it, and the user says yes — because a file that turned out to be the
 * wrong one should cost a glance rather than a restore.
 */

/**
 * Delimiters worth guessing between.
 *
 * The semicolon is first for a reason: Excel in a pt-BR locale writes
 * semicolon-separated files with comma decimals, so the single most likely
 * upload here is one where a comma is *not* a separator. Tab covers a paste out
 * of Sheets.
 */
const DELIMITERS = [";", ",", "\t"] as const;

/** Column names, lowercased and stripped of accents — see `normalise`. */
const HEADERS = {
  date: ["data", "date", "dia", "day", "datahora", "data da pesagem"],
  weight: ["peso", "weight", "kg", "peso kg", "peso (kg)", "massa", "weight kg"],
  note: ["nota", "note", "obs", "observacao", "observacoes", "comentario"],
} as const;

export const CSV_ERROR_CODES = [
  /** The file had no rows at all, or only blank ones. */
  "empty",
  /** Every row was a single cell: not a table, whatever the extension says. */
  "noColumns",
] as const;

export type CsvErrorCode = (typeof CSV_ERROR_CODES)[number];

/**
 * Why one line was left out.
 *
 * The field-level codes are the log's own (`WeightErrorCode`), so a row
 * rejected by the importer is rejected for a reason the form would have given
 * in the same words. `duplicateDate` is the one thing only a file can be.
 */
export type CsvSkipReason = WeightErrorCode | "duplicateDate";

export interface CsvSkip {
  /** 1-based, counting the header, so it matches what the spreadsheet shows. */
  line: number;
  reason: CsvSkipReason;
}

export interface WeightCsvParse {
  /**
   * Possibly empty. A table whose every row was rejected is not an error case
   * here on purpose: "0 de 200 linhas" next to the reasons is an answer the
   * user can act on, and a bare "não deu" is not.
   */
  rows: WeightFormInput[];
  skipped: CsvSkip[];
  /** True when the first line was read as column names rather than as data. */
  hadHeader: boolean;
}

export type WeightCsvResult =
  | { ok: true; parse: WeightCsvParse }
  | { ok: false; error: CsvErrorCode };

/** Lowercased, unaccented, and squeezed — for matching header cells only. */
function normalise(cell: string): string {
  return cell
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * One line into cells, honouring quotes.
 *
 * Not a full RFC 4180 reader: a quoted field containing a newline would need
 * the splitter and the line splitter to be the same pass, and a weight log with
 * a line break inside a cell is not a file anyone has. Quotes are handled
 * because exporters add them around notes with commas in, which is a file
 * everyone has.
 */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (quoted) {
      if (character !== '"') {
        cell += character;
      } else if (line[index + 1] === '"') {
        // The escape: `""` inside a quoted field is one literal quote.
        cell += '"';
        index += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === delimiter) {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }

  cells.push(cell);
  // The one place cells are trimmed, so the BOM claim below has one line to
  // live on. Exporters pad after the delimiter, and `trim` also swallows the
  // U+FEFF Excel writes at the front of a UTF-8 file — which counts as
  // whitespace, and without it the first column is named "\ufeffdata", no
  // header is recognised, and a good file goes down the positional fallback.
  return cells.map((value) => value.trim());
}

/**
 * Which separator this file uses.
 *
 * Decided on the whole file rather than the first line, because a header row is
 * exactly where a guess goes wrong: `data,peso` and `data;peso` both contain
 * one candidate each. The winner is the one that splits the most lines into the
 * same number of cells — a real separator is consistent down the column, and a
 * comma that is really a decimal point is not.
 */
function detectDelimiter(lines: readonly string[]): string {
  let best: string = DELIMITERS[0];
  let bestScore = -1;

  for (const delimiter of DELIMITERS) {
    const counts = lines.map(
      (line) => splitLine(line, delimiter).length,
    );
    const columns = Math.max(...counts);
    if (columns < 2) continue;

    const consistent = counts.filter((count) => count === columns).length;
    // Columns break the tie: two separators that split every line cleanly means
    // the one producing more cells is the one actually separating them.
    const score = consistent * 100 + columns;

    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}

/** `DD/MM/YYYY`, `DD-MM-YYYY`, and the ISO the app stores. */
function toIsoDate(raw: string): string {
  const trimmed = raw.trim();

  // A timestamp from an export — keep the day, drop the clock. The time of day
  // is not a fact the log holds (see `IsoDate`).
  const dateOnly = trimmed.split(/[T ]/)[0] ?? trimmed;

  const slashed = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(dateOnly);
  if (slashed) {
    const [, day, month, year] = slashed;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const iso = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(dateOnly);
  if (iso) {
    const [, year, month, day] = iso;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // Handed on unchanged so `validateWeightForm` is the one that says no, in the
  // same words it would say it to the form.
  return dateOnly;
}

/** `81,7 kg` and `81.7` are the same measurement — `parseDecimal` does the rest. */
function toWeightField(raw: string): string {
  return raw.trim().replace(/\s*(kg|quilos?|kilos?)\s*$/i, "");
}

interface Columns {
  date: number;
  weight: number;
  note?: number;
}

/**
 * Which column is which.
 *
 * By name when the first row names them, by position otherwise — `date, weight`
 * is the order every export writes, and the order this app's own export uses.
 * A named file whose names are unrecognised falls back to position too, because
 * "Fecha;Peso corporal" is a spreadsheet, not an error.
 */
function readHeader(cells: readonly string[]): Columns | undefined {
  const names = cells.map(normalise);
  const find = (candidates: readonly string[]) =>
    names.findIndex((name) => candidates.includes(name));

  const date = find(HEADERS.date);
  const weight = find(HEADERS.weight);
  if (date === -1 || weight === -1) return undefined;

  const note = find(HEADERS.note);
  return { date, weight, note: note === -1 ? undefined : note };
}

/**
 * Whether the first line is column names.
 *
 * Asked of the *data*, not of the names: a row is a header when its second cell
 * is not a number. Sniffing for known words instead would silently drop the
 * first weigh-in of any file that labels its columns in a language this list
 * has never heard of.
 */
function looksLikeHeader(cells: readonly string[]): boolean {
  return cells.every((cell) => Number.isNaN(Number(toWeightField(cell).replace(",", "."))) || cell.trim() === "");
}

export function parseWeightCsv(
  text: string,
  today: IsoDate,
): WeightCsvResult {
  const lines = text
    .split(/\r?\n/)
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => line.trim() !== "");

  if (lines.length === 0) return { ok: false, error: "empty" };

  const delimiter = detectDelimiter(lines.map(({ line }) => line));
  const table = lines.map(({ line, number }) => ({
    cells: splitLine(line, delimiter),
    number,
  }));

  if (table.every(({ cells }) => cells.length < 2)) {
    return { ok: false, error: "noColumns" };
  }

  const first = table[0];
  const named = readHeader(first.cells);
  const hadHeader = named !== undefined || looksLikeHeader(first.cells);
  const columns: Columns = named ?? { date: 0, weight: 1, note: 2 };
  const body = hadHeader ? table.slice(1) : table;

  const rows: WeightFormInput[] = [];
  const skipped: CsvSkip[] = [];
  /** Line number of the row currently holding each day — see below. */
  const seen = new Map<IsoDate, number>();

  for (const { cells, number } of body) {
    const result = validateWeightForm(
      {
        date: toIsoDate(cells[columns.date] ?? ""),
        weightKg: toWeightField(cells[columns.weight] ?? ""),
        note: columns.note === undefined ? "" : (cells[columns.note] ?? ""),
      },
      today,
    );

    if (!result.ok) {
      // One reason per line, in the order the form reports them: a row with a
      // bad date and a bad weight is a bad row, and listing both twice over two
      // hundred lines is a wall of text nobody reads.
      const reason =
        result.errors.date ?? result.errors.weightKg ?? result.errors.note;
      if (reason !== undefined) skipped.push({ line: number, reason });
      continue;
    }

    // A day is a slot here as much as it is in the log, so a file with two rows
    // for a Tuesday imports one of them. The later line wins, on the same
    // reading a spreadsheet invites: a row added below an earlier one is a
    // correction to it. The one it replaces is reported rather than dropped
    // quietly, so the counts on screen add up.
    const previous = seen.get(result.value.date);
    if (previous !== undefined) {
      const index = rows.findIndex((row) => row.date === result.value.date);
      rows.splice(index, 1);
      skipped.push({ line: previous, reason: "duplicateDate" });
    }

    seen.set(result.value.date, number);
    rows.push(result.value);
  }

  // Oldest first, whatever order the file was in: the log reads newest-first
  // and the chart reads oldest-first, and neither should depend on how somebody
  // happened to sort their spreadsheet.
  rows.sort((left, right) => left.date.localeCompare(right.date));
  skipped.sort((left, right) => left.line - right.line);

  return { ok: true, parse: { rows, skipped, hadHeader } };
}
