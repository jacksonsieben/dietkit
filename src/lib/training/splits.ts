import { exerciseBySlug } from "./catalog.ts";

/**
 * The splits: what to do with the 117 movements in catalog.ts (#74).
 *
 * A list of exercises is not an answer to "what should I be working out
 * today". A split is — it is the thing that turns a catalog into a screen with
 * one session on it. These four are the ones a Brazilian gym actually runs:
 * full body for someone starting or short on time, upper/lower, the ABC, and
 * push/pull/legs.
 *
 * Authored here for the same three reasons the catalog is (docs/DECISIONS.md
 * § D16). Nobody publishes these under terms we can take; they are read in a
 * basement with no signal, so they ship in the bundle; and they are seeded into
 * Neon because `training_preset_items.exercise_slug` is a foreign key to
 * `exercises.slug`.
 *
 * What is deliberately absent is a load. A rep range is a prescription and it
 * is the same for everyone reading this build; a kilogram is what one person
 * lifted on one day, which is personal data and stays on their device (§ D1).
 *
 * The exercises are named by slug rather than repeated here, so a movement
 * renamed in the catalog cannot leave a split quietly pointing at a name that
 * no longer exists — `splits.test.ts` resolves every one of them, which is the
 * bundled counterpart of the foreign key the seed relies on.
 */

export interface SplitItem {
  /** A slug from catalog.ts. */
  readonly exercise: string;
  readonly sets: number;
  /** The prescribed range, inclusive: `[8, 12]` is "8 a 12". */
  readonly reps: readonly [number, number];
  /** Between sets. Seconds, because that is what a gym clock counts. */
  readonly restSeconds: number;
}

export interface SplitDay {
  readonly name: string;
  readonly items: readonly SplitItem[];
}

export interface Split {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly days: readonly SplitDay[];
}

/** Shorthand, so a day reads as a session rather than as a wall of keys. */
function item(
  exercise: string,
  sets: number,
  repMin: number,
  repMax: number,
  restSeconds: number,
): SplitItem {
  return { exercise, sets, reps: [repMin, repMax], restSeconds };
}

