import type { FoodRef } from "@/lib/storage/types";

/**
 * What a helping of a food actually looks like (#D).
 *
 * Two answers to one complaint. A plan that says `307 g` of egg is arithmetic
 * nobody can picture, and a new row that may grow to 500 g of anything lets the
 * solver answer a protein gap with six eggs at breakfast — both are the app
 * sounding like a spreadsheet rather than like a meal.
 *
 * ## Where these numbers come from, and where they do not
 *
 * Not from TACO. The published table is composition per 100 g of edible portion
 * and says nothing about what one egg weighs, so every gram figure below is
 * this app's own estimate of a common Brazilian helping, rounded to something a
 * kitchen scale would agree with. That is why the app draws them with a `~` and
 * never stores them: grams remain the only unit that crosses into storage
 * (docs/DECISIONS.md § D7), the portion is computed from the grams each time it
 * is drawn, and a figure here being a little off moves a hint on screen and
 * nothing else. Nothing is solved, saved, or exported in portions.
 *
 * That containment is the whole reason it is safe to ship estimates at all. The
 * alternative — an authored `servingG` written onto items — would put a number
 * TACO never published inside the user's plan, where a later correction could
 * not reach it.
 *
 * ## Why only some foods
 *
 * A portion has to be a unit people count. Eggs, slices, spoons and glasses
 * are; 100 g of `Carne, bovina, bucho, cru` is not, and inventing a unit for it
 * would be the noise this screen is trying to remove. So the table covers the
 * staples people actually build days out of and stays silent elsewhere, which
 * reads as an occasional extra hint rather than a column of guesses.
 */

/**
 * The units, as things you count rather than as measurements.
 *
 * Each is a message key under `Portions`, pluralised there because Portuguese
 * needs it — `1 colher de sopa`, `2 colheres de sopa` — and a unit whose plural
 * lived here as a string would be a translation hiding in the logic.
 */
export type PortionUnit =
  | "ovo"
  | "fatia"
  | "unidade"
  | "pao"
  | "colherSopa"
  | "colherCha"
  | "copo"
  | "file"
  | "concha"
  | "bife"
  | "pote"
  | "folha";

export interface Portion {
  readonly unit: PortionUnit;
  /** One of them, in grams of edible portion. */
  readonly gramsPerUnit: number;
}

/**
 * Keyed by TACO id, which is the identifier the plan already stores, so a row
 * gains a portion without gaining a field. An id the table does not mention is
 * a food shown in grams alone — the deliberate common case.
 *
 * Exported for the test that reads every id back against the published table:
 * a typo here is a portion silently attached to the wrong food, and that is not
 * something the screen could show you.
 */
