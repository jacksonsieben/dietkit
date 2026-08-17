/**
 * Turns the positioned text of TACO's Tabela 1 into food records.
 *
 * The publication is a typeset PDF, not a data file, so the only honest way to
 * read it is geometrically. Splitting a line on whitespace looks like it works
 * until a food with blank cells shows up — "Azeite, de dendê" (#259) prints 8
 * numbers under 11 headings — and then every value after the gap is silently
 * attributed to the wrong nutrient. Nothing in the output would look wrong.
 *
 * So this module never counts tokens. It reads the column positions off the
 * unit row that each page prints for itself, and assigns every value to the
 * column it is physically under. A blank cell then stays blank, because nothing
 * landed there.
 *
 * Kept free of pdfjs and of the filesystem so it can be tested against a
 * checked-in fixture — see parse.test.ts.
 */

import {
  NUTRIENTS,
  type NutrientKey,
  type NutrientSentinel,
  type NutrientUnit,
} from "../../src/lib/db/nutrients.ts";

/** One run of text, with the page-space position pdfjs reports for it. */
export interface TextItem {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

export interface ParsedFood {
  readonly id: number;
  readonly groupSlug: string;
  readonly description: string;
  readonly searchText: string;
  /** Only cells that print a number. A blank cell appears in neither map. */
  readonly values: Partial<Record<NutrientKey, number>>;
  /** Only cells that print `NA`, `Tr` or `*`. */
  readonly sentinels: Partial<Record<NutrientKey, NutrientSentinel>>;
}

export interface ParsedGroup {
  readonly slug: string;
  readonly name: string;
  readonly position: number;
}

export interface ParsedTable {
  readonly groups: readonly ParsedGroup[];
  readonly foods: readonly ParsedFood[];
}

/**
 * Tabela 1 splits each food across two facing pages: moisture through
 * magnesium on the left, manganese through vitamin C on the right. The halves
 * are joined on TACO's own food number, not on row order, so a page that
 * paginates differently than expected fails loudly instead of shifting values
 * onto a neighbour.
 */
const SPREAD_A = NUTRIENTS.slice(0, 11);
const SPREAD_B = NUTRIENTS.slice(11);

/** Rows are typeset on a ~11pt baseline grid; 3pt is well inside one row. */
const ROW_TOLERANCE = 3;

/**
 * How far a value may sit from its column's centre. Values are centred under
 * their heading but drift with digit width — the largest deviation in the whole
 * table is under 7pt, while the narrowest gap between two columns is 28pt, so
 * 14pt (half that gap) accepts every real value and can never reach past a
 * neighbour.
 */
const COLUMN_TOLERANCE = 14;

/**
 * The same check for a row whose cells are already matched up by counting. It
 * only has to catch a value that arrived as two separate runs of text, so it
 * can be loose enough to tolerate the publication's own misprints.
 */
const MISPRINT_TOLERANCE = 30;

/** x-ranges that separate the three zones of a row. Stable across all pages. */
const NUMBER_COLUMN = { min: 80, max: 95 };
const DESCRIPTION_COLUMN = { min: 100, max: 370 };

const VALUE_PATTERN = /^\d+(?:,\d+)?$/;
const SENTINEL_TEXT: Record<string, NutrientSentinel> = {
  NA: "NA",
  Tr: "Tr",
  "*": "*",
};

export interface Page {
  /** 1-based, as pdfjs numbers them. Only used in error messages. */
  readonly number: number;
  readonly items: readonly TextItem[];
}

interface Row {
  readonly y: number;
  readonly items: readonly TextItem[];
}

/** Clusters items into typeset rows, each sorted left to right. */
function toRows(items: readonly TextItem[]): Row[] {
  const buckets: { y: number; items: TextItem[] }[] = [];

  for (const item of items) {
    if (item.text.trim() === "") continue;
    const bucket = buckets.find(
      (candidate) => Math.abs(candidate.y - item.y) < ROW_TOLERANCE,
    );
    if (bucket) {
      bucket.items.push(item);
    } else {
      buckets.push({ y: item.y, items: [item] });
    }
  }

  return buckets
    .sort((a, b) => a.y - b.y)
    .map((bucket) => ({
      y: bucket.y,
      items: [...bucket.items].sort((a, b) => a.x - b.x),
    }));
}

/** The PDF uses U+03BC (Greek mu); the schema uses U+00B5 (micro sign). */
function normaliseUnit(text: string): string {
  return text.replace(/μ/g, "µ");
}

const UNIT_PATTERN = /^\((.+)\)$/;

/**
 * Locates the row of unit labels — `(%)  (kcal)  (kJ)  (g) …` — which is the
 * one thing on the page that states both where each column sits and what it
 * holds.
 */
function findUnitRow(rows: readonly Row[]): Row | undefined {
  return rows.find(
    (row) => row.items.filter((item) => UNIT_PATTERN.test(item.text)).length >= 5,
  );
}

interface Column {
  readonly key: NutrientKey;
  readonly x: number;
}

/**
 * Reads the page's own column layout, and checks it against the nutrient list
 * before trusting it.
 *
 * The units are printed in the header, so the page can be made to prove it is
 * the page we think it is: eleven columns reading `% kcal kJ g g mg g g g mg
 * mg` is spread A and nothing else. A page that has been re-ordered, or a
 * nutrient list edited out of step with the publication, stops the ingest here
 * rather than producing a plausible table of misfiled numbers.
 */
function readColumns(page: Page, unitRow: Row): Column[] {
  const printed = unitRow.items.filter((item) => UNIT_PATTERN.test(item.text));
  const spread =
    printed.length === SPREAD_A.length
      ? SPREAD_A
      : printed.length === SPREAD_B.length
        ? SPREAD_B
        : undefined;

  if (!spread) {
    throw new Error(
      `Page ${page.number}: expected ${SPREAD_A.length} or ${SPREAD_B.length} ` +
        `unit headings, found ${printed.length}`,
    );
  }

  return spread.map((nutrient, index) => {
    const item = printed[index]!;
    const unit = normaliseUnit(UNIT_PATTERN.exec(item.text)![1]!) as NutrientUnit;
    if (unit !== nutrient.unit) {
      throw new Error(
        `Page ${page.number}: column ${index + 1} is headed "${unit}" but ` +
          `${nutrient.key} is measured in "${nutrient.unit}". The page layout ` +
          `does not match src/lib/db/nutrients.ts.`,
      );
    }
    return { key: nutrient.key, x: item.x };
  });
}

function isFoodNumber(item: TextItem): boolean {
  return (
    item.x > NUMBER_COLUMN.min &&
    item.x < NUMBER_COLUMN.max &&
    /^\d{1,3}$/.test(item.text)
  );
}

function parseValue(text: string): number {
  return Number(text.replace(",", "."));
}

interface Cells {
  values: Partial<Record<NutrientKey, number>>;
  sentinels: Partial<Record<NutrientKey, NutrientSentinel>>;
}

/**
 * Files each printed cell under the column it belongs to.
 *
 * Two rules, and the cheap one is tried first. A row that prints as many cells
 * as the page has columns is *complete*: with the order fixed by the typesetter
 * there is exactly one way to match them up, and counting beats measuring. That
 * matters because the publication does not typeset perfectly — food 547 prints
 * its riboflavin and pyridoxine some 25pt right of where every other row on
 * page 64 puts them, far enough that the nearest column is the wrong one.
 * Position is still checked, but only loosely, as a guard against a value that
 * arrived split into two runs.
 *
 * A row with fewer cells than columns has gaps, and only geometry can say where
 * they fall — so those go by nearest column centre, within a tolerance that
 * cannot reach a neighbour, and the result is checked to be strictly
 * increasing. A cell nothing lands on is left out of both maps, which is how a
 * blank in the publication survives into the database as a NULL with no
 * sentinel instead of shifting every value after it one column left.
 */
function assignCells(page: Page, row: Row, columns: readonly Column[]): Cells {
  const values: Partial<Record<NutrientKey, number>> = {};
  const sentinels: Partial<Record<NutrientKey, NutrientSentinel>> = {};
  const leftmost = columns[0]!.x - COLUMN_TOLERANCE;

  // Superscript footnote markers — the `a`/`b` on retinol, the `1`/`2` on
  // alcohol content — are typeset above the baseline and usually cluster as
  // their own row, but a tall row can pull one in. They carry no measurement.
  const printed = row.items.filter(
    (item) =>
      item.x >= leftmost &&
      (item.text in SENTINEL_TEXT || VALUE_PATTERN.test(item.text)),
  );

  const complete = printed.length === columns.length;
  let previous = -1;

  for (const [position, item] of printed.entries()) {
    let index: number;
    let distance: number;

    if (complete) {
      index = position;
      distance = Math.abs(columns[index]!.x - item.x);
    } else {
      index = -1;
      distance = Infinity;
      for (const [candidate, column] of columns.entries()) {
        const candidateDistance = Math.abs(column.x - item.x);
        if (candidateDistance < distance) {
          distance = candidateDistance;
          index = candidate;
        }
      }
    }

    const limit = complete ? MISPRINT_TOLERANCE : COLUMN_TOLERANCE;
    if (distance > limit) {
      throw new Error(
        `Page ${page.number}, row y=${row.y.toFixed(1)}: "${item.text}" at ` +
          `x=${item.x.toFixed(1)} is ${distance.toFixed(1)}pt from the centre ` +
          `of ${columns[index]!.key}`,
      );
    }
    if (index <= previous) {
      throw new Error(
        `Page ${page.number}, row y=${row.y.toFixed(1)}: "${item.text}" at ` +
          `x=${item.x.toFixed(1)} lands on column ${index + 1}, which is not ` +
          `after column ${previous + 1}`,
      );
    }
    previous = index;

    const key = columns[index]!.key;
    const sentinel = SENTINEL_TEXT[item.text];
    if (sentinel) {
      sentinels[key] = sentinel;
    } else {
      values[key] = parseValue(item.text);
    }
  }

  return { values, sentinels };
}

/** Accent-folded, lowercase, hyphen-joined — for slugs and for search. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function slugify(text: string): string {
  return fold(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface HalfRow {
  readonly id: number;
  readonly description?: string;
  readonly cells: Cells;
}

export interface ParsedPage {
  readonly spread: "a" | "b";
  readonly groups: readonly { name: string; beforeFoodId: number }[];
  readonly rows: readonly HalfRow[];
}

/**
 * A heading names the group the foods below it belong to. It is the only thing
 * on a data page that starts left of the food-number column — the running title
 * and the footnotes share that margin, so both are named explicitly rather than
 * guessed at.
 */
const HEADING_MAX_X = 80;
const NOT_A_HEADING = /^(Tabela \d|\*|†|Valores |Limites |Abrevia|para n|com du|de comp)/;

export function parsePage(page: Page): ParsedPage {
  const rows = toRows(page.items);
  const unitRow = findUnitRow(rows);
  if (!unitRow) {
    throw new Error(`Page ${page.number}: no row of unit headings found`);
  }

  const columns = readColumns(page, unitRow);
  const spread = columns.length === SPREAD_A.length ? "a" : "b";
  const body = rows.filter((row) => row.y > unitRow.y);

  const groups: { name: string; beforeFoodId: number }[] = [];
  const foods: HalfRow[] = [];
  const pending: string[] = [];

  for (const row of body) {
    const first = row.items[0]!;

    if (isFoodNumber(first) && row.items.length > 1) {
      const id = Number(first.text);
      for (const name of pending) groups.push({ name, beforeFoodId: id });
      pending.length = 0;

      let description: string | undefined;
      if (spread === "a") {
        const written = row.items.filter(
          (item) =>
            item.x > DESCRIPTION_COLUMN.min && item.x < DESCRIPTION_COLUMN.max,
        );
        if (written.length !== 1) {
          throw new Error(
            `Page ${page.number}: food ${id} has ${written.length} description ` +
              `runs, expected exactly 1`,
          );
        }
        description = written[0]!.text;
      }

      foods.push({ id, description, cells: assignCells(page, row, columns) });
      continue;
    }

    if (
      row.items.length === 1 &&
      first.x < HEADING_MAX_X &&
      !NOT_A_HEADING.test(first.text) &&
      /^\p{Lu}/u.test(first.text)
    ) {
      pending.push(first.text);
    }
  }

  return { spread, groups, rows: foods };
}

/**
 * Reads every page of Tabela 1 into food records.
 *
 * Pages arrive in printed order and are expected to alternate spread A, spread
 * B, so that each food's two halves can be joined on its number. Both halves
 * must exist and neither may contribute a nutrient twice.
 */
export function parseTable(pages: readonly Page[]): ParsedTable {
  const descriptions = new Map<number, string>();
  const cells = new Map<number, Cells>();
  const groupOf = new Map<number, string>();
  const groups: ParsedGroup[] = [];
  const halves = new Map<number, Set<"a" | "b">>();

  let currentGroup: string | undefined;

  for (const page of pages) {
    const parsed = parsePage(page);

    for (const row of parsed.rows) {
      const heading = parsed.groups.find(
        (group) => group.beforeFoodId === row.id,
      );
      if (parsed.spread === "a" && heading) {
        currentGroup = heading.name;
        if (!groups.some((group) => group.name === currentGroup)) {
          groups.push({
            slug: slugify(currentGroup),
            name: currentGroup,
            position: groups.length + 1,
          });
        }
      }

      const seen = halves.get(row.id) ?? new Set<"a" | "b">();
      if (seen.has(parsed.spread)) {
        throw new Error(
          `Food ${row.id} appears twice on spread ${parsed.spread.toUpperCase()}`,
        );
      }
      seen.add(parsed.spread);
      halves.set(row.id, seen);

      if (row.description !== undefined) {
        descriptions.set(row.id, row.description);
      }
      if (parsed.spread === "a") {
        if (!currentGroup) {
          throw new Error(`Food ${row.id} appears before any group heading`);
        }
        groupOf.set(row.id, slugify(currentGroup));
      }

      const merged = cells.get(row.id) ?? { values: {}, sentinels: {} };
      Object.assign(merged.values, row.cells.values);
      Object.assign(merged.sentinels, row.cells.sentinels);
      cells.set(row.id, merged);
    }
  }

  const foods: ParsedFood[] = [];
  for (const id of [...cells.keys()].sort((a, b) => a - b)) {
    const seen = halves.get(id)!;
    if (seen.size !== 2) {
      throw new Error(
        `Food ${id} was only found on spread ${[...seen][0]!.toUpperCase()}; ` +
          `both halves of the table are required`,
      );
    }

    const description = descriptions.get(id);
    const groupSlug = groupOf.get(id);
    if (!description || !groupSlug) {
      throw new Error(`Food ${id} has no description or group`);
    }

    const { values, sentinels } = cells.get(id)!;
    foods.push({
      id,
      groupSlug,
      description,
      searchText: fold(description),
      values,
      sentinels,
    });
  }

  return { groups, foods };
}