export const SPLITS: readonly Split[] = [
  {
    slug: "corpo-inteiro-3x",
    name: "Corpo inteiro",
    description:
      "Três treinos por semana, o corpo todo em cada um. Para quem está " +
      "começando ou não consegue garantir mais de três dias.",
    days: [
      {
        name: "Treino A",
        items: [
          item("agachamento-livre", 3, 6, 10, 150),
          item("supino-reto-barra", 3, 6, 10, 150),
          item("remada-curvada-barra", 3, 8, 12, 120),
          item("desenvolvimento-halteres", 3, 8, 12, 90),
          item("levantamento-terra-romeno", 3, 8, 12, 120),
          item("abdominal-supra", 3, 12, 20, 60),
        ],
      },
      {
        name: "Treino B",
        items: [
          item("levantamento-terra", 3, 5, 8, 180),
          item("supino-inclinado-halteres", 3, 8, 12, 120),
          item("puxada-frontal", 3, 8, 12, 120),
          item("elevacao-lateral-halteres", 3, 12, 15, 60),
          item("cadeira-extensora", 3, 10, 15, 90),
          item("rosca-direta-barra", 3, 8, 12, 90),
        ],
      },
      {
        name: "Treino C",
        items: [
          item("leg-press-45", 4, 10, 15, 120),
          item("supino-reto-halteres", 3, 8, 12, 120),
          item("remada-baixa-cabo", 3, 10, 12, 90),
          item("desenvolvimento-militar-barra", 3, 6, 10, 120),
          item("mesa-flexora", 3, 10, 15, 90),
          item("triceps-corda-cabo", 3, 10, 15, 60),
          item("panturrilha-em-pe-maquina", 4, 12, 20, 60),
        ],
      },
    ],
  },
  {
    slug: "superior-inferior-4x",
    name: "Superior e inferior",
    description:
      "Quatro treinos por semana, alternando o que está acima e o que está " +
      "abaixo do quadril. Cada metade do corpo é treinada duas vezes.",
    days: [
      {
        name: "Superior A",
        items: [
          item("supino-reto-barra", 4, 6, 10, 150),
          item("remada-curvada-barra", 4, 6, 10, 150),
          item("desenvolvimento-halteres", 3, 8, 12, 120),
          item("puxada-frontal", 3, 8, 12, 120),
          item("rosca-direta-barra", 3, 8, 12, 90),
          item("triceps-testa-barra", 3, 8, 12, 90),
        ],
      },
      {
        name: "Inferior A",
        items: [
          item("agachamento-livre", 4, 5, 8, 180),
          item("levantamento-terra-romeno", 3, 8, 12, 150),
          item("leg-press-45", 3, 10, 15, 120),
          item("mesa-flexora", 3, 10, 15, 90),
          item("panturrilha-em-pe-maquina", 4, 12, 20, 60),
          item("abdominal-no-cabo", 3, 12, 15, 60),
        ],
      },
      {
        name: "Superior B",
        items: [
          item("supino-inclinado-halteres", 4, 8, 12, 120),
          item("barra-fixa-pronada", 4, 6, 10, 150),
          item("desenvolvimento-militar-barra", 3, 6, 10, 120),
          item("remada-unilateral-halter", 3, 8, 12, 90),
          item("elevacao-lateral-halteres", 4, 12, 15, 60),
          item("rosca-martelo", 3, 10, 12, 90),
          item("triceps-corda-cabo", 3, 10, 15, 60),
        ],
      },
      {
        name: "Inferior B",
        items: [
          item("agachamento-frontal", 4, 6, 10, 150),
          item("stiff-barra", 3, 8, 12, 150),
          item("agachamento-bulgaro", 3, 8, 12, 120),
          item("cadeira-extensora", 3, 12, 15, 90),
          item("elevacao-pelvica-barra", 3, 8, 12, 120),
          item("panturrilha-sentado-maquina", 4, 15, 20, 60),
        ],
      },
    ],
  },
  {
    slug: "abc-3x",
    name: "ABC",
    description:
      "O clássico das academias daqui: empurrar em A, puxar em B, pernas em " +
      "C. Três treinos que giram, feitos três a seis vezes por semana.",
    days: [
      {
        name: "A · Peito, ombros e tríceps",
        items: [
          item("supino-reto-barra", 4, 6, 10, 150),
          item("supino-inclinado-halteres", 3, 8, 12, 120),
          item("crucifixo-reto-halteres", 3, 10, 12, 90),
          item("desenvolvimento-militar-barra", 3, 6, 10, 120),
          item("elevacao-lateral-halteres", 4, 12, 15, 60),
          item("triceps-testa-barra", 3, 8, 12, 90),
          item("triceps-corda-cabo", 3, 10, 15, 60),
        ],
      },
      {
        name: "B · Costas e bíceps",
        items: [
          item("barra-fixa-pronada", 4, 6, 10, 150),
          item("remada-curvada-barra", 4, 6, 10, 150),
          item("puxada-triangulo", 3, 10, 12, 90),
          item("remada-baixa-cabo", 3, 10, 12, 90),
          item("rosca-direta-barra-w", 3, 8, 12, 90),
          item("rosca-alternada-halteres", 3, 10, 12, 60),
          item("rosca-martelo", 3, 10, 12, 60),
        ],
      },
      {
        name: "C · Pernas e abdômen",
        items: [
          item("agachamento-livre", 4, 6, 10, 180),
          item("leg-press-45", 4, 10, 15, 120),
          item("levantamento-terra-romeno", 3, 8, 12, 150),
          item("cadeira-extensora", 3, 12, 15, 90),
          item("mesa-flexora", 3, 10, 15, 90),
          item("panturrilha-em-pe-maquina", 4, 12, 20, 60),
          item("abdominal-supra", 3, 15, 25, 45),
        ],
      },
    ],
  },
  {
    slug: "empurrar-puxar-pernas",
    name: "Empurrar, puxar e pernas",
    description:
      "Três treinos organizados pelo que o movimento faz, e não pelo músculo. " +
      "Roda duas vezes na semana para quem treina seis dias.",
    days: [
      {
        name: "Empurrar",
        items: [
          item("supino-reto-barra", 4, 6, 10, 150),
          item("desenvolvimento-halteres", 4, 8, 12, 120),
          item("supino-inclinado-halteres", 3, 8, 12, 120),
          item("elevacao-lateral-cabo", 4, 12, 15, 60),
          item("crossover-cabo", 3, 12, 15, 60),
          item("triceps-barra-cabo", 3, 10, 15, 60),
        ],
      },
      {
        name: "Puxar",
        items: [
          item("levantamento-terra", 3, 5, 8, 180),
          item("barra-fixa-pronada", 4, 6, 10, 150),
          item("remada-cavalinho", 3, 8, 12, 120),
          item("puxada-frontal", 3, 10, 12, 90),
          item("face-pull-cabo", 3, 12, 20, 60),
          item("rosca-direta-barra", 3, 8, 12, 90),
          item("rosca-scott", 3, 10, 12, 60),
        ],
      },
      {
        name: "Pernas",
        items: [
          item("agachamento-livre", 4, 5, 8, 180),
          item("levantamento-terra-romeno", 4, 8, 12, 150),
          item("leg-press-45", 3, 10, 15, 120),
          item("cadeira-flexora", 3, 10, 15, 90),
          item("agachamento-bulgaro", 3, 10, 12, 90),
          item("panturrilha-no-leg-press", 4, 12, 20, 60),
          item("elevacao-de-pernas-suspenso", 3, 10, 15, 60),
        ],
      },
    ],
  },
];

