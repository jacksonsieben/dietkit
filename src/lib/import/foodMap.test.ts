import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PREDECESSOR_CATALOGUE } from "./catalogue.data";
import { CUSTOM_REASONS, FOOD_MAP, MAPPING_NOTES, mappingFor } from "./foodMap";

/**
 * The shipped table itself, read from `data/taco-4ed.json` rather than from the
 * database — the same file the seed loads, so these assertions are about the
 * publication rather than about whether someone remembered to migrate.
 */
interface TacoRow {
  id: number;
  description: string;
  values: Partial<Record<string, number>>;
  sentinels?: Partial<Record<string, string>>;
}

const TACO: TacoRow[] = JSON.parse(
  fs.readFileSync(
    path.join(import.meta.dirname, "../../../data/taco-4ed.json"),
    "utf8",
  ),
).foods;

const byId = new Map(TACO.map((row) => [row.id, row]));

const MACRO_CELLS = ["energyKcal", "proteinG", "carbG", "fatG"] as const;

/** `NA` and `Tr` are honest zeroes; `*` and a blank cell are not numbers. */
function cell(row: TacoRow, key: string): number | undefined {
  const value = row.values[key];
  if (value !== undefined) return value;
  const sentinel = row.sentinels?.[key];
  return sentinel === "NA" || sentinel === "Tr" ? 0 : undefined;
}

const mapped = Object.entries(FOOD_MAP).flatMap(([foodKey, mapping]) =>
  mapping.kind === "taco" ? [{ foodKey, ...mapping }] : [],
);

describe("FOOD_MAP", () => {
  it("has an answer for every food the catalogue can reach", () => {
    // A key with no entry is a food that arrives at the import screen as a
    // shrug. Better to have decided, even if the decision is "custom".
    for (const foodKey of Object.keys(PREDECESSOR_CATALOGUE.foods)) {
      expect(mappingFor(foodKey)).toBeDefined();
    }
  });

  it("maps nothing the catalogue does not contain", () => {
    // An entry for a key that no longer exists is a mapping nobody will ever
    // check again, and it makes the counts in the report wrong.
    for (const foodKey of Object.keys(FOOD_MAP)) {
      expect(PREDECESSOR_CATALOGUE.foods[foodKey]).toBeDefined();
    }
  });

  it("cites only rows TACO actually publishes", () => {
    // The predecessor cites id 1942 for tilápia. TACO's fourth edition ends at
    // 597, so that is not a row — and the "adjusted for cooking water loss"
    // note beside it is an adjustment applied to nothing.
    for (const entry of mapped) {
      expect(byId.get(entry.tacoId)?.id).toBe(entry.tacoId);
    }
  });

  it("never cites a row whose macros TACO withheld", () => {
    // Row 457, skimmed milk, prints `*` for all four. `compositionFromResult`
    // refuses those everywhere else in the app, so importing one would produce
    // an item the solver cannot use and the screen cannot explain.
    for (const entry of mapped) {
      const row = byId.get(entry.tacoId)!;
      for (const key of MACRO_CELLS) {
        expect(cell(row, key)).toBeTypeOf("number");
      }
    }
  });

  it("gives each row to at most one food", () => {
    const ids = mapped.map((entry) => entry.tacoId);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("maps foods whose composition is in the same neighbourhood", () => {
    // The check that catches a transposed id. The predecessor's `banana` was
    // annotated 194 — *Figo, cru* — which is 1.3 away by this measure while
    // every real mapping is under 0.5. The band is wide on purpose: six of
    // these foods carry USDA numbers rather than TACO's, and USDA and TACO
    // genuinely disagree about a grape by a third.
    for (const entry of mapped) {
      const row = byId.get(entry.tacoId)!;
      const theirs = PREDECESSOR_CATALOGUE.foods[entry.foodKey]!.per100g;
      const ours = {
        kcal: cell(row, "energyKcal")!,
        proteinG: cell(row, "proteinG")!,
        carbG: cell(row, "carbG")!,
        fatG: cell(row, "fatG")!,
      };

      const distance = Math.max(
        ...(["kcal", "proteinG", "carbG", "fatG"] as const).map(
          // Against at least 2 g, so a food with 0.2 g of fat is not judged on
          // a ratio of two rounding errors.
          (macro) => Math.abs(theirs[macro] - ours[macro]) / Math.max(ours[macro], 2),
        ),
      );

      expect({ food: entry.foodKey, distance: distance < 0.5 }).toEqual({
        food: entry.foodKey,
        distance: true,
      });
    }
  });

  it("does not import a fig as a banana", () => {
    expect(FOOD_MAP["banana"]).toEqual({
      kind: "taco",
      tacoId: 182,
      note: "corrected",
    });
    expect(byId.get(182)?.description).toContain("Banana");
    expect(byId.get(194)?.description).toContain("Figo");
  });

  it("leaves a custom food with numbers to be custom with", () => {
    // A refusal to map is only tenable because the predecessor's own per-100 g
    // figures travel with the food. Without them there would be nothing to
    // create, and "unmapped" would mean "dropped" after all.
    for (const [foodKey, mapping] of Object.entries(FOOD_MAP)) {
      if (mapping.kind !== "custom") continue;
      const food = PREDECESSOR_CATALOGUE.foods[foodKey]!;

      expect(food.per100g.kcal).toBeGreaterThan(0);
    }
  });

  it("uses every reason and note it defines", () => {
    // A vocabulary item nobody produces is a message nobody will ever see and
    // an explanation nobody has had to write.
    const reasons = new Set(
      Object.values(FOOD_MAP).flatMap((mapping) =>
        mapping.kind === "custom" ? [mapping.reason] : [],
      ),
    );
    const notes = new Set(mapped.flatMap((entry) => entry.note ?? []));

    expect([...reasons].sort()).toEqual([...CUSTOM_REASONS].sort());
    expect([...notes].sort()).toEqual([...MAPPING_NOTES].sort());
  });
});
