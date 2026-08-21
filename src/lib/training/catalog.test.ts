import { describe, expect, it } from "vitest";

import {
  catalogRows,
  EQUIPMENT,
  EXERCISE_CATALOG_CITATION,
  EXERCISE_COUNT,
  EXERCISES,
  exerciseBySlug,
  exercisesByMuscle,
  MUSCLE_GROUPS,
  type MuscleGroup,
} from "./catalog";

/**
 * The catalog is hand-written data, and hand-written data is where the typos
 * are (#72).
 *
 * None of this checks that a movement is a good idea — that is a judgement, and
 * it is in the file. What it checks is the class of mistake a hundred and
 * seventeen near-identical lines invite: the same slug twice, a slug that names
 * a different exercise from the one beside it, a group that ended up empty
 * because a line was pasted under the wrong comment.
 */
describe("the exercise catalog", () => {
  it("gives every movement its own slug", () => {
    const slugs = EXERCISES.map((exercise) => exercise.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every movement its own name", () => {
    // Two slugs with one name is either a duplicate or two things nobody can
    // tell apart on screen; both want fixing before they reach a workout.
    const names = EXERCISES.map((exercise) => exercise.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps slugs to the alphabet a URL and a primary key share", () => {
    // Lowercase, ASCII, hyphens. `flexão-nórdica` is a fine name and a terrible
    // identifier: it survives this file and then meets a router.
    for (const { slug } of EXERCISES) {
      expect(slug, `${slug} is not a plain kebab-case slug`).toMatch(
        /^[a-z0-9]+(-[a-z0-9]+)*$/,
      );
    }
  });

  it("keeps every slug describing its own name", () => {
    /**
     * The real check on a table this long. A slug's words have to appear in its
     * name, in order — which allows `supino-maquina` for "Supino na máquina"
     * and `rosca-punho-inversa-barra` for "Rosca de punho inversa com barra",
     * because dropping the connectives is how a slug is written, but rejects
     * the mistake this format actually produces: a line copied from the one
     * above it and only half rewritten, so the slug still names the previous
     * movement.
     */
    for (const { slug, name } of EXERCISES) {
      expect(
        isSubsequence(slug.split("-"), fold(name)),
        `${slug} does not describe "${name}"`,
      ).toBe(true);
    }
  });

  it("puts something under every muscle group", () => {
    // A group in the enum with nothing under it is a filter that opens an empty
    // screen, and three is the least that makes a group's workout: something to
    // start with and two ways to finish it.
    for (const [group, exercises] of exercisesByMuscle()) {
      expect(exercises.length, `${group} is thin`).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses every kind of equipment it names", () => {
    // The other direction: a value in the enum that nothing uses is a label in
    // `messages/` translating for nobody.
    const used = new Set(EXERCISES.map((exercise) => exercise.equipment));

    expect([...used].sort()).toEqual([...EQUIPMENT].sort());
  });

  it("numbers each group from zero without a gap", () => {
    // `position` is derived from reading order, so this is really a test that
    // `catalogRows` derives it per group rather than across the whole file —
    // the difference between "third chest movement" and "third of a hundred
    // and seventeen", which is what an ORDER BY would then mean.
    const counters = new Map<MuscleGroup, number>();

    for (const row of catalogRows()) {
      const expected = counters.get(row.primaryMuscle) ?? 0;

      expect(row.position, `${row.slug} is out of order`).toBe(expected);
      counters.set(row.primaryMuscle, expected + 1);
    }

    expect([...counters.keys()].sort()).toEqual([...MUSCLE_GROUPS].sort());
  });

  it("keeps the reading order inside each group", () => {
    // Grouping must not reorder: the first entry under a group is the movement
    // its workout is built around, and that is authored, not alphabetical.
    for (const [group, exercises] of exercisesByMuscle()) {
      const authored = EXERCISES.filter(
        (exercise) => exercise.primaryMuscle === group,
      );

      expect(exercises).toEqual(authored);
    }
  });

  it("finds a movement by slug and admits when it has none", () => {
    // `undefined` rather than a throw is load-bearing: a schedule stored on a
    // device can outlive a slug, and one missing line is a better failure in a
    // gym than a screen that will not open.
    for (const exercise of EXERCISES) {
      expect(exerciseBySlug(exercise.slug)).toBe(exercise);
    }

    expect(exerciseBySlug("supino-em-marte")).toBeUndefined();
  });

  it("counts what it holds", () => {
    expect(EXERCISE_COUNT).toBe(EXERCISES.length);
  });

  it("credits nobody else for the list", () => {
    // The citation exists to say we wrote this. If it ever starts naming a
    // publication, that is a licence question and not a copy edit.
    expect(EXERCISE_CATALOG_CITATION).toContain("DIETKIT");
    expect(EXERCISE_CATALOG_CITATION).toContain("não deriva de publicação");
  });
});

/** A name, lowercased and stripped of accents and punctuation, as words. */
function fold(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isSubsequence(needles: string[], haystack: string[]): boolean {
  let at = 0;

  for (const word of haystack) {
    if (word === needles[at]) at += 1;
  }

  return at === needles.length;
}