export const SPLIT_COUNT = SPLITS.length;

const BY_SLUG = new Map(SPLITS.map((split) => [split.slug, split]));

/**
 * One split by its slug, or nothing.
 *
 * `undefined` rather than a throw, for the reason `exerciseBySlug` gives: the
 * caller is reading a choice off a device, and a device can hold a slug this
 * build has dropped. That has to render as "choose again", not as a screen
 * that fails to load in a gym.
 */
export function splitBySlug(slug: string): Split | undefined {
  return BY_SLUG.get(slug);
}

/** Every muscle a split's full rotation touches, by primary muscle. */
export function musclesTrained(split: Split): Set<string> {
  const muscles = new Set<string>();

  for (const day of split.days) {
    for (const entry of day.items) {
      const exercise = exerciseBySlug(entry.exercise);
      if (exercise) muscles.add(exercise.primaryMuscle);
    }
  }

  return muscles;
}

/**
 * Where these splits come from, in the shape `dataset_versions` records.
 *
 * A second dataset rather than an extension of `dietkit-exercises`: two files
 * produce two sets of rows, and a provenance row exists to answer "which file
 * produced this one". Pinning both to a single hash would mean editing a rep
 * range invalidated the catalog's row and vice versa.
 */
export const SPLIT_CATALOG = {
  dataset: "dietkit-splits",
  edition: "1ª edição",
  authoredOn: "2026-08-21",
  url: "https://github.com/jacksonsieben/dietkit/blob/main/src/lib/training/splits.ts",
} as const;

export const SPLIT_CATALOG_CITATION =
  "DIETKIT. Divisões de treino do DietKit. " +
  `${SPLIT_CATALOG.edition}. Campinas: DietKit, 2026. ` +
  "Elaborado pelo próprio projeto; não deriva de publicação de terceiros. " +
  `Disponível em: ${SPLIT_CATALOG.url}`;
