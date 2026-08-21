import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../../..");

/**
 * The screens that have been brought into the instrument world, and a list of
 * the idioms they left behind (#61, #64, #66).
 *
 * A visual language is only a language while every screen speaks it, and the
 * way one stops is never a decision — it is a hurried edit that reaches for
 * `rounded-md border border-black/10` because that is what the old files did
 * and the diff looked fine in isolation. Nothing renders here, so this test
 * cannot check that a screen *looks* right; what it can check is that the
 * vocabulary the migration deleted has not come back, which is the failure
 * that actually happens.
 *
 * The list grows one PR at a time on purpose. A file not named here is not
 * approved for the old idioms — it is a screen still waiting its turn, and
 * adding its name is how a migration PR says it is done.
 */
const MIGRATED = [
  "src/app/[locale]/alimentos/grupos/page.tsx",
  "src/app/[locale]/alimentos/meus/page.tsx",
  "src/app/[locale]/alimentos/page.tsx",
  "src/app/[locale]/dieta/page.tsx",
  "src/app/[locale]/importar/page.tsx",
  "src/app/[locale]/perfil/page.tsx",
  "src/components/CustomFoodManager.tsx",
  "src/components/DietImport.tsx",
  "src/components/Field.tsx",
  "src/components/FoodPicker.tsx",
  "src/components/FoodSearch.tsx",
  "src/components/GlyphBar.tsx",
  "src/components/MacroPanel.tsx",
  "src/components/MealItems.tsx",
  "src/components/MealPlanner.tsx",
  "src/components/ProfileForm.tsx",
  "src/components/SubstitutionGroupManager.tsx",
  "src/components/Today.tsx",
  "src/components/nd/FileField.tsx",
  "src/components/nd/Strip.tsx",
  "src/components/nd/kit.tsx",
];

/**
 * Each banned pattern with the reason it is banned, so a failure reads as an
 * instruction rather than as a regex someone has to go and decode.
 */
const BANNED: readonly { pattern: RegExp; why: string }[] = [
  {
    pattern: /\bopacity-\d/,
    why: "grey is a colour here (text-nd-dim), not a transparency; a faded ink is a different grey on every background it lands on",
  },
  {
    pattern: /-(?:red|amber|emerald|sky|slate|zinc|gray|grey)-\d{2,3}\b/,
    why: "the palette is ground, ink, unlit, dim and one red — a Tailwind ramp colour is a second palette",
  },
  {
    pattern: /\brounded-(?:sm|md|lg|xl|2xl|3xl|full)\b/,
    why: "this world is drawn with rules and right angles; a rounded card is the old world's shape",
  },
  {
    pattern: /\bborder-(?:black|white)\//,
    why: "a hairline is border-nd-unlit, which is a real colour in both themes rather than ink at low alpha",
  },
  {
    pattern: /\btabular-nums\b/,
    why: 'numeric cells carry data-numeric="" and globals.css does the rest, so one rule governs every number',
  },
];

describe("the instrument world", () => {
  for (const file of MIGRATED) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");

    // Comments explain at length why several of these are gone, and a sentence
    // naming `rounded-md` should not fail the test that says `rounded-md` is
    // not used — the same reason `modal.test.ts` strips them.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    it(`${file} speaks only the world's vocabulary`, () => {
      for (const { pattern, why } of BANNED) {
        const found = pattern.exec(code);
        expect(found?.[0], why).toBeUndefined();
      }
    });
  }

  it("keeps the vocabulary in one file", () => {
    // Every screen above imports its buttons, rules and labels from the kit.
    // The check is on `ACTION`, the class string behind the filled button: a
    // screen that pastes it instead of importing it is how the kit stops being
    // the single definition of what a button looks like.
    const users = MIGRATED.filter((file) => file !== "src/components/nd/kit.tsx")
      .map((file) => fs.readFileSync(path.join(ROOT, file), "utf8"))
      .filter((source) => source.includes("bg-nd-ink px-5 py-3"));

    expect(users).toEqual([]);
  });
});