export const PORTIONS: ReadonlyMap<number, Portion> = new Map([
  // Ovos. The unit the whole feature was named after.
  [485, { unit: "unidade", gramsPerUnit: 9 } as const], // codorna
  [486, { unit: "unidade", gramsPerUnit: 33 } as const], // clara
  [487, { unit: "unidade", gramsPerUnit: 17 } as const], // gema
  [488, { unit: "ovo", gramsPerUnit: 50 } as const], // inteiro, cozido
  [489, { unit: "ovo", gramsPerUnit: 50 } as const], // inteiro, cru
  [490, { unit: "ovo", gramsPerUnit: 50 } as const], // inteiro, frito

  // Cereais. Rice and oats by the spoon, bread by the slice or the roll.
  [1, { unit: "colherSopa", gramsPerUnit: 25 } as const],
  [3, { unit: "colherSopa", gramsPerUnit: 25 } as const],
  [5, { unit: "colherSopa", gramsPerUnit: 25 } as const],
  [7, { unit: "colherSopa", gramsPerUnit: 15 } as const], // aveia em flocos
  [8, { unit: "unidade", gramsPerUnit: 6 } as const], // biscoito maisena
  [13, { unit: "unidade", gramsPerUnit: 6 } as const], // cream cracker
  [33, { unit: "colherSopa", gramsPerUnit: 12 } as const], // farinha de milho
  [35, { unit: "colherSopa", gramsPerUnit: 10 } as const], // farinha de trigo
  [48, { unit: "fatia", gramsPerUnit: 25 } as const], // pão de aveia, forma
  [50, { unit: "fatia", gramsPerUnit: 25 } as const], // pão de glúten, forma
  [51, { unit: "fatia", gramsPerUnit: 25 } as const], // pão de milho, forma
  [52, { unit: "fatia", gramsPerUnit: 25 } as const], // forma, integral
  [53, { unit: "pao", gramsPerUnit: 50 } as const], // francês
  [54, { unit: "fatia", gramsPerUnit: 30 } as const], // sovado
  [63, { unit: "fatia", gramsPerUnit: 8 } as const], // torrada

  // Frutas, almost all of which are counted one at a time.
  [163, { unit: "colherSopa", gramsPerUnit: 30 } as const], // abacate
  [164, { unit: "fatia", gramsPerUnit: 75 } as const], // abacaxi
  [172, { unit: "unidade", gramsPerUnit: 30 } as const], // ameixa
  [175, { unit: "unidade", gramsPerUnit: 100 } as const], // banana da terra
  [178, { unit: "unidade", gramsPerUnit: 65 } as const], // banana maçã
  [179, { unit: "unidade", gramsPerUnit: 70 } as const], // banana nanica
  [182, { unit: "unidade", gramsPerUnit: 60 } as const], // banana prata
  [186, { unit: "unidade", gramsPerUnit: 60 } as const], // caju
  [190, { unit: "unidade", gramsPerUnit: 90 } as const], // carambola
  [194, { unit: "unidade", gramsPerUnit: 50 } as const], // figo
  [197, { unit: "unidade", gramsPerUnit: 130 } as const], // goiaba branca
  [200, { unit: "unidade", gramsPerUnit: 130 } as const], // goiaba vermelha
  [203, { unit: "unidade", gramsPerUnit: 8 } as const], // jabuticaba
  [207, { unit: "unidade", gramsPerUnit: 75 } as const], // kiwi
  [208, { unit: "unidade", gramsPerUnit: 130 } as const], // laranja baía
  [209, { unit: "copo", gramsPerUnit: 200 } as const],
  [210, { unit: "unidade", gramsPerUnit: 130 } as const], // laranja da terra
  [211, { unit: "copo", gramsPerUnit: 200 } as const],
  [213, { unit: "copo", gramsPerUnit: 200 } as const],
  [214, { unit: "unidade", gramsPerUnit: 130 } as const], // laranja pêra
  [215, { unit: "copo", gramsPerUnit: 200 } as const],
  [216, { unit: "unidade", gramsPerUnit: 130 } as const], // laranja valência
  [217, { unit: "copo", gramsPerUnit: 200 } as const],
  [220, { unit: "unidade", gramsPerUnit: 65 } as const], // limão tahiti
  [221, { unit: "unidade", gramsPerUnit: 130 } as const], // maçã argentina
  [222, { unit: "unidade", gramsPerUnit: 130 } as const], // maçã fuji
  [225, { unit: "fatia", gramsPerUnit: 150 } as const], // mamão formosa
  [226, { unit: "unidade", gramsPerUnit: 160 } as const], // mamão papaia
  [228, { unit: "unidade", gramsPerUnit: 150 } as const], // manga haden
  [229, { unit: "unidade", gramsPerUnit: 150 } as const], // manga palmer
  [231, { unit: "unidade", gramsPerUnit: 150 } as const], // manga tommy
  [232, { unit: "unidade", gramsPerUnit: 40 } as const], // maracujá
  [235, { unit: "fatia", gramsPerUnit: 200 } as const], // melancia
  [236, { unit: "fatia", gramsPerUnit: 120 } as const], // melão
  [237, { unit: "unidade", gramsPerUnit: 90 } as const], // mexerica murcote
  [238, { unit: "unidade", gramsPerUnit: 90 } as const], // mexerica rio
  [239, { unit: "unidade", gramsPerUnit: 12 } as const], // morango
  [242, { unit: "unidade", gramsPerUnit: 130 } as const], // pêra park
  [243, { unit: "unidade", gramsPerUnit: 130 } as const], // pêra williams
  [244, { unit: "unidade", gramsPerUnit: 75 } as const], // pêssego
  [251, { unit: "unidade", gramsPerUnit: 90 } as const], // tangerina poncã
  [252, { unit: "copo", gramsPerUnit: 200 } as const],
  [256, { unit: "unidade", gramsPerUnit: 8 } as const], // uva itália
  [257, { unit: "unidade", gramsPerUnit: 8 } as const], // uva rubi

  // Leite e derivados. Milk by the glass, cheese by the slice.
  [447, { unit: "colherSopa", gramsPerUnit: 15 } as const], // creme de leite
  [448, { unit: "pote", gramsPerUnit: 170 } as const],
  [449, { unit: "pote", gramsPerUnit: 170 } as const],
  [450, { unit: "pote", gramsPerUnit: 170 } as const],
  [451, { unit: "pote", gramsPerUnit: 170 } as const],
  [452, { unit: "pote", gramsPerUnit: 170 } as const],
  [453, { unit: "colherSopa", gramsPerUnit: 20 } as const], // condensado
  [454, { unit: "copo", gramsPerUnit: 200 } as const],
  [455, { unit: "copo", gramsPerUnit: 200 } as const],
  [456, { unit: "colherSopa", gramsPerUnit: 15 } as const], // pó, desnatado
  [457, { unit: "copo", gramsPerUnit: 200 } as const],
  [458, { unit: "copo", gramsPerUnit: 200 } as const],
  [459, { unit: "colherSopa", gramsPerUnit: 15 } as const], // pó, integral
  [460, { unit: "pote", gramsPerUnit: 80 } as const], // fermentado
  [461, { unit: "fatia", gramsPerUnit: 30 } as const], // minas frescal
  [462, { unit: "fatia", gramsPerUnit: 30 } as const], // minas meia cura
  [463, { unit: "fatia", gramsPerUnit: 20 } as const], // mozarela
  [464, { unit: "colherSopa", gramsPerUnit: 10 } as const], // parmesão
  [465, { unit: "fatia", gramsPerUnit: 20 } as const], // pasteurizado
  [467, { unit: "fatia", gramsPerUnit: 20 } as const], // prato
  [468, { unit: "colherSopa", gramsPerUnit: 20 } as const], // requeijão
  [469, { unit: "fatia", gramsPerUnit: 30 } as const], // ricota

  // Carnes. A steak, a fillet, a thigh — never "a gram of chicken".
  [323, { unit: "fatia", gramsPerUnit: 15 } as const], // apresuntado
  [326, { unit: "colherSopa", gramsPerUnit: 25 } as const], // acém moído
  [344, { unit: "bife", gramsPerUnit: 100 } as const],
  [346, { unit: "bife", gramsPerUnit: 100 } as const],
  [358, { unit: "bife", gramsPerUnit: 100 } as const], // filé mignon
  [368, { unit: "bife", gramsPerUnit: 100 } as const], // maminha
  [370, { unit: "bife", gramsPerUnit: 100 } as const], // alcatra
  [377, { unit: "bife", gramsPerUnit: 100 } as const], // patinho
  [381, { unit: "bife", gramsPerUnit: 100 } as const], // picanha c/ gordura
  [383, { unit: "bife", gramsPerUnit: 100 } as const], // picanha s/ gordura
  [391, { unit: "unidade", gramsPerUnit: 45 } as const], // asa de frango
  [396, { unit: "unidade", gramsPerUnit: 70 } as const], // coxa c/ pele
  [398, { unit: "unidade", gramsPerUnit: 60 } as const], // coxa s/ pele
  [406, { unit: "file", gramsPerUnit: 120 } as const], // peito c/ pele
  [408, { unit: "file", gramsPerUnit: 100 } as const], // peito cozido
  [410, { unit: "file", gramsPerUnit: 100 } as const], // peito grelhado
  [411, { unit: "unidade", gramsPerUnit: 95 } as const], // sobrecoxa c/ pele
  [413, { unit: "unidade", gramsPerUnit: 80 } as const], // sobrecoxa s/ pele
  [417, { unit: "unidade", gramsPerUnit: 80 } as const], // hambúrguer
  [420, { unit: "unidade", gramsPerUnit: 50 } as const], // linguiça de frango
  [423, { unit: "unidade", gramsPerUnit: 55 } as const], // linguiça de porco
  [424, { unit: "fatia", gramsPerUnit: 15 } as const], // mortadela
  [429, { unit: "bife", gramsPerUnit: 80 } as const], // bisteca
  [432, { unit: "fatia", gramsPerUnit: 80 } as const], // lombo assado
  [438, { unit: "fatia", gramsPerUnit: 15 } as const], // presunto c/ capa
  [439, { unit: "fatia", gramsPerUnit: 15 } as const], // presunto s/ capa
  [443, { unit: "fatia", gramsPerUnit: 10 } as const], // salame

  // Pescados.
  [276, { unit: "file", gramsPerUnit: 100 } as const], // abadejo
  [277, { unit: "colherSopa", gramsPerUnit: 20 } as const], // atum em conserva
  [284, { unit: "unidade", gramsPerUnit: 10 } as const], // camarão
  [301, { unit: "file", gramsPerUnit: 100 } as const], // merluza
  [308, { unit: "file", gramsPerUnit: 100 } as const], // pescada
  [315, { unit: "file", gramsPerUnit: 130 } as const], // salmão c/ pele
  [317, { unit: "file", gramsPerUnit: 120 } as const], // salmão s/ pele
  [319, { unit: "unidade", gramsPerUnit: 25 } as const], // sardinha em conserva

  // Leguminosas. Beans are ladled, not weighed.
  [557, { unit: "colherSopa", gramsPerUnit: 12 } as const], // amendoim cru
  [558, { unit: "colherSopa", gramsPerUnit: 12 } as const], // amendoim torrado
  [560, { unit: "colherSopa", gramsPerUnit: 20 } as const], // ervilha
  [561, { unit: "concha", gramsPerUnit: 80 } as const], // carioca
  [563, { unit: "concha", gramsPerUnit: 80 } as const], // fradinho
  [565, { unit: "concha", gramsPerUnit: 80 } as const], // jalo
  [567, { unit: "concha", gramsPerUnit: 80 } as const], // preto
  [569, { unit: "concha", gramsPerUnit: 80 } as const], // rajado
  [571, { unit: "concha", gramsPerUnit: 80 } as const], // rosinha
  [573, { unit: "concha", gramsPerUnit: 80 } as const], // roxo
  [577, { unit: "concha", gramsPerUnit: 80 } as const], // lentilha
  [579, { unit: "unidade", gramsPerUnit: 22 } as const], // paçoca
  [584, { unit: "fatia", gramsPerUnit: 50 } as const], // tofu

  // Nozes e sementes, which are the foods most often eaten by the handful and
  // most often wildly misjudged in grams.
  [587, { unit: "unidade", gramsPerUnit: 1.2 } as const], // amêndoa
  [588, { unit: "unidade", gramsPerUnit: 1.5 } as const], // castanha-de-caju
  [589, { unit: "unidade", gramsPerUnit: 4 } as const], // castanha-do-Brasil
  [590, { unit: "colherSopa", gramsPerUnit: 10 } as const], // coco
  [593, { unit: "colherSopa", gramsPerUnit: 9 } as const], // gergelim
  [594, { unit: "colherSopa", gramsPerUnit: 10 } as const], // linhaça
  [597, { unit: "unidade", gramsPerUnit: 5 } as const], // noz

  // Gorduras. The group where a gram figure misleads most: 100 g of olive oil
  // is most of a day's energy and looks, on a screen, like a small number.
  [260, { unit: "colherSopa", gramsPerUnit: 13 } as const], // azeite
  [261, { unit: "colherCha", gramsPerUnit: 5 } as const], // manteiga c/ sal
  [262, { unit: "colherCha", gramsPerUnit: 5 } as const], // manteiga s/ sal
  [263, { unit: "colherCha", gramsPerUnit: 5 } as const],
  [264, { unit: "colherCha", gramsPerUnit: 5 } as const],
  [265, { unit: "colherCha", gramsPerUnit: 5 } as const],
  [266, { unit: "colherCha", gramsPerUnit: 5 } as const],
  [268, { unit: "colherSopa", gramsPerUnit: 13 } as const], // canola
  [269, { unit: "colherSopa", gramsPerUnit: 13 } as const], // girassol
  [270, { unit: "colherSopa", gramsPerUnit: 13 } as const], // milho
  [272, { unit: "colherSopa", gramsPerUnit: 13 } as const], // soja

  // Verduras e hortaliças.
  [70, { unit: "colherSopa", gramsPerUnit: 25 } as const], // abobrinha cozida
  [82, { unit: "unidade", gramsPerUnit: 3 } as const], // alho
  [86, { unit: "unidade", gramsPerUnit: 60 } as const], // batata baroa
  [88, { unit: "unidade", gramsPerUnit: 100 } as const], // batata doce
  [91, { unit: "unidade", gramsPerUnit: 90 } as const], // batata inglesa
  [93, { unit: "colherSopa", gramsPerUnit: 20 } as const], // batata frita
  [97, { unit: "colherSopa", gramsPerUnit: 20 } as const], // beterraba
  [100, { unit: "colherSopa", gramsPerUnit: 20 } as const], // brócolis
  [107, { unit: "unidade", gramsPerUnit: 70 } as const], // cebola
  [109, { unit: "colherSopa", gramsPerUnit: 20 } as const], // cenoura cozida
  [110, { unit: "unidade", gramsPerUnit: 70 } as const], // cenoura crua
  [112, { unit: "colherSopa", gramsPerUnit: 25 } as const], // chuchu
  [115, { unit: "folha", gramsPerUnit: 15 } as const], // couve manteiga
  [118, { unit: "colherSopa", gramsPerUnit: 20 } as const], // couve-flor
  [121, { unit: "colherSopa", gramsPerUnit: 10 } as const], // farinha de mandioca
  [129, { unit: "colherSopa", gramsPerUnit: 30 } as const], // mandioca cozida
  [140, { unit: "unidade", gramsPerUnit: 20 } as const], // pão de queijo
  [142, { unit: "unidade", gramsPerUnit: 130 } as const], // pepino
  [157, { unit: "unidade", gramsPerUnit: 90 } as const], // tomate
  [161, { unit: "unidade", gramsPerUnit: 90 } as const], // tomate salada
  [77, { unit: "folha", gramsPerUnit: 10 } as const], // alface americana
  [78, { unit: "folha", gramsPerUnit: 10 } as const], // alface crespa
  [79, { unit: "folha", gramsPerUnit: 10 } as const], // alface lisa
  [80, { unit: "folha", gramsPerUnit: 10 } as const], // alface roxa

  // Açúcares e bebidas.
  [491, { unit: "colherSopa", gramsPerUnit: 12 } as const], // achocolatado
  [492, { unit: "colherSopa", gramsPerUnit: 12 } as const], // cristal
  [493, { unit: "colherSopa", gramsPerUnit: 12 } as const], // mascavo
  [494, { unit: "colherSopa", gramsPerUnit: 12 } as const], // refinado
  [501, { unit: "colherSopa", gramsPerUnit: 20 } as const], // doce de leite
  [507, { unit: "colherSopa", gramsPerUnit: 20 } as const], // mel
  [474, { unit: "copo", gramsPerUnit: 200 } as const],
  [478, { unit: "copo", gramsPerUnit: 200 } as const], // água de coco
  [480, { unit: "copo", gramsPerUnit: 200 } as const],
  [481, { unit: "copo", gramsPerUnit: 200 } as const],
  [482, { unit: "copo", gramsPerUnit: 200 } as const],
  [483, { unit: "copo", gramsPerUnit: 200 } as const],
]);

