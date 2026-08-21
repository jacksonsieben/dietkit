import { describe, expect, it } from "vitest";

import { exerciseBySlug } from "./catalog";
import {
  musclesTrained,
  SPLIT_CATALOG_CITATION,
  SPLIT_COUNT,
  SPLITS,
  splitBySlug,
} from "./splits";

/**
 * The splits are hand-written too, and they are hand-written *against another
 * hand-written file* (#74).
 *
 * That is the interesting failure here. A typo inside the catalog shows up as a
 * bad exercise; a typo inside a split shows up as a day with a hole in it,
 * because `exerciseBySlug` returns `undefined` and the screen renders one item
 * fewer than the file says it has. In Postgres the same mistake is caught by
 * `training_preset_items.exercise_slug`'s foreign key — these tests are that
 * foreign key's counterpart for the copy that ships in the bundle, and they run
 * without a database so they catch it before the seed does.
 *
 * The rest is what four programs of near-identical shape invite: the same
 * exercise twice in one session, a rep range written backwards, a rest of a
 * thousand seconds, a rotation that never trains legs.
 */
const everyItem = SPLITS.flatMap((split) =>
  split.days.flatMap((day) =>
    day.items.map((item) => ({ split, day, item })),
  ),
);

describe("the training splits", () => {
  it("points every item at an exercise the catalog has", () => {
    for (const { split, day, item } of everyItem) {
      expect(
        exerciseBySlug(item.exercise),
        `${split.slug} / ${day.name} names ${item.exercise}, which the catalog does not`,
      ).toBeDefined();
    }
  });

  it("gives every split its own slug and its own name", () => {
    const slugs = SPLITS.map((split) => split.slug);
    const names = SPLITS.map((split) => split.name);

    expect(new Set(slugs).size).toBe(SPLIT_COUNT);
    expect(new Set(names).size).toBe(SPLIT_COUNT);
  });

  it("names every day of a split differently", () => {
    // The day is chosen by name on screen, and `training_preset_days` has no
    // slug: two days called "Treino A" are two rows nobody can tell apart.
    for (const split of SPLITS) {
      const names = split.days.map((day) => day.name);

      expect(new Set(names).size, `${split.slug} repeats a day name`).toBe(
        names.length,
      );
    }
  });

  it("never puts the same exercise in one session twice", () => {
    for (const split of SPLITS) {
      for (const day of split.days) {
        const slugs = day.items.map((item) => item.exercise);

        expect(
          new Set(slugs).size,
          `${split.slug} / ${day.name} repeats an exercise`,
        ).toBe(slugs.length);
      }
    }
  });

  it("gives every split enough days and every day enough work", () => {
    // A one-day split is a workout, not a split, and a three-item day is a
    // warm-up. The floors are low on purpose: this is a typo check, not an
    // opinion about programming.
    for (const split of SPLITS) {
      expect(split.days.length, `${split.slug} has too few days`).toBeGreaterThan(1);

      for (const day of split.days) {
        expect(
          day.items.length,
          `${split.slug} / ${day.name} has too few exercises`,
        ).toBeGreaterThan(2);
      }
    }
  });

  it("prescribes a range that reads forwards", () => {
    for (const { split, day, item } of everyItem) {
      const [min, max] = item.reps;
      const where = `${split.slug} / ${day.name} / ${item.exercise}`;

      expect(min, `${where} starts below one rep`).toBeGreaterThan(0);
      expect(max, `${where} has a range written backwards`).toBeGreaterThanOrEqual(min);
      expect(max, `${where} prescribes more reps than anyone counts`).toBeLessThanOrEqual(30);
    }
  });

  it("prescribes sets and rests a gym clock recognises", () => {
    for (const { split, day, item } of everyItem) {
      const where = `${split.slug} / ${day.name} / ${item.exercise}`;

      expect(item.sets, `${where} has an impossible set count`).toBeGreaterThan(0);
      expect(item.sets, `${where} has an impossible set count`).toBeLessThanOrEqual(6);
      expect(item.restSeconds, `${where} rests too little`).toBeGreaterThanOrEqual(30);
      expect(item.restSeconds, `${where} rests longer than the session`).toBeLessThanOrEqual(300);
    }
  });

  it("trains the five groups nobody may skip, in every split", () => {
    // Per rotation, not per day: the whole point of the ABC is that Wednesday
    // does not train chest. What no split gets to do is leave a group out of
    // the entire week — which is the mistake that looks fine in every single
    // session and is only visible from here.
    for (const split of SPLITS) {
      const muscles = musclesTrained(split);

      for (const muscle of ["peito", "costas", "ombros", "quadriceps", "posterior-de-coxa"]) {
        expect(
          muscles.has(muscle),
          `${split.slug} never trains ${muscle}`,
        ).toBe(true);
      }
    }
  });

  it("finds a split by slug, and finds nothing for one it dropped", () => {
    expect(splitBySlug("abc-3x")?.name).toBe("ABC");
    expect(splitBySlug("ficha-do-professor")).toBeUndefined();
  });

  it("says outright that the splits are ours", () => {
    // The catalog's citation exists because TACO's licence forces the question
    // (#4); this one exists because the answer should not depend on which
    // dataset a reader happens to look up.
    expect(SPLIT_CATALOG_CITATION).toContain("DIETKIT");
    expect(SPLIT_CATALOG_CITATION).toContain("não deriva de publicação de terceiros");
  });
});
