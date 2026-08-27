/**
 * The diet presets: a plan's shape, ready to be copied and then owned (#113).
 *
 * A preset is a *starting shape*, never a prescription. Prescribing an
 * individualised diet is the nutritionist's own activity under Brazilian law
 * and the health notice (#10) says so in as many words; what this file holds is
 * the arrangement a plan takes — how many meals, what each one is made of, what
 * may stand in for what — with the quantities left as bounds for the solver and
 * for the person eating. Nobody's numbers, and nobody's clinical judgement.
 *
 * **Whose plan this is.** DietKit's. It is written here, by this project, the
 * way the exercise catalogue and the splits are (docs/DECISIONS.md § D16), and
 * for the same reason: nobody publishes one under terms we can take. In
 * particular it is *not* the plan the predecessor's calculator was built
 * around. That one came from a named nutritionist, for one person, and neither
 * of them agreed to have it published — the structure of it taught this file
 * what a plan needs to be able to say (four meals, a carbohydrate choice and a
 * protein choice at each, a fruit that swaps, a handful of nuts), and none of
 * its portions or clinical decisions are reproduced. A personal plan reaches
 * this app the way any personal data does: as an import, on the device (#22).
 *
 * **Where the food numbers come from.** TACO 4ª edição, by id — `FOODS` below
 * carries each id with the description TACO prints against it, and
 * `presets.test.ts` checks both against the extracted table. Composition is
 * never copied into this file: a preset row points at `foods.id` and the
 * foreign key is what makes a preset naming a food that does not exist fail at
 * seed time rather than render an empty meal (§ D13).
 *
 * **What it cannot say, deliberately.** The predecessor's plan also carried
 * supplements — ômega 3, creatina, canela — and a line reading *salada de
 * folhas à vontade*. Neither survives the trip: `diet_preset_items.food_id` is
 * a key into a table of food composition, a capsule has no composition in TACO,
 * and "à vontade" is not a quantity a solver can be given. The salad is here as
 * a real food with generous bounds, which is the honest translation. The
 * supplements are not here at all, and that is the right answer rather than a
 * missing feature: a supplement is not food, and a preset that recommended one
 * would be doing exactly what the health notice says this app does not do.
 */

/**
 * A food, as a preset names it: TACO's id, and TACO's own description beside it.
 *
 * The description is here so the id can be reviewed in a diff — `226` is not
 * something a reader can check, and `226, "Mamão, Papaia, cru"` is. It is
 * checked rather than trusted: `presets.test.ts` reads data/taco-4ed.json and
 * fails if the two ever drift, which is the same failure the seed's foreign key
 * catches later and this catches earlier.
 */
export interface PresetFood {
  readonly id: number;
  /** Verbatim from *Descrição dos alimentos*, TACO 4ª edição. */
  readonly taco: string;
}

/**
 * Every TACO row this file uses, named once.
 *
 * Named rather than inlined because the same food shows up in several meals —
 * the milk at breakfast, the chicken at lunch — and an id repeated by hand is
 * an id that eventually gets repeated wrong.
 */
