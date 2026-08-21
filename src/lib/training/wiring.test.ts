import { describe, expect, it } from "vitest";

import ptBR from "../../../messages/pt-BR.json";
import { EQUIPMENT, EXERCISES, MUSCLE_GROUPS } from "./catalog";

/**
 * The catalog's two vocabularies, in the one language this app ships (D5).
 *
 * The slugs are stable identifiers and deliberately unaccented — they are a
 * primary key's worth of ASCII, and they travel into a URL and a database
 * column. `posterior-de-coxa` is not a thing to put in front of a reader, so
 * every slug owes the catalogue a label, and a movement added to a new muscle
 * group must not be able to reach a screen with its slug showing.
 *
 * The exercise *names* are not in the catalogue and are not going to be: they
 * are the data, already written in pt-BR, and a hundred and seventeen of them
 * copied into a message file is a hundred and seventeen chances for the two to
 * disagree about what a movement is called.
 */
describe("the training vocabulary", () => {
  it("names every muscle group in Portuguese", () => {
    for (const group of MUSCLE_GROUPS) {
      expect(ptBR.Training.muscles[group], `no label for ${group}`).toBeTruthy();
    }
  });

  it("names every equipment in Portuguese", () => {
    for (const item of EQUIPMENT) {
      expect(ptBR.Training.equipment[item], `no label for ${item}`).toBeTruthy();
    }
  });

  it("carries no label for a slug the catalog does not use", () => {
    // The other direction: a group renamed in catalog.ts leaves its old label
    // behind, and a leftover label is what makes the check above pass while a
    // screen renders nothing.
    expect(Object.keys(ptBR.Training.muscles).sort()).toEqual(
      [...MUSCLE_GROUPS].sort(),
    );
    expect(Object.keys(ptBR.Training.equipment).sort()).toEqual(
      [...EQUIPMENT].sort(),
    );
  });

  it("writes the exercise names as Portuguese, accents and all", () => {
    // The slugs are folded ASCII; the names are not, and the day someone
    // "fixes" a name to match its slug the catalog starts reading like a
    // database dump.
    const accented = EXERCISES.filter((exercise) =>
      /[áâãàéêíóôõúüç]/i.test(exercise.name),
    );

    expect(accented.length).toBeGreaterThan(20);
  });
});