/**
 * The portion for a food, if it has one people count.
 *
 * A custom food never does: the user already told us its serving in grams when
 * they wrote it down, and that number is on the item itself.
 */
export function portionOf(food: FoodRef): Portion | undefined {
  return food.source === "taco" ? PORTIONS.get(food.tacoId) : undefined;
}

/**
 * How many of them `grams` is, or nothing when the answer would not help.
 *
 * Rounded to a half below ten and to a whole above it, because "2,5 ovos" is a
 * thing a person can picture and "12,5 morangos" is a precision the estimate
 * behind it does not have.
 *
 * Silent under a fifth of a portion: a pinch of garlic is not "~0 unidades",
 * and a hint that rounds to zero is worse than no hint. Silent again past a
 * hundred, where the count has stopped being a mental image.
 */
export function portionCount(
  grams: number,
  portion: Portion,
): number | undefined {
  const exact = grams / portion.gramsPerUnit;
  if (exact < 0.2 || exact > 100) return undefined;

  return exact < 10 ? Math.round(exact * 2) / 2 : Math.round(exact);
}

/**
 * The largest amount of a food that a new row may grow to, by TACO group.
 *
 * Every row used to arrive able to reach 500 g, which is how a solver closing a
 * protein gap arrives at six eggs, and 500 g of olive oil — 4.400 kcal — was a
 * legal answer to a 2.000 kcal day. A ceiling per group is coarse on purpose:
 * it is a starting point the user can raise on any row, so it needs to be
 * plausible rather than correct, and a per-food table of maxima would be a
 * hundred numbers to defend instead of fifteen.
 *
 * Reading the TACO group here is a deliberate exception to the rule that the
 * app does not infer meaning from the table's categories — the one in
 * `SubstitutionGroup` says nothing may guess *interchangeability* from it. This
 * guesses a default bound, which the user overrides on the row itself and which
 * changes no number already in a plan unless the user asks it to (see
 * `looseCeilings`).
 */
