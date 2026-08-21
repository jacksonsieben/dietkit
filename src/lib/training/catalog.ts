/**
 * Every movement the app knows the name of (#72).
 *
 * There is no TACO for exercises. The food table came with an edition, a
 * publisher and a permission notice we could quote verbatim; nothing equivalent
 * exists for a list of Brazilian gym movements, and the lists that do circulate
 * are scraped out of apps whose terms forbid exactly that. So this one is
 * written rather than sourced. That is a smaller claim and an honest one, and
 * the seed records it as ours — dataset `dietkit-exercises`, pinned to this
 * file's SHA-256 — so `dataset_versions` answers "where did this row come from"
 * in SQL for an exercise the same way it does for a food.
 *
 * It ships in the client bundle, and that is the whole reason it is a module
 * rather than only rows in Neon. This catalog is read in a gym, which is
 * frequently a basement with concrete walls, and a screen that has to reach the
 * network to name the next exercise is a screen that fails precisely where it
 * is used. A hundred and seventeen names at two short strings each is a few
 * kilobytes — less than a single food's worth of nutrients — and it buys the
 * offline guarantee outright.
 *
 * Neon is seeded from this same array all the same, because
 * `training_preset_items` points at `exercises.slug` with a foreign key. That
 * key is what makes a preset referring to a movement we renamed fail at seed
 * time rather than render a blank line in front of somebody mid-workout.
 *
 * Nothing personal is in here and nothing personal can be. This file names
 * movements; what anybody actually lifted doing one of them lives in IndexedDB
 * and never leaves the device (docs/DECISIONS.md § D1).
 */

/**
 * The muscle groups, in the order a catalog is read in.
 *
 * Slugs rather than labels, because the pt-BR names belong in `messages/`
 * (§ D5) — and because these same twelve strings are a Postgres enum in
 * `src/lib/db/schema/exercises.ts`. Declared here a second time on purpose:
 * this module is bundled into the client and may not import drizzle
 * (eslint.config.mjs), so the two copies are held together by
 * `src/lib/db/exercises.test.ts`, which fails if they ever disagree.
 *
 * The order is the catalog's own: it runs upper body down to lower, and puts
 * the movements that are their own workout last.
 */