const FOODS = {
  arrozBranco: { id: 3, taco: "Arroz, tipo 1, cozido" },
  batataInglesa: { id: 91, taco: "Batata, inglesa, cozida" },
  batataDoce: { id: 88, taco: "Batata, doce, cozida" },
  macarrao: { id: 40, taco: "Macarrão, trigo, cru" },
  mandioca: { id: 129, taco: "Mandioca, cozida" },
  cuscuz: { id: 533, taco: "Cuscuz, de milho, cozido com sal" },
  paoFrances: { id: 53, taco: "Pão, trigo, francês" },
  paoIntegral: { id: 52, taco: "Pão, trigo, forma, integral" },
  aveia: { id: 7, taco: "Aveia, flocos, crua" },
  mel: { id: 507, taco: "Mel, de abelha" },
  ovoInteiro: { id: 488, taco: "Ovo, de galinha, inteiro, cozido/10minutos" },
  clara: { id: 486, taco: "Ovo, de galinha, clara, cozida/10minutos" },
  leiteDesnatado: { id: 457, taco: "Leite, de vaca, desnatado, UHT" },
  iogurteDesnatado: { id: 449, taco: "Iogurte, natural, desnatado" },
  queijoMinas: { id: 461, taco: "Queijo, minas, frescal" },
  frangoGrelhado: { id: 410, taco: "Frango, peito, sem pele, grelhado" },
  patinhoGrelhado: {
    id: 377,
    taco: "Carne, bovina, patinho, sem gordura, grelhado",
  },
  lomboAssado: { id: 432, taco: "Porco, lombo, assado" },
  merluzaAssada: { id: 301, taco: "Merluza, filé, assado" },
  abadejoGrelhado: { id: 276, taco: "Abadejo, filé, congelado, grelhado" },
  azeite: { id: 260, taco: "Azeite, de oliva, extra virgem" },
  cenoura: { id: 109, taco: "Cenoura, cozida" },
  beterraba: { id: 97, taco: "Beterraba, cozida" },
  abobrinha: { id: 70, taco: "Abobrinha, italiana, cozida" },
  couveFlor: { id: 118, taco: "Couve-flor, cozida" },
  alface: { id: 78, taco: "Alface, crespa, crua" },
  rucula: { id: 152, taco: "Rúcula, crua" },
  agriao: { id: 75, taco: "Agrião, cru" },
  tomate: { id: 157, taco: "Tomate, com semente, cru" },
  morango: { id: 239, taco: "Morango, cru" },
  maca: { id: 222, taco: "Maçã, Fuji, com casca, crua" },
  pera: { id: 243, taco: "Pêra, Williams, crua" },
  maracuja: { id: 232, taco: "Maracujá, cru" },
  mamao: { id: 226, taco: "Mamão, Papaia, cru" },
  melao: { id: 236, taco: "Melão, cru" },
  banana: { id: 182, taco: "Banana, prata, crua" },
  uvaItalia: { id: 256, taco: "Uva, Itália, crua" },
  uvaRubi: { id: 257, taco: "Uva, Rubi, crua" },
  amendoa: { id: 587, taco: "Amêndoa, torrada, salgada" },
  castanhaDoBrasil: { id: 589, taco: "Castanha-do-Brasil, crua" },
  castanhaDeCaju: { id: 588, taco: "Castanha-de-caju, torrada, salgada" },
  noz: { id: 597, taco: "Noz, crua" },
} as const satisfies Record<string, PresetFood>;

/** Every food this file names, for the test that checks them against TACO. */
export const PRESET_FOODS: readonly PresetFood[] = Object.values(FOODS);

export interface PresetItem {
  readonly food: PresetFood;
  /** What the copied diet arrives with, before anything is solved. */
  readonly quantityG: number;
  readonly minG: number;
  readonly maxG: number;
  /**
   * Credited against the meal's target instead of being scaled (P2). Written as
   * `minG === maxG`, which is the same statement the solver reads.
   */
  readonly mandatory: boolean;
  /** The slug of the group this slot draws from, if it is a slot (#20). */
  readonly group?: string;
}

/** One way a meal can be made, chosen as a unit (#111). */
export interface PresetOption {
  readonly name: string;
  /** Exactly one option per set carries this; the loader refuses a set without. */
  readonly isDefault?: true;
  readonly items: readonly PresetItem[];
}

export interface PresetOptionSet {
  readonly name: string;
  /** Two or more. A set with one option is a decision nobody is making. */
  readonly options: readonly PresetOption[];
}

export interface PresetMeal {
  readonly name: string;
  /** A fraction of one, as `Meal.share` means it (#18). The meals add to one. */
  readonly share: number;
  /** The rows that are in this meal however it is made. */
  readonly items: readonly PresetItem[];
  readonly optionSets: readonly PresetOptionSet[];
}

export interface PresetGroup {
  /** Stable inside the preset; how an item names it. */
  readonly slug: string;
  readonly name: string;
  readonly foods: readonly PresetFood[];
}

export interface DietPresetSource {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly groups: readonly PresetGroup[];
  readonly meals: readonly PresetMeal[];
}

/** A row the solver may size, between bounds. */
function item(
  food: PresetFood,
  quantityG: number,
  minG: number,
  maxG: number,
): PresetItem {
  return { food, quantityG, minG, maxG, mandatory: false };
}

/** A slot: the same row, drawing from a group, starting on one of its foods. */
function slot(
  group: string,
  food: PresetFood,
  quantityG: number,
  minG: number,
  maxG: number,
): PresetItem {
  return { ...item(food, quantityG, minG, maxG), group };
}

/** A row the solve may not move: `minG === maxG`, credited and left alone. */
function fixed(food: PresetFood, quantityG: number): PresetItem {
  return {
    food,
    quantityG,
    minG: quantityG,
    maxG: quantityG,
    mandatory: true,
  };
}

const FRUTAS: PresetGroup = {
  slug: "frutas",
  name: "Frutas",
  foods: [
    FOODS.morango,
    FOODS.maca,
    FOODS.pera,
    FOODS.maracuja,
    FOODS.mamao,
    FOODS.melao,
    FOODS.banana,
    FOODS.uvaItalia,
    FOODS.uvaRubi,
  ],
};

