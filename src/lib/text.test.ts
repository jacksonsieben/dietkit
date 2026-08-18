import { describe, expect, it } from "vitest";

import { fold, slugify } from "./text";

describe("fold", () => {
  it("strips the accents that keep a search from matching", () => {
    expect(fold("Feijão, carioca, cozido")).toBe("feijao, carioca, cozido");
    expect(fold("Miscelâneas")).toBe("miscelaneas");
    expect(fold("Açaí, polpa, congelada")).toBe("acai, polpa, congelada");
  });

  it("ignores what a phone keyboard adds around a typed word", () => {
    expect(fold("  Manteiga ")).toBe("manteiga");
  });

  it("leaves an already folded string alone", () => {
    // Load-bearing: `foods.search_text` is folded text, and the endpoint folds
    // the query before comparing the two. A fold that changed its own output
    // would make the second pass disagree with the first.
    const once = fold("Pão, de trigo, francês");
    expect(fold(once)).toBe(once);
  });
});

describe("slugify", () => {
  it("makes a slug that survives a rename of the printed name", () => {
    expect(slugify("Bebidas (alcoólicas e não alcoólicas)")).toBe(
      "bebidas-alcoolicas-e-nao-alcoolicas",
    );
    expect(slugify("Verduras, hortaliças e derivados")).toBe(
      "verduras-hortalicas-e-derivados",
    );
  });
});
