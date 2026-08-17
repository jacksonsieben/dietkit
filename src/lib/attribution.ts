/**
 * Where the food data comes from, and the credit that has to travel with it.
 *
 * NEPA/UNICAMP permits reproduction of TACO in whole or in part "desde que seja
 * citada a fonte" — provided the source is cited. That condition is the only
 * thing standing between this repository and a licence violation, so the
 * citation is defined here, once, and every surface renders it from here.
 * `attribution.test.ts` fails if this file and docs/TACO-LICENSING.md disagree.
 *
 * Full terms, provenance and the rules we hold ourselves to:
 * docs/TACO-LICENSING.md.
 */
export const TACO_SOURCE = {
  title: "Tabela Brasileira de Composição de Alimentos",
  acronym: "TACO",
  /** As printed on the cover, and as the ABNT reference abbreviates it. */
  edition: "4ª edição revisada e ampliada",
  editionShort: "4. ed. rev. e ampl.",
  publisher: "Núcleo de Estudos e Pesquisas em Alimentação (NEPA)",
  university: "Universidade Estadual de Campinas (UNICAMP)",
  /** For a footer, where the full names do not fit. */
  publisherShort: "NEPA/UNICAMP",
  city: "Campinas",
  year: 2011,
  /** 597 foods, per 100 g of edible portion. */
  foodCount: 597,
  url: "https://nepa.unicamp.br/publicacoes/tabela-taco-pdf/",
  contact: "taco@unicamp.br",
  /**
   * The permission notice, verbatim from PDF page 4. Quoted rather than
   * paraphrased: a paraphrase of a licence is not a licence, and a reader who
   * wants to check us should not have to download 164 pages to do it.
   */
  permission:
    "Tabela Brasileira de Composição de Alimentos – TACO é uma publicação do NEPA. " +
    "É permitida a reprodução total ou parcial do material, desde que seja citada a fonte.",
  /** Pinned so the ingest (#3) can refuse a file that is not this file. */
  sha256: "2002aec5615b5b1395aaa8fa675635bbb7f712c33f278af5e332f1cac8f108c8",
} as const;

/**
 * The agreed reference, ABNT form, matching the publication's own ficha
 * catalográfica. This exact string is what "citada a fonte" means for DietKit.
 */
export const TACO_CITATION =
  "NÚCLEO DE ESTUDOS E PESQUISAS EM ALIMENTAÇÃO (NEPA). " +
  "Tabela brasileira de composição de alimentos — TACO. " +
  "4. ed. rev. e ampl. Campinas: NEPA-UNICAMP, 2011. " +
  `Disponível em: ${TACO_SOURCE.url}`;
