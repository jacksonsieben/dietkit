import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DATA_FILE, type TacoDataset } from "../../../scripts/taco/dataset.ts";
import {
  DIET_PRESETS,
  DIET_PRESET_CATALOG,
  DIET_PRESET_CATALOG_CITATION,
  DIET_PRESET_COUNT,
  PRESET_FOODS,
  type DietPresetSource,
  type PresetItem,
} from "./presets";

/**
 * The authored presets, checked as a source file (#113).
 *
 * The same job `scripts/training/seed.test.ts` does for the splits, and for the
 * same reason: this file is written by hand and reviewed as a diff, so the
 * mistakes it can carry are the ones a reader skims past — a share that makes
 * the day add to 103%, an option set whose default was deleted with the option,
 * a slot naming a group that was renamed, a TACO id off by one that still
 * resolves to a real food.
 *
 * The database catches the last of those only if the id is *invalid*; id 227 in
 * place of 226 is a foreign key that passes and a papaya that turned into
 * something else. That is why every food carries TACO's description here and
 * why this reads data/taco-4ed.json to check it.
 */

const dataset = JSON.parse(readFileSync(DATA_FILE, "utf8")) as TacoDataset;

/** Every item in a preset: the meals' own rows and every option's. */
function allItems(preset: DietPresetSource): PresetItem[] {
  return preset.meals.flatMap((meal) => [
    ...meal.items,
    ...meal.optionSets.flatMap((set) =>
      set.options.flatMap((option) => option.items),
    ),
  ]);
}

describe("the preset foods", () => {
  it("names a food TACO publishes, with TACO's own description", () => {
    for (const food of PRESET_FOODS) {
      const published = dataset.foods.find(
        (candidate) => candidate.id === food.id,
      );

      expect(published, `TACO has no food ${food.id}`).toBeDefined();
      expect(published!.description).toBe(food.taco);
    }
  });

  it("names each id once", () => {
    const ids = PRESET_FOODS.map((food) => food.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("the diet presets", () => {
  it("ships at least one", () => {
    expect(DIET_PRESET_COUNT).toBeGreaterThan(0);
    expect(DIET_PRESETS).toHaveLength(DIET_PRESET_COUNT);
  });

  it("gives each preset its own slug", () => {
    const slugs = DIET_PRESETS.map((preset) => preset.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it.each(DIET_PRESETS)("$slug divides the day into one", (preset) => {
    const total = preset.meals.reduce((sum, meal) => sum + meal.share, 0);

    // A cent of tolerance, no more: the shares are authored decimals, and a
    // preset whose meals add to 0.97 is a preset that copies into a diet
    // quietly missing 3% of the day (#18).
    expect(total).toBeCloseTo(1, 2);
    for (const meal of preset.meals) expect(meal.share).toBeGreaterThan(0);
  });

  it.each(DIET_PRESETS)("$slug has meals worth solving", (preset) => {
    expect(preset.meals.length).toBeGreaterThan(0);

    for (const meal of preset.meals) {
      expect(meal.name).not.toBe("");
      // Fixed rows or a choice — a meal with neither is a heading.
      expect(meal.items.length + meal.optionSets.length).toBeGreaterThan(0);
    }
  });

  it.each(DIET_PRESETS)("$slug offers a real choice in every set", (preset) => {
    for (const meal of preset.meals) {
      for (const set of meal.optionSets) {
        // One option is not a decision; it is a fixed row with extra tables.
        expect(set.options.length).toBeGreaterThanOrEqual(2);

        const defaults = set.options.filter(
          (option) => option.isDefault === true,
        );

        // Exactly one, because the database enforces "at most one" and cannot
        // express "at least one" (src/lib/db/schema/presets.ts): a set with no
        // default copies into a diet with a hole where a meal was.
        expect(
          defaults,
          `${preset.slug} / ${meal.name} / ${set.name}`,
        ).toHaveLength(1);

        for (const option of set.options) {
          expect(option.items.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it.each(DIET_PRESETS)("$slug gives the solver room to work", (preset) => {
    for (const item of allItems(preset)) {
      expect(item.minG).toBeGreaterThanOrEqual(0);
      expect(item.maxG).toBeGreaterThanOrEqual(item.minG);
      expect(item.quantityG).toBeGreaterThanOrEqual(item.minG);
      expect(item.quantityG).toBeLessThanOrEqual(item.maxG);

      // Mandatory *is* `minG === maxG` — the same statement the solver reads
      // (src/lib/diet/solve.ts). A row flagged mandatory with room to move
      // would be scaled by the solver and described as pinned by the screen.
      expect(item.mandatory).toBe(item.minG === item.maxG);
    }
  });

  it.each(DIET_PRESETS)("$slug resolves every slot it opens", (preset) => {
    const groups = new Set(preset.groups.map((group) => group.slug));

    expect(groups.size).toBe(preset.groups.length);

    for (const item of allItems(preset)) {
      if (item.group === undefined) continue;

      expect(groups, `grupo "${item.group}"`).toContain(item.group);

      // The starting food has to be one of the alternatives, or the swap
      // control opens on a food it does not list.
      const group = preset.groups.find(
        (candidate) => candidate.slug === item.group,
      )!;
      expect(group.foods.map((food) => food.id)).toContain(item.food.id);
    }
  });

  it.each(DIET_PRESETS)(
    "$slug has something to swap in every group",
    (preset) => {
      for (const group of preset.groups) {
        // A group of one is a fixed food that made the user open a dialog.
        expect(group.foods.length, group.slug).toBeGreaterThanOrEqual(2);

        const ids = group.foods.map((food) => food.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    },
  );

  it.each(DIET_PRESETS)(
    "$slug presents itself as a starting point",
    (preset) => {
      expect(preset.name).not.toBe("");
      expect(preset.description).not.toBe("");

      // The health notice (#10) is the standing promise this description has to
      // keep: the app does not prescribe. So it says outright that it is a
      // starting point, and every time the word "prescrição" appears it is
      // being denied — a preset that offered one would be that promise broken
      // in the one screen where it matters.
      expect(preset.description).toMatch(/ponto de partida/iu);

      for (const match of preset.description.matchAll(/prescri\w*/giu)) {
        const before = preset.description.slice(
          Math.max(0, match.index - 40),
          match.index,
        );
        expect(before, `"${match[0]}" sem negação antes`).toMatch(/\bnão\b/iu);
      }
    },
  );
});

describe("the preset provenance", () => {
  it("is its own dataset, not TACO's", () => {
    expect(DIET_PRESET_CATALOG.dataset).toBe("dietkit-diet-presets");
    expect(DIET_PRESET_CATALOG.url).toContain("src/lib/diet/presets.ts");
  });

  it("names DietKit as the author and TACO as the composition", () => {
    expect(DIET_PRESET_CATALOG_CITATION).toContain("DIETKIT");
    expect(DIET_PRESET_CATALOG_CITATION).toContain("TACO");
    // Settled in #113 and written down in docs/DECISIONS.md § D28: what ships
    // is the project's own skeleton, and the citation has to say outright that
    // it is not somebody's prescription being republished.
    expect(DIET_PRESET_CATALOG_CITATION).toMatch(/não reproduz prescrição/i);
  });
});