export const CEILING_BY_GROUP: Readonly<Record<string, number>> = {
  "gorduras-e-oleos": 60,
  "nozes-e-sementes": 100,
  "produtos-acucarados": 100,
  "ovos-e-derivados": 200,
  "carnes-e-derivados": 300,
  "pescados-e-frutos-do-mar": 300,
  "cereais-e-derivados": 400,
  "leguminosas-e-derivados": 400,
  "verduras-hortalicas-e-derivados": 400,
  "frutas-e-derivados": 400,
  "leite-e-derivados": 400,
};

/**
 * The ceiling for a group, or nothing for a group with no opinion — the drinks,
 * the prepared dishes, the miscellany, and every custom food, which keep the
 * old 500 g default because a plate of feijoada and a scoop of whey have no
 * shared sensible bound.
 */
export function ceilingFor(groupSlug: string | undefined): number | undefined {
  return groupSlug === undefined ? undefined : CEILING_BY_GROUP[groupSlug];
}

/**
 * Which group a stored row belongs to, without the table in front of us.
 *
 * A plan keeps `{ tacoId, name, per100g }` per food and nothing else — the
 * snapshot exists so a plan reads offline, and it was never going to carry a
 * category nothing used. So a row saved yesterday cannot say it is an oil, and
 * `ceilingFor` has no slug to answer about.
 *
 * The published table answers it anyway, by how it is numbered: TACO 4ª edição
 * lists its 597 foods grouped, each group one unbroken run of ids, which makes
 * the whole mapping fifteen pairs instead of six hundred. Nothing about that is
 * guaranteed by NEPA — it is an observation about the file this app ships — so
 * `portions.test.ts` checks every id in `data/taco-4ed.json` against it, and a
 * re-ingest that renumbered anything would fail there rather than quietly hang
 * the wrong ceiling on a food.
 *
 * The alternative was a six-hundred-entry map generated into the bundle, which
 * is the same fact written at forty times the size, or a network lookup, which
 * an offline app cannot make.
 */
