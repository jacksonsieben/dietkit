/**
 * The nutrient columns of TACO's centesimal composition table, in the order the
 * publication prints them.
 *
 * This exists as data, not just as columns, because two things need to agree
 * about what a nutrient is: the `foods` table and the sentinel map stored
 * alongside it. `nutrients.test.ts` fails if they drift.
 *
 * No pt-BR labels here — those are user-facing strings and belong in
 * `messages/` (docs/DECISIONS.md § D5). This module is about the data.
 */

export type NutrientUnit = "g" | "mg" | "µg" | "kcal" | "kJ" | "%";

/**
 * What TACO prints in a cell when it does not print a number.
 *
 * - `NA` — *não aplicável*: the nutrient does not apply to this food.
 * - `Tr` — *traço*: present in traces. NEPA's own definition (PDF p. 25) is a
 *   value that rounds to between 0 and 0,05, or one below the detection limit.
 * - `*` — NEPA withdrew the figure: *"as análises estão sendo reavaliadas"*.
 *   It replaces the number rather than annotating one, and it can take out most
 *   of a row — food 450, "Iogurte, sabor abacaxi", prints it in ten of its
 *   eleven left-hand cells.
 *
 * All three are stored as a NULL value plus a sentinel rather than as `0`,
 * because none is a measured zero and the table never claims they are. A cell
 * that is simply blank in the publication is NULL with no sentinel — a fourth
 * state, and collapsing it into any of these would invent data.
 *
 * `*` is the one a caller has to think about. `NA` and `Tr` are honest zeroes
 * for arithmetic; `*` is a missing measurement, so a food carrying it on a
 * macro has no usable energy or macro figures at all and must not be offered as
 * one that adds nothing to a plan. Because the value is NULL either way, that
 * is a `protein_g IS NOT NULL` filter at the query, not a special case here.
 */
export type NutrientSentinel = "NA" | "Tr" | "*";

/** Sparse by design: most foods have a sentinel in only a few cells. */
export type NutrientSentinels = Partial<Record<NutrientKey, NutrientSentinel>>;

interface NutrientDefinition {
  /** Column name on `foods`, and the key used in the sentinel map. */
  readonly key: string;
  readonly unit: NutrientUnit;
  /**
   * Tagname per INFOODS/USDA, quoted as TACO prints it — including
   * `RIFB` for riboflavin, which is the publication's own transposition of
   * `RIBF`. Quoting beats correcting: this column says what the source says.
   *
   * `NA` on sodium is the chemical symbol, unrelated to the `NA` sentinel.
   */
  readonly tagname: string;
}

/**
 * Order matches the printed table, which is split across two page spreads:
 * moisture through magnesium, then manganese through vitamin C. Keeping the
 * order means a reader can hold the PDF next to this file.
 */
export const NUTRIENTS = [
  { key: "moisturePercent", unit: "%", tagname: "WATER" },
  { key: "energyKcal", unit: "kcal", tagname: "ENERC" },
  { key: "energyKj", unit: "kJ", tagname: "ENERC" },
  { key: "proteinG", unit: "g", tagname: "PROCNT" },
  { key: "fatG", unit: "g", tagname: "FAT" },
  { key: "cholesterolMg", unit: "mg", tagname: "CHOLE" },
  { key: "carbG", unit: "g", tagname: "CHOCDF" },
  { key: "fiberG", unit: "g", tagname: "FIBTG" },
  { key: "ashG", unit: "g", tagname: "ASH" },
  { key: "calciumMg", unit: "mg", tagname: "CA" },
  { key: "magnesiumMg", unit: "mg", tagname: "MG" },
  { key: "manganeseMg", unit: "mg", tagname: "MN" },
  { key: "phosphorusMg", unit: "mg", tagname: "P" },
  { key: "ironMg", unit: "mg", tagname: "FE" },
  { key: "sodiumMg", unit: "mg", tagname: "NA" },
  { key: "potassiumMg", unit: "mg", tagname: "K" },
  { key: "copperMg", unit: "mg", tagname: "CU" },
  { key: "zincMg", unit: "mg", tagname: "ZN" },
  { key: "retinolMcg", unit: "µg", tagname: "RETOL" },
  { key: "retinolEquivalentMcg", unit: "µg", tagname: "VITA" },
  { key: "retinolActivityEquivalentMcg", unit: "µg", tagname: "VITA" },
  { key: "thiamineMg", unit: "mg", tagname: "THIA" },
  { key: "riboflavinMg", unit: "mg", tagname: "RIFB" },
  { key: "pyridoxineMg", unit: "mg", tagname: "VITB6A" },
  { key: "niacinMg", unit: "mg", tagname: "NIA" },
  { key: "vitaminCMg", unit: "mg", tagname: "VITC" },
] as const satisfies readonly NutrientDefinition[];

/** Derived from the list above, so there is exactly one place to add a nutrient. */
export type NutrientKey = (typeof NUTRIENTS)[number]["key"];

export const NUTRIENT_KEYS: readonly NutrientKey[] = NUTRIENTS.map(
  (nutrient) => nutrient.key,
);

const UNIT_BY_KEY = new Map<NutrientKey, NutrientUnit>(
  NUTRIENTS.map((nutrient) => [nutrient.key, nutrient.unit]),
);

export function nutrientUnit(key: NutrientKey): NutrientUnit {
  const unit = UNIT_BY_KEY.get(key);
  if (unit === undefined) {
    throw new Error(`Unknown nutrient: ${key}`);
  }
  return unit;
}

/** A cell of the published table: a number, or a reason there isn't one. */
export type NutrientCell =
  | { kind: "value"; value: number }
  | { kind: "sentinel"; sentinel: NutrientSentinel }
  | { kind: "absent" };

/** The shape `readCell` needs — satisfied by a `foods` row, and by a fixture. */
export interface NutrientCarrier {
  sentinels: NutrientSentinels;
}

/**
 * Reads one cell the way the publication prints it.
 *
 * Callers that need arithmetic want `numericValue`; callers that render want
 * this, because `NA` and `Tr` must not be displayed as `0`. Rendering a `0`
 * where TACO printed `NA` would attribute a measurement to NEPA that NEPA
 * never made — see docs/TACO-LICENSING.md § 5.
 */
export function readCell<TKey extends NutrientKey>(
  food: NutrientCarrier & Partial<Record<TKey, number | null>>,
  key: TKey,
): NutrientCell {
  const value = food[key];
  if (typeof value === "number") {
    return { kind: "value", value };
  }

  const sentinel = food.sentinels[key];
  return sentinel === undefined
    ? { kind: "absent" }
    : { kind: "sentinel", sentinel };
}

/**
 * The same cell as a number, for summing.
 *
 * `Tr` and `NA` come back as 0: a trace rounds to zero at the gram precision a
 * diet is built in, and a nutrient that does not apply contributes nothing.
 * This is the only place that collapse is allowed to happen.
 *
 * `*` and a blank cell also come back as 0, and there the 0 is an assumption
 * rather than a fact — the measurement is missing, not small. Summing a food
 * with withheld macros understates the total silently, so callers building a
 * plan filter those foods out first instead of relying on this to be safe.
 */
export function numericValue<TKey extends NutrientKey>(
  food: NutrientCarrier & Partial<Record<TKey, number | null>>,
  key: TKey,
): number {
  const cell = readCell(food, key);
  return cell.kind === "value" ? cell.value : 0;
}
