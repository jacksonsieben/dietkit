/**
 * One fold, used everywhere text is matched instead of displayed.
 *
 * Three places need to agree about what "the same word" means: the ingest, which
 * writes `foods.search_text` (scripts/taco/parse.ts); the search endpoint, which
 * folds what a user typed before comparing it with that column (#16); and the
 * on-device store, which searches custom foods the same way (src/lib/storage).
 * They agreed by coincidence until this file existed — two implementations that
 * happened to behave alike. A drift between them is invisible in review and
 * total at runtime: every accented query stops matching, and nothing throws.
 */

/**
 * Lowercase, without diacritics: "Açaí" and "acai" fold to the same string.
 *
 * Brazilian food names are full of accents and nobody types them into a search
 * box on a phone. NFD splits a base letter from its combining mark and the
 * `\p{Diacritic}` strip removes the marks, leaving the letter — as opposed to
 * a transliteration table, which would need an entry per letter and would still
 * miss one.
 */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * A folded name as an identifier: `Bebidas (alcoólicas)` → `bebidas-alcoolicas`.
 *
 * Used for the food-group keys, which are primary keys in the reference
 * database — so they have to survive the publication renaming a heading, and
 * must never contain a character that needs escaping in a URL.
 */
export function slugify(text: string): string {
  return fold(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