const GROUP_RUNS: readonly (readonly [
  slug: string,
  firstId: number,
  lastId: number,
])[] = [
  ["cereais-e-derivados", 1, 63],
  ["verduras-hortalicas-e-derivados", 64, 162],
  ["frutas-e-derivados", 163, 258],
  ["gorduras-e-oleos", 259, 272],
  ["pescados-e-frutos-do-mar", 273, 322],
  ["carnes-e-derivados", 323, 445],
  ["leite-e-derivados", 446, 469],
  ["bebidas-alcoolicas-e-nao-alcoolicas", 470, 483],
  ["ovos-e-derivados", 484, 490],
  ["produtos-acucarados", 491, 510],
  ["miscelaneas", 511, 519],
  ["outros-alimentos-industrializados", 520, 524],
  ["alimentos-preparados", 525, 556],
  ["leguminosas-e-derivados", 557, 586],
  ["nozes-e-sementes", 587, 597],
];

export function groupOfTacoFood(tacoId: number): string | undefined {
  return GROUP_RUNS.find(
    ([, first, last]) => tacoId >= first && tacoId <= last,
  )?.[0];
}

/**
 * The ceiling for a food a plan already points at.
 *
 * Custom foods get none, for `ceilingFor`'s reason and one more: the user
 * already said what a serving of their own food weighs, and a guess from a
 * category this app invented has no business overruling it.
 */
export function ceilingForFood(food: FoodRef): number | undefined {
  return food.source === "taco"
    ? ceilingFor(groupOfTacoFood(food.tacoId))
    : undefined;
}