const OLEAGINOSAS: PresetGroup = {
  slug: "oleaginosas",
  name: "Oleaginosas",
  foods: [
    FOODS.amendoa,
    FOODS.castanhaDoBrasil,
    FOODS.castanhaDeCaju,
    FOODS.noz,
  ],
};

const LEGUMES: PresetGroup = {
  slug: "legumes",
  name: "Legumes",
  foods: [FOODS.cenoura, FOODS.beterraba, FOODS.abobrinha, FOODS.couveFlor],
};

const SALADA: PresetGroup = {
  slug: "salada",
  name: "Salada",
  foods: [FOODS.alface, FOODS.rucula, FOODS.agriao, FOODS.tomate],
};

/**
 * The presets, in the order they are offered.
 *
 * One, for now, and that is a deliberate stopping point rather than a first of
 * five: a second preset is worth writing when it says something the first
 * cannot, and "the same four meals with different portions" is what the solver
 * is for.
 */
export const DIET_PRESETS: readonly DietPresetSource[] = [
  {
    slug: "quatro-refeicoes",
    name: "Quatro refeições",
    description:
      "Um ponto de partida: café da manhã, almoço, lanche e jantar, cada um " +
      "com uma escolha de carboidrato e uma de proteína, fruta que troca e " +
      "salada que acompanha. As quantidades são calculadas a partir das suas " +
      "metas — o que está aqui é o formato, não uma prescrição.",
    groups: [FRUTAS, OLEAGINOSAS, LEGUMES, SALADA],
    /**
     * The day, in the order it is eaten and in the proportions it is usually
     * eaten in: lunch is the largest meal, dinner a little smaller, breakfast
     * a fifth, and the afternoon snack what is left. These are the shares of
     * whatever the person's targets turn out to be, so they say when the day
     * is heaviest and nothing about how much anybody eats.
     *
     * Nobody has to keep them. A share is the one number on the plan screen
     * that is meant to be dragged, and the rest of the day re-apportions
     * around it (#18) -- somebody who works nights should move it on day one.
     */
    meals: [
      {
        name: "Café da manhã",
        share: 0.2,
        items: [],
        optionSets: [
          {
            name: "Carboidrato",
            options: [
              {
                name: "Aveia com fruta e mel",
                isDefault: true,
                items: [
                  item(FOODS.aveia, 40, 20, 80),
                  slot("frutas", FOODS.morango, 150, 80, 300),
                  item(FOODS.mel, 10, 0, 25),
                ],
              },
              {
                name: "Pão francês com fruta",
                items: [
                  item(FOODS.paoFrances, 50, 25, 120),
                  slot("frutas", FOODS.morango, 150, 80, 300),
                ],
              },
              {
                name: "Pão integral com fruta",
                items: [
                  item(FOODS.paoIntegral, 50, 25, 100),
                  slot("frutas", FOODS.morango, 150, 80, 300),
                ],
              },
              {
                name: "Cuscuz com fruta",
                items: [
                  item(FOODS.cuscuz, 120, 60, 250),
                  slot("frutas", FOODS.morango, 150, 80, 300),
                ],
              },
            ],
          },
          {
            name: "Proteína",
            options: [
              {
                name: "Ovos com leite",
                isDefault: true,
                items: [
                  item(FOODS.ovoInteiro, 100, 50, 200),
                  item(FOODS.leiteDesnatado, 200, 100, 400),
                ],
              },
              {
                name: "Claras com leite",
                items: [
                  item(FOODS.clara, 240, 120, 400),
                  item(FOODS.leiteDesnatado, 200, 100, 400),
                ],
              },
              {
                name: "Iogurte natural",
                items: [item(FOODS.iogurteDesnatado, 300, 150, 500)],
              },
              {
                name: "Queijo minas com leite",
                items: [
                  item(FOODS.queijoMinas, 80, 40, 150),
                  item(FOODS.leiteDesnatado, 200, 100, 400),
                ],
              },
              {
                name: "Frango com leite",
                items: [
                  item(FOODS.frangoGrelhado, 100, 50, 200),
                  item(FOODS.leiteDesnatado, 200, 100, 400),
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Almoço",
        share: 0.39,
        items: [
          slot("legumes", FOODS.cenoura, 100, 50, 200),
          slot("salada", FOODS.alface, 60, 20, 150),
          // The teaspoon of oil the plan is built around: stated, credited and
          // not stretched to close a fat gap the foods should be closing.
          fixed(FOODS.azeite, 5),
        ],
        optionSets: [
          {
            name: "Carboidrato",
            options: [
              {
                name: "Arroz branco",
                isDefault: true,
                items: [item(FOODS.arrozBranco, 200, 100, 350)],
              },
              {
                name: "Batata inglesa",
                items: [item(FOODS.batataInglesa, 250, 120, 400)],
              },
              {
                // TACO publishes pasta raw, so the row is the raw weight and
                // says so — the alternative is cooked grams against dry
                // numbers, which is roughly a third of the meal invented.
                name: "Macarrão (peso cru)",
                items: [item(FOODS.macarrao, 80, 40, 140)],
              },
              {
                name: "Batata-doce",
                items: [item(FOODS.batataDoce, 200, 100, 350)],
              },
            ],
          },
          {
            name: "Proteína",
            options: [
              {
                name: "Frango grelhado",
                isDefault: true,
                items: [item(FOODS.frangoGrelhado, 150, 80, 250)],
              },
              {
                name: "Patinho grelhado",
                items: [item(FOODS.patinhoGrelhado, 130, 80, 220)],
              },
              {
                name: "Merluza assada",
                items: [item(FOODS.merluzaAssada, 180, 100, 300)],
              },
            ],
          },
        ],
      },
      {
        name: "Lanche",
        share: 0.13,
        items: [slot("frutas", FOODS.banana, 120, 60, 250)],
        optionSets: [
          {
            name: "Complemento",
            options: [
              {
                name: "Oleaginosas",
                isDefault: true,
                items: [slot("oleaginosas", FOODS.castanhaDeCaju, 20, 10, 40)],
              },
              {
                name: "Iogurte natural",
                items: [item(FOODS.iogurteDesnatado, 200, 100, 350)],
              },
              {
                name: "Pão com queijo",
                items: [
                  item(FOODS.paoIntegral, 50, 25, 100),
                  item(FOODS.queijoMinas, 50, 25, 100),
                ],
              },
              {
                name: "Ovos cozidos",
                items: [item(FOODS.ovoInteiro, 100, 50, 150)],
              },
            ],
          },
        ],
      },
      {
        name: "Jantar",
        share: 0.28,
        items: [
          slot("legumes", FOODS.abobrinha, 120, 60, 250),
          slot("salada", FOODS.rucula, 60, 20, 150),
          item(FOODS.azeite, 5, 3, 15),
        ],
        optionSets: [
          {
            name: "Carboidrato",
            options: [
              {
                name: "Arroz branco",
                isDefault: true,
                items: [item(FOODS.arrozBranco, 250, 120, 450)],
              },
              {
                name: "Batata inglesa",
                items: [item(FOODS.batataInglesa, 300, 150, 500)],
              },
              {
                name: "Mandioca cozida",
                items: [item(FOODS.mandioca, 200, 100, 350)],
              },
              {
                name: "Batata-doce",
                items: [item(FOODS.batataDoce, 250, 120, 450)],
              },
            ],
          },
          {
            name: "Proteína",
            options: [
              {
                name: "Patinho grelhado",
                isDefault: true,
                items: [item(FOODS.patinhoGrelhado, 180, 100, 300)],
              },
              {
                name: "Lombo de porco assado",
                items: [item(FOODS.lomboAssado, 160, 90, 280)],
              },
              {
                name: "Abadejo grelhado",
                items: [item(FOODS.abadejoGrelhado, 220, 120, 350)],
              },
            ],
          },
        ],
      },
    ],
  },
];

export const DIET_PRESET_COUNT = DIET_PRESETS.length;

/**
 * Where these presets come from, in the shape `dataset_versions` records.
 *
 * A dataset of its own, beside TACO's rather than inside it: the composition is
 * TACO's and pinned to TACO's hash, and the arrangement is this project's and
 * pinned to this file's. Attributing the arrangement to TACO would be a
 * borrowed authority — the table publishes what food is made of and says
 * nothing about how to eat it.
 */
export const DIET_PRESET_CATALOG = {
  dataset: "dietkit-diet-presets",
  edition: "1ª edição",
  authoredOn: "2026-08-27",
  url: "https://github.com/jacksonsieben/dietkit/blob/main/src/lib/diet/presets.ts",
} as const;

export const DIET_PRESET_CATALOG_CITATION =
  "DIETKIT. Modelos de dieta do DietKit. " +
  `${DIET_PRESET_CATALOG.edition}. Campinas: DietKit, 2026. ` +
  "Elaborado pelo próprio projeto; a composição dos alimentos é da TACO " +
  "(4ª edição), referenciada por identificador. Não reproduz prescrição de " +
  "profissional e não constitui orientação nutricional individualizada. " +
  `Disponível em: ${DIET_PRESET_CATALOG.url}`;
