/**
 * Which TACO row each of the predecessor's foods is (#22).
 *
 * A table rather than a search, for three reasons. It is deterministic — the
 * same export imports the same way today and next year, whatever the search
 * ranking does. It works with no network, which matters because the import
 * screen is exactly where someone arrives with a file and no signal. And it can
 * be *checked*: every id below was looked up in the seeded database and read
 * against the name the predecessor gave the food, which is not something a
 * fuzzy match over 597 rows can claim.
 *
 * Doing that reading turned up three kinds of thing, and the type keeps them
 * apart on purpose:
 *
 * - The predecessor cites **one id that is the wrong food**: its `banana` is
 *   annotated TACO 194, which is *Figo, cru*. Prata banana is 182.
 * - Five foods it marked `[USDA] not in TACO` **are in TACO** — both grapes,
 *   cabotiá, castanha-do-Brasil and nozes. A sixth, skimmed milk, is there too:
 *   its comment ("TACO has powder only") is untrue, row 457 is UHT liquid. But
 *   457 prints `*` for every macro, so it stays a custom food — the predecessor
 *   reached the right answer for the wrong reason.
 * - Several foods TACO has only in **another preparation**. Row 587 is a
 *   roasted, salted almond and the predecessor means a raw one; row 40 is dry
 *   pasta, not cooked. Mapping those would quietly change the composition of a
 *   plan while claiming to quote a published table, so they stay custom foods
 *   carrying the predecessor's own numbers.
 *
 * Nothing here is a guess. A food this table has no entry for is not silently
 * dropped either — `import.ts` reports it.
 *
 * One limit worth stating: the test beside this file checks each mapped row's
 * composition against the predecessor's own numbers, which catches a
 * transposed id — the fig scores four times the tolerance. It cannot catch a
 * wrong *preparation*, because a raw almond and a roasted salted one are close
 * enough to pass any band wide enough to admit the rows whose figures came from
 * USDA. Every `otherPreparation` above is therefore a reading of the table
 * rather than a measurement, and the comment beside it is the whole argument.
 */

/** Why a food could not become a TACO reference. */
export const CUSTOM_REASONS = [
  /** No row for this food in the publication at all. */
  "notInTaco",
  /** TACO has the food, but only prepared some other way. */
  "otherPreparation",
  /**
   * TACO lists the food and prints `*` for its macros — not analysed. The app
   * refuses those rows everywhere else (`compositionFromResult`), so importing
   * one would be a plan balanced on four blanks.
   */
  "notPublished",
] as const;

export type CustomReason = (typeof CUSTOM_REASONS)[number];

/** Something true about a mapping that the user should be told. */
export const MAPPING_NOTES = [
  /** The predecessor cited a different id, and that id is a different food. */
  "corrected",
  /** It said the food was not in TACO. It is. */
  "foundInTaco",
  /** TACO's row is a different cultivar of the same fruit. */
  "otherCultivar",
] as const;

export type MappingNote = (typeof MAPPING_NOTES)[number];

export type FoodMapping =
  | { kind: "taco"; tacoId: number; note?: MappingNote }
  | { kind: "custom"; reason: CustomReason };

const taco = (tacoId: number, note?: MappingNote): FoodMapping =>
  note === undefined ? { kind: "taco", tacoId } : { kind: "taco", tacoId, note };

const custom = (reason: CustomReason): FoodMapping => ({ kind: "custom", reason });

/**
 * Keyed by the predecessor's own food key, which is the only stable name these
 * foods have — its labels are display text and have been edited before.
 */
export const FOOD_MAP: Readonly<Record<string, FoodMapping>> = {
  // Carbohydrate. The predecessor's ids, re-read row by row.
  arroz_branco_cozido: taco(3), // Arroz, tipo 1, cozido
  batata_inglesa_cozida: taco(91),
  batata_doce_cozida: taco(88),
  // 40 is *Macarrão, trigo, cru* — 370 kcal of dry pasta against the 130 the
  // predecessor uses. Not the same food on a plate.
  macarrao_cozido: custom("otherPreparation"),
  // 52 is wholemeal and 54 is sovado; neither is a slice of white sandwich loaf.
  pao_branco_fatiado: custom("otherPreparation"),
  pao_frances: taco(53),
  aveia_flocos: taco(7),
  // 551 is *Tapioca, com manteiga* — butter included, which is most of the fat.
  farinha_tapioca: custom("otherPreparation"),
  whey_protein: custom("notInTaco"),
  // The predecessor claims TACO carries milk powder only, which is wrong: row
  // 457 is UHT skimmed milk, liquid, exactly what it wanted. It is unusable
  // anyway — TACO prints `*` for all four macros, meaning not analysed — so the
  // right answer is still a custom food, for a better reason than the one given.
  leite_desnatado: custom("notPublished"),

  // Protein.
  carne_bovina_magra: taco(377), // patinho, sem gordura, grelhado
  peito_frango_grelhado: taco(410),
  lombo_porco_assado: taco(432),
  // Cited as "TACO id 1942 adjusted for cooking water loss". TACO ends at 597,
  // so that id is not a row and the adjustment is applied to nothing.
  tilapia_cozida: custom("notInTaco"),
  ovo_inteiro_cozido: taco(488),
  clara_cozida: taco(486),
  iogurte_desnatado: taco(449),

  // Spreads and fat.
  doce_de_leite: taco(501),
  // 502 is *Geléia, mocotó, natural*, which is not fruit jam.
  geleia_tradicional: custom("otherPreparation"),
  // 557 is a raw peanut grain, not the ground paste.
  pasta_amendoim: custom("otherPreparation"),
  azeite_oliva: taco(260),

  // Fruit.
  morango: taco(239),
  maca: taco(222), // Fuji, com casca
  // TACO publishes Williams (243) and Park (242); the predecessor says Packham.
  // Williams is the closer of the two, and the difference is worth stating.
  pera: taco(243, "otherCultivar"),
  mamao_papaia: taco(226),
  melao: taco(236),
  maracuja: taco(232),
  // The one outright error: 194 is *Figo, cru*.
  banana: taco(182, "corrected"),
  uva_branca: taco(256, "foundInTaco"), // Uva, Itália, crua
  uva_roxa: taco(257, "foundInTaco"), // Uva, Rubi, crua

  // Vegetables.
  cenoura_cozida: taco(109),
  beterraba_cozida: taco(97),
  brocolis_cozido: taco(100),
  abobrinha_cozida: taco(70),
  cabotia_cozida: taco(64, "foundInTaco"), // Abóbora, cabotian, cozida

  // Nuts. Two of the four are in TACO only roasted and salted, which is a
  // different food nutritionally — salt aside, the fat figures differ.
  amendoas: custom("otherPreparation"),
  castanha_para: taco(589, "foundInTaco"), // Castanha-do-Brasil, crua
  castanha_caju: custom("otherPreparation"),
  nozes: taco(597, "foundInTaco"), // Noz, crua
};

export function mappingFor(foodKey: string): FoodMapping | undefined {
  return Object.hasOwn(FOOD_MAP, foodKey) ? FOOD_MAP[foodKey] : undefined;
}