export const MUSCLE_GROUPS = [
  "peito",
  "costas",
  "ombros",
  "biceps",
  "triceps",
  "antebraco",
  "abdomen",
  "gluteos",
  "quadriceps",
  "posterior-de-coxa",
  "panturrilhas",
  "corpo-inteiro",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

/** What you have to be holding. Same arrangement, same enum, same test. */
export const EQUIPMENT = [
  "barra",
  "halteres",
  "maquina",
  "cabo",
  "peso-corporal",
  "kettlebell",
  "elastico",
  "outro",
] as const;

export type Equipment = (typeof EQUIPMENT)[number];

export interface CatalogExercise {
  /** Stable identity. Renaming one is a migration, not an edit. */
  readonly slug: string;
  /** As it is called out loud in a Brazilian gym. */
  readonly name: string;
  /**
   * The one it is chosen for, not every one it uses. A deadlift works most of
   * the body; it is in a program because of the back. One primary muscle is
   * what makes "what am I training today" answerable in a single word, and a
   * catalog that hedges with a list of secondaries answers it with a paragraph.
   */
  readonly primaryMuscle: MuscleGroup;
  readonly equipment: Equipment;
}

/**
 * The catalog, grouped by primary muscle and compound-first within each group.
 *
 * Order is data here, not presentation: the first entry under a group is the
 * movement that group's workout is usually built around, and the last is the
 * one added if there is time. `catalogRows` turns that reading order into the
 * `position` column, so the screen, the seed and this file cannot disagree
 * about which exercise comes first.
 */
export const EXERCISES: readonly CatalogExercise[] = [
  // peito
  { slug: "supino-reto-barra", name: "Supino reto com barra", primaryMuscle: "peito", equipment: "barra" },
  { slug: "supino-inclinado-barra", name: "Supino inclinado com barra", primaryMuscle: "peito", equipment: "barra" },
  { slug: "supino-declinado-barra", name: "Supino declinado com barra", primaryMuscle: "peito", equipment: "barra" },
  { slug: "supino-reto-halteres", name: "Supino reto com halteres", primaryMuscle: "peito", equipment: "halteres" },
  { slug: "supino-inclinado-halteres", name: "Supino inclinado com halteres", primaryMuscle: "peito", equipment: "halteres" },
  { slug: "supino-maquina", name: "Supino na máquina", primaryMuscle: "peito", equipment: "maquina" },
  { slug: "mergulho-paralelas", name: "Mergulho nas paralelas", primaryMuscle: "peito", equipment: "peso-corporal" },
  { slug: "flexao-de-braco", name: "Flexão de braço", primaryMuscle: "peito", equipment: "peso-corporal" },
  { slug: "crucifixo-reto-halteres", name: "Crucifixo reto com halteres", primaryMuscle: "peito", equipment: "halteres" },
  { slug: "crucifixo-inclinado-halteres", name: "Crucifixo inclinado com halteres", primaryMuscle: "peito", equipment: "halteres" },
  { slug: "voador-maquina", name: "Voador na máquina", primaryMuscle: "peito", equipment: "maquina" },
  { slug: "crossover-cabo", name: "Crossover no cabo", primaryMuscle: "peito", equipment: "cabo" },
  { slug: "pullover-halter", name: "Pullover com halter", primaryMuscle: "peito", equipment: "halteres" },

  // costas
  { slug: "levantamento-terra", name: "Levantamento terra", primaryMuscle: "costas", equipment: "barra" },
  { slug: "barra-fixa-pronada", name: "Barra fixa pronada", primaryMuscle: "costas", equipment: "peso-corporal" },
  { slug: "barra-fixa-supinada", name: "Barra fixa supinada", primaryMuscle: "costas", equipment: "peso-corporal" },
  { slug: "puxada-frontal", name: "Puxada frontal", primaryMuscle: "costas", equipment: "cabo" },
  { slug: "puxada-triangulo", name: "Puxada com triângulo", primaryMuscle: "costas", equipment: "cabo" },
  { slug: "remada-curvada-barra", name: "Remada curvada com barra", primaryMuscle: "costas", equipment: "barra" },
  { slug: "remada-cavalinho", name: "Remada cavalinho", primaryMuscle: "costas", equipment: "barra" },
  { slug: "remada-curvada-halteres", name: "Remada curvada com halteres", primaryMuscle: "costas", equipment: "halteres" },
  { slug: "remada-unilateral-halter", name: "Remada unilateral com halter", primaryMuscle: "costas", equipment: "halteres" },
  { slug: "remada-baixa-cabo", name: "Remada baixa no cabo", primaryMuscle: "costas", equipment: "cabo" },
  { slug: "remada-maquina", name: "Remada na máquina", primaryMuscle: "costas", equipment: "maquina" },
  { slug: "pulldown-bracos-estendidos", name: "Pulldown com braços estendidos", primaryMuscle: "costas", equipment: "cabo" },
  { slug: "encolhimento-barra", name: "Encolhimento com barra", primaryMuscle: "costas", equipment: "barra" },
  { slug: "encolhimento-halteres", name: "Encolhimento com halteres", primaryMuscle: "costas", equipment: "halteres" },
  { slug: "hiperextensao-lombar", name: "Hiperextensão lombar", primaryMuscle: "costas", equipment: "peso-corporal" },

  // ombros
  { slug: "desenvolvimento-militar-barra", name: "Desenvolvimento militar com barra", primaryMuscle: "ombros", equipment: "barra" },
  { slug: "desenvolvimento-halteres", name: "Desenvolvimento com halteres", primaryMuscle: "ombros", equipment: "halteres" },
  { slug: "desenvolvimento-arnold", name: "Desenvolvimento Arnold", primaryMuscle: "ombros", equipment: "halteres" },
  { slug: "desenvolvimento-maquina", name: "Desenvolvimento na máquina", primaryMuscle: "ombros", equipment: "maquina" },
  { slug: "remada-alta-barra", name: "Remada alta com barra", primaryMuscle: "ombros", equipment: "barra" },
  { slug: "elevacao-lateral-halteres", name: "Elevação lateral com halteres", primaryMuscle: "ombros", equipment: "halteres" },
  { slug: "elevacao-lateral-cabo", name: "Elevação lateral no cabo", primaryMuscle: "ombros", equipment: "cabo" },
  { slug: "elevacao-lateral-maquina", name: "Elevação lateral na máquina", primaryMuscle: "ombros", equipment: "maquina" },
  { slug: "elevacao-frontal-halteres", name: "Elevação frontal com halteres", primaryMuscle: "ombros", equipment: "halteres" },
  { slug: "elevacao-frontal-barra", name: "Elevação frontal com barra", primaryMuscle: "ombros", equipment: "barra" },
  { slug: "crucifixo-inverso-halteres", name: "Crucifixo inverso com halteres", primaryMuscle: "ombros", equipment: "halteres" },
  { slug: "crucifixo-inverso-maquina", name: "Crucifixo inverso na máquina", primaryMuscle: "ombros", equipment: "maquina" },
  { slug: "face-pull-cabo", name: "Face pull no cabo", primaryMuscle: "ombros", equipment: "cabo" },

  // biceps
  { slug: "rosca-direta-barra", name: "Rosca direta com barra", primaryMuscle: "biceps", equipment: "barra" },
  { slug: "rosca-direta-barra-w", name: "Rosca direta com barra W", primaryMuscle: "biceps", equipment: "barra" },
  { slug: "rosca-alternada-halteres", name: "Rosca alternada com halteres", primaryMuscle: "biceps", equipment: "halteres" },
  { slug: "rosca-martelo", name: "Rosca martelo", primaryMuscle: "biceps", equipment: "halteres" },
  { slug: "rosca-inclinada-halteres", name: "Rosca inclinada com halteres", primaryMuscle: "biceps", equipment: "halteres" },
  { slug: "rosca-scott", name: "Rosca Scott", primaryMuscle: "biceps", equipment: "barra" },
  { slug: "rosca-concentrada", name: "Rosca concentrada", primaryMuscle: "biceps", equipment: "halteres" },
  { slug: "rosca-cabo", name: "Rosca no cabo", primaryMuscle: "biceps", equipment: "cabo" },
  { slug: "rosca-21", name: "Rosca 21", primaryMuscle: "biceps", equipment: "barra" },

  // triceps
  { slug: "supino-fechado", name: "Supino fechado", primaryMuscle: "triceps", equipment: "barra" },
  { slug: "mergulho-banco", name: "Mergulho no banco", primaryMuscle: "triceps", equipment: "peso-corporal" },
  { slug: "triceps-testa-barra", name: "Tríceps testa com barra", primaryMuscle: "triceps", equipment: "barra" },
  { slug: "triceps-frances-halter", name: "Tríceps francês com halter", primaryMuscle: "triceps", equipment: "halteres" },
  { slug: "triceps-corda-cabo", name: "Tríceps corda no cabo", primaryMuscle: "triceps", equipment: "cabo" },
  { slug: "triceps-barra-cabo", name: "Tríceps barra no cabo", primaryMuscle: "triceps", equipment: "cabo" },
  { slug: "triceps-coice-halter", name: "Tríceps coice com halter", primaryMuscle: "triceps", equipment: "halteres" },
  { slug: "triceps-maquina", name: "Tríceps na máquina", primaryMuscle: "triceps", equipment: "maquina" },

  // antebraco
  { slug: "rosca-inversa-barra", name: "Rosca inversa com barra", primaryMuscle: "antebraco", equipment: "barra" },
  { slug: "rosca-punho-barra", name: "Rosca de punho com barra", primaryMuscle: "antebraco", equipment: "barra" },
  { slug: "rosca-punho-inversa-barra", name: "Rosca de punho inversa com barra", primaryMuscle: "antebraco", equipment: "barra" },
  { slug: "caminhada-do-fazendeiro", name: "Caminhada do fazendeiro", primaryMuscle: "antebraco", equipment: "halteres" },
  { slug: "pinca-com-anilha", name: "Pinça com anilha", primaryMuscle: "antebraco", equipment: "outro" },

  // abdomen
  { slug: "abdominal-supra", name: "Abdominal supra", primaryMuscle: "abdomen", equipment: "peso-corporal" },
  { slug: "abdominal-infra", name: "Abdominal infra", primaryMuscle: "abdomen", equipment: "peso-corporal" },
  { slug: "elevacao-de-pernas-suspenso", name: "Elevação de pernas suspenso", primaryMuscle: "abdomen", equipment: "peso-corporal" },
  { slug: "abdominal-canivete", name: "Abdominal canivete", primaryMuscle: "abdomen", equipment: "peso-corporal" },
  { slug: "abdominal-obliquo", name: "Abdominal oblíquo", primaryMuscle: "abdomen", equipment: "peso-corporal" },
  { slug: "torcao-russa", name: "Torção russa", primaryMuscle: "abdomen", equipment: "outro" },
  { slug: "prancha-frontal", name: "Prancha frontal", primaryMuscle: "abdomen", equipment: "peso-corporal" },
  { slug: "prancha-lateral", name: "Prancha lateral", primaryMuscle: "abdomen", equipment: "peso-corporal" },
  { slug: "abdominal-no-cabo", name: "Abdominal no cabo", primaryMuscle: "abdomen", equipment: "cabo" },
  { slug: "abdominal-maquina", name: "Abdominal na máquina", primaryMuscle: "abdomen", equipment: "maquina" },
  { slug: "roda-abdominal", name: "Roda abdominal", primaryMuscle: "abdomen", equipment: "outro" },

  // gluteos
  { slug: "elevacao-pelvica-barra", name: "Elevação pélvica com barra", primaryMuscle: "gluteos", equipment: "barra" },
  { slug: "levantamento-terra-sumo", name: "Levantamento terra sumô", primaryMuscle: "gluteos", equipment: "barra" },
  { slug: "agachamento-sumo", name: "Agachamento sumô", primaryMuscle: "gluteos", equipment: "barra" },
  { slug: "afundo-halteres", name: "Afundo com halteres", primaryMuscle: "gluteos", equipment: "halteres" },
  { slug: "avanco-halteres", name: "Avanço com halteres", primaryMuscle: "gluteos", equipment: "halteres" },
  { slug: "subida-no-banco", name: "Subida no banco com halteres", primaryMuscle: "gluteos", equipment: "halteres" },
  { slug: "ponte-de-gluteo", name: "Ponte de glúteo", primaryMuscle: "gluteos", equipment: "peso-corporal" },
  { slug: "coice-no-cabo", name: "Coice no cabo", primaryMuscle: "gluteos", equipment: "cabo" },
  { slug: "abducao-de-quadril-maquina", name: "Abdução de quadril na máquina", primaryMuscle: "gluteos", equipment: "maquina" },
  { slug: "abducao-de-quadril-elastico", name: "Abdução de quadril com elástico", primaryMuscle: "gluteos", equipment: "elastico" },

  // quadriceps
  { slug: "agachamento-livre", name: "Agachamento livre", primaryMuscle: "quadriceps", equipment: "barra" },
  { slug: "agachamento-frontal", name: "Agachamento frontal", primaryMuscle: "quadriceps", equipment: "barra" },
  { slug: "agachamento-smith", name: "Agachamento no Smith", primaryMuscle: "quadriceps", equipment: "maquina" },
  { slug: "agachamento-hack", name: "Agachamento hack", primaryMuscle: "quadriceps", equipment: "maquina" },
  { slug: "leg-press-45", name: "Leg press 45°", primaryMuscle: "quadriceps", equipment: "maquina" },
  { slug: "agachamento-bulgaro", name: "Agachamento búlgaro", primaryMuscle: "quadriceps", equipment: "halteres" },
  { slug: "agachamento-goblet", name: "Agachamento goblet", primaryMuscle: "quadriceps", equipment: "kettlebell" },
  { slug: "passada-halteres", name: "Passada com halteres", primaryMuscle: "quadriceps", equipment: "halteres" },
  { slug: "agachamento-livre-sem-peso", name: "Agachamento livre sem peso", primaryMuscle: "quadriceps", equipment: "peso-corporal" },
  { slug: "cadeira-extensora", name: "Cadeira extensora", primaryMuscle: "quadriceps", equipment: "maquina" },

  // posterior-de-coxa
  { slug: "levantamento-terra-romeno", name: "Levantamento terra romeno", primaryMuscle: "posterior-de-coxa", equipment: "barra" },
  { slug: "stiff-barra", name: "Stiff com barra", primaryMuscle: "posterior-de-coxa", equipment: "barra" },
  { slug: "stiff-halteres", name: "Stiff com halteres", primaryMuscle: "posterior-de-coxa", equipment: "halteres" },
  { slug: "bom-dia-barra", name: "Bom dia com barra", primaryMuscle: "posterior-de-coxa", equipment: "barra" },
  { slug: "balanco-kettlebell", name: "Balanço com kettlebell", primaryMuscle: "posterior-de-coxa", equipment: "kettlebell" },
  { slug: "mesa-flexora", name: "Mesa flexora", primaryMuscle: "posterior-de-coxa", equipment: "maquina" },
  { slug: "cadeira-flexora", name: "Cadeira flexora", primaryMuscle: "posterior-de-coxa", equipment: "maquina" },
  { slug: "flexora-em-pe", name: "Flexora em pé", primaryMuscle: "posterior-de-coxa", equipment: "maquina" },
  { slug: "flexao-nordica", name: "Flexão nórdica", primaryMuscle: "posterior-de-coxa", equipment: "peso-corporal" },

  // panturrilhas
  { slug: "panturrilha-em-pe-maquina", name: "Panturrilha em pé na máquina", primaryMuscle: "panturrilhas", equipment: "maquina" },
  { slug: "panturrilha-sentado-maquina", name: "Panturrilha sentado na máquina", primaryMuscle: "panturrilhas", equipment: "maquina" },
  { slug: "panturrilha-no-leg-press", name: "Panturrilha no leg press", primaryMuscle: "panturrilhas", equipment: "maquina" },
  { slug: "panturrilha-em-pe-halteres", name: "Panturrilha em pé com halteres", primaryMuscle: "panturrilhas", equipment: "halteres" },
  { slug: "panturrilha-no-degrau", name: "Panturrilha no degrau", primaryMuscle: "panturrilhas", equipment: "peso-corporal" },

  // corpo-inteiro
  { slug: "arranco-barra", name: "Arranco com barra", primaryMuscle: "corpo-inteiro", equipment: "barra" },
  { slug: "clean-de-potencia", name: "Clean de potência", primaryMuscle: "corpo-inteiro", equipment: "barra" },
  { slug: "arremesso-barra", name: "Arremesso com barra", primaryMuscle: "corpo-inteiro", equipment: "barra" },
  { slug: "thruster-halteres", name: "Thruster com halteres", primaryMuscle: "corpo-inteiro", equipment: "halteres" },
  { slug: "levantamento-turco", name: "Levantamento turco", primaryMuscle: "corpo-inteiro", equipment: "kettlebell" },
  { slug: "burpee", name: "Burpee", primaryMuscle: "corpo-inteiro", equipment: "peso-corporal" },
  { slug: "escalador", name: "Escalador", primaryMuscle: "corpo-inteiro", equipment: "peso-corporal" },
  { slug: "polichinelo", name: "Polichinelo", primaryMuscle: "corpo-inteiro", equipment: "peso-corporal" },
  { slug: "corda-naval", name: "Corda naval", primaryMuscle: "corpo-inteiro", equipment: "outro" },
];

/** How many movements the catalog knows, for a count on screen and in the seed. */
export const EXERCISE_COUNT = EXERCISES.length;

/**
 * The catalog as the reference database stores it — the same rows, plus the
 * `position` that its reading order implies.
 *
 * Derived rather than authored so that inserting a movement in the middle of a
 * group is one line, not a renumbering of everything under it. A hand-kept
 * `position: 7` is a column that drifts the first time somebody is in a hurry.
 */
export interface CatalogRow extends CatalogExercise {
  /** Rank within the primary muscle, from zero. */
  readonly position: number;
}

export function catalogRows(): CatalogRow[] {
  const seen = new Map<MuscleGroup, number>();

  return EXERCISES.map((exercise) => {
    const position = seen.get(exercise.primaryMuscle) ?? 0;
    seen.set(exercise.primaryMuscle, position + 1);

    return { ...exercise, position };
  });
}

/**
 * The catalog split by primary muscle, in `MUSCLE_GROUPS` order.
 *
 * Every group is present even if it were to hold nothing, so a caller rendering
 * the list never has to decide what an absent group means.
 */
export function exercisesByMuscle(): Map<MuscleGroup, CatalogExercise[]> {
  const grouped = new Map<MuscleGroup, CatalogExercise[]>(
    MUSCLE_GROUPS.map((group) => [group, []]),
  );

  for (const exercise of EXERCISES) {
    grouped.get(exercise.primaryMuscle)?.push(exercise);
  }

  return grouped;
}

const BY_SLUG = new Map(EXERCISES.map((exercise) => [exercise.slug, exercise]));

/**
 * One movement by its slug, or nothing.
 *
 * Returns `undefined` rather than throwing because the callers that will use
 * this are reading a schedule off a device, and a schedule can outlive a slug —
 * a stored workout naming an exercise this build no longer has should render as
 * one missing line, not as a screen that fails to load in a gym.
 */
export function exerciseBySlug(slug: string): CatalogExercise | undefined {
  return BY_SLUG.get(slug);
}

/**
 * Where these rows come from, in the shape `dataset_versions` records.
 *
 * The food table gets NEPA's citation because NEPA published it. This one gets
 * ours, and says outright that it derives from nobody: a provenance row that
 * left the field blank would read as an oversight, and a provenance row
 * borrowing somebody else's name would be worse than blank. The seed pins the
 * SHA-256 of this file, so "which version of the catalog is in this database"
 * is a question the database itself can answer.
 */
export const EXERCISE_CATALOG = {
  dataset: "dietkit-exercises",
  edition: "1ª edição",
  /** The day the list was finished. A catalog has no publication date but this. */
  authoredOn: "2026-08-21",
  url: "https://github.com/jacksonsieben/dietkit/blob/main/src/lib/training/catalog.ts",
} as const;

export const EXERCISE_CATALOG_CITATION =
  "DIETKIT. Catálogo de exercícios do DietKit. " +
  `${EXERCISE_CATALOG.edition}. Campinas: DietKit, 2026. ` +
  "Elaborado pelo próprio projeto; não deriva de publicação de terceiros. " +
  `Disponível em: ${EXERCISE_CATALOG.url}`;
