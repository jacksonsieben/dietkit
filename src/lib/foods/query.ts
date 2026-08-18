import { fold } from "@/lib/text";

/**
 * What the user typed, turned into something a query can be built from.
 *
 * Separate from the query itself (src/lib/db/foods.ts) because this half has no
 * database in it and is where the decisions live: what counts as a word, how
 * little is too little to search for, and how many results a request may ask
 * for. It runs on the server, and the same limits are what the input on the
 * device is written against.
 */

/**
 * Below this, the request is refused rather than answered.
 *
 * One letter matches a third of the table as a prefix, and a list of two
 * hundred foods is not a search result — it is the table, in an order nobody
 * asked for. The screen says so instead of showing it.
 */
export const MIN_QUERY_LENGTH = 2;

/** How long the input waits after the last keystroke before asking (#16). */
export const SEARCH_DEBOUNCE_MS = 250;

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

/**
 * More words than this and the extra ones are dropped.
 *
 * Every term is another `AND` over the index, and a description in TACO is
 * rarely more than four words ("Feijão, carioca, cozido"). The cap is there so
 * a pasted paragraph costs the same as a search.
 */
const MAX_TERMS = 6;

export interface FoodQuery {
  /** Folded words, in the order they were typed. Never empty. */
  readonly terms: readonly string[];
  /** The `to_tsquery('simple', …)` argument: `feijao:* & carioc:*`. */
  readonly tsquery: string;
}

/**
 * Splits on everything that is not a letter or a digit, after folding.
 *
 * The split is what makes the result safe to hand to `to_tsquery`, which parses
 * its argument as an expression rather than taking it literally: `&`, `|`, `!`,
 * `(` and `'` are operators there, and a query of `feijão & !arroz` — or of
 * anything a fuzzer types — comes out of here as the words `feijao` and
 * `arroz`. That is a parser, not an escape, which is the difference between
 * "no injection found" and "no injection possible".
 *
 * `undefined` when there is nothing worth searching for. The caller answers
 * with an empty result rather than an error: an empty box is not a mistake.
 */
export function parseFoodQuery(raw: string): FoodQuery | undefined {
  const terms = fold(raw)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term !== "")
    .slice(0, MAX_TERMS);

  // Measured over the words rather than over the raw string, so that "a," and
  // "  b  " are the one-letter searches they are.
  const typed = terms.join("").length;
  if (typed < MIN_QUERY_LENGTH) return undefined;

  return {
    terms,
    // `:*` on every word, so results arrive while the word is still being
    // typed — "feij" finds "feijão". `&`, because a second word is how someone
    // narrows a search, and TACO's descriptions are written as narrowings:
    // "arroz, integral, cozido".
    tsquery: terms.map((term) => `${term}:*`).join(" & "),
  };
}

/**
 * How many results to return, from `?limit=`.
 *
 * Clamped rather than rejected: a limit is a preference, and a request that
 * asks for a thousand foods gets fifty and a useful answer instead of a 400.
 */
export function parseLimit(raw: string | null): number {
  if (raw === null || raw.trim() === "") return DEFAULT_LIMIT;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT;

  return Math.min(Math.floor(parsed), MAX_LIMIT);
}
