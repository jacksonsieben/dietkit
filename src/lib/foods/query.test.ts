import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIMIT,
  MAX_IDS,
  MAX_LIMIT,
  parseFoodIds,
  parseFoodQuery,
  parseLimit,
} from "./query";

/**
 * What a typed string becomes before any database sees it (#16).
 *
 * The interesting cases are all the ones where the text is not a tidy word: an
 * accent, a comma, an unfinished second word, and the tsquery operators, which
 * are ordinary characters on a Portuguese keyboard and syntax to Postgres.
 */

describe("parseFoodQuery", () => {
  it("folds accents, so the query matches the folded column", () => {
    expect(parseFoodQuery("Feijão")).toEqual({
      terms: ["feijao"],
      tsquery: "feijao:*",
    });
  });

  it("asks for a prefix on every word", () => {
    // "arroz integ" has to find "Arroz, integral" — the request is sent while
    // the user is still typing, so the last word is nearly always a fragment.
    expect(parseFoodQuery("arroz integ")?.tsquery).toBe("arroz:* & integ:*");
  });

  it("drops the punctuation TACO's own descriptions are written with", () => {
    expect(parseFoodQuery("Arroz, integral,")?.terms).toEqual([
      "arroz",
      "integral",
    ]);
  });

  it("turns tsquery operators into words rather than passing them on", () => {
    // `!` and `&` are syntax to to_tsquery and characters to a user. Splitting
    // on everything that is not a letter or a digit is what makes the argument
    // safe by construction rather than by escaping.
    expect(parseFoodQuery("feijão & !arroz")).toEqual({
      terms: ["feijao", "arroz"],
      tsquery: "feijao:* & arroz:*",
    });
  });

  it("keeps digits, which several foods are named by", () => {
    // "Arroz, tipo 1, cru" — the number is the whole difference from tipo 2.
    expect(parseFoodQuery("arroz tipo 1")?.terms).toEqual([
      "arroz",
      "tipo",
      "1",
    ]);
  });

  it("refuses a query too short to be one", () => {
    expect(parseFoodQuery("a")).toBeUndefined();
    expect(parseFoodQuery("")).toBeUndefined();
    expect(parseFoodQuery("   ")).toBeUndefined();
    // Punctuation is not length: this is a one-letter search.
    expect(parseFoodQuery("a,")).toBeUndefined();
  });

  it("counts letters across words, not per word", () => {
    // "de ovo" starts as "de o" — four letters, two words, worth searching.
    expect(parseFoodQuery("de o")?.terms).toEqual(["de", "o"]);
  });

  it("stops after six words, so a pasted paragraph costs a search", () => {
    const query = parseFoodQuery("um dois tres quatro cinco seis sete oito");

    expect(query?.terms).toHaveLength(6);
    expect(query?.terms.at(-1)).toBe("seis");
  });
});

describe("parseLimit", () => {
  it("defaults when the parameter is absent or empty", () => {
    expect(parseLimit(null)).toBe(DEFAULT_LIMIT);
    expect(parseLimit("")).toBe(DEFAULT_LIMIT);
  });

  it("takes a number a client asked for", () => {
    expect(parseLimit("5")).toBe(5);
  });

  it("clamps rather than refusing", () => {
    // A limit is a preference, not an assertion: an unreasonable one gets a
    // reasonable answer instead of a 400 nobody can act on.
    expect(parseLimit("1000")).toBe(MAX_LIMIT);
    expect(parseLimit("-3")).toBe(DEFAULT_LIMIT);
    expect(parseLimit("0")).toBe(DEFAULT_LIMIT);
    expect(parseLimit("abc")).toBe(DEFAULT_LIMIT);
    expect(parseLimit("7.9")).toBe(7);
  });
});

describe("parseFoodIds", () => {
  it("reads the ids a caller already knows", () => {
    expect(parseFoodIds("1,182,561")).toEqual([1, 182, 561]);
  });

  it("asks for each row once, in the order it was asked for", () => {
    // The import walks its catalogue, and two of the old app's foods can map to
    // the same TACO row. Asking twice would only make the URL longer.
    expect(parseFoodIds("182,1,182")).toEqual([182, 1]);
  });

  it("is a parser rather than an escape", () => {
    // `parseFoodQuery`'s rule, for the same reason: what comes out is numbers
    // by construction, so there is no string here for anything to hide in.
    expect(parseFoodIds("1; drop table foods; --2")).toEqual([1, 2]);
    expect(parseFoodIds("-3")).toEqual([3]);
    expect(parseFoodIds("1.5")).toEqual([1, 5]);
  });

  it("answers an unusable parameter with nothing rather than an error", () => {
    expect(parseFoodIds(null)).toEqual([]);
    expect(parseFoodIds("")).toEqual([]);
    expect(parseFoodIds("abc")).toEqual([]);
    expect(parseFoodIds("0")).toEqual([]);
  });

  it("stops at a number of foods that is still a URL", () => {
    const many = Array.from({ length: MAX_IDS + 40 }, (_, index) => index + 1);

    expect(parseFoodIds(many.join(","))).toHaveLength(MAX_IDS);
  });
});
