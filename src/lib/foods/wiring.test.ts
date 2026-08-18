import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import ptBR from "../../../messages/pt-BR.json";
import { DEFAULT_LIMIT, MIN_QUERY_LENGTH } from "./query";

const ROOT = path.resolve(import.meta.dirname, "../../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(ROOT, relative), "utf8");

/**
 * The parts of #16 that are true about how the screen and the route are wired
 * together rather than about what either of them computes. The query parser,
 * the SQL and the response body each have their own tests; what is left is the
 * half that only shows up in the source — that the input is debounced, that an
 * abandoned request is abandoned, and above all that nothing but the typed word
 * ever goes into the request.
 *
 * Read rather than rendered, for the reason `src/lib/profile/wiring.test.ts`
 * gives: next-intl resolves to its client build under Vitest and a server
 * component throws before it paints.
 */
describe("food search wiring", () => {
  const component = () => read("src/components/FoodSearch.tsx");

  it("waits for the typing to stop before asking anything", () => {
    // The done-when's "debounced client input", and the reason it is in the
    // issue at all: this is the one request DietKit makes, so one per pause
    // instead of one per keystroke is a privacy property before it is a
    // performance one.
    const source = component();

    expect(source).toContain("setTimeout(");
    // The delay itself, not merely the import: the parser and the screen have
    // to agree about the same pause, and a number typed in here is how they
    // stop agreeing — silently, since both would still work.
    expect(source).toMatch(/\}, SEARCH_DEBOUNCE_MS\)/);
    expect(source).not.toMatch(/\},\s*\d+\s*\)/);
  });

  it("abandons a search the user has moved on from", () => {
    // Two failures at once without this: results for a word that is no longer
    // in the box, when an older response lands after a newer one, and an error
    // painted over a search that was simply superseded.
    const source = component();

    expect(source).toContain("new AbortController()");
    expect(source).toContain("signal: controller.signal");
    expect(source).toContain("controller.abort()");
    expect(source).toContain("controller.signal.aborted");
  });

  it("sends the typed word and nothing else", () => {
    // The load-bearing one. Anything else appended to this URL is personal data
    // leaving the device, and it would leave in the query string of a request
    // that is logged by infrastructure.
    const source = component();
    const urls = [...source.matchAll(/`\/api\/foods\?([^`]*)`/g)].map(
      (match) => match[1],
    );

    expect(urls).toEqual(["q=${encodeURIComponent(asked)}"]);

    // No store, no profile, no weight: this component has no reason to touch
    // the device at all, and the seam it would have to use is absent.
    expect(source).not.toContain("getRepository()");
    expect(source).not.toContain("lib/storage");
  });

  it("asks the same question the server would answer", () => {
    // A client-side guess at the server's minimum is a box that either sends
    // requests the route refuses or refuses words the route would have matched.
    const source = component();

    expect(source).toContain("parseFoodQuery(typed)");
    expect(source).toContain('t("minLength", { min: MIN_QUERY_LENGTH })');
    expect(ptBR.Foods.minLength).toContain("{min, number}");
    expect(MIN_QUERY_LENGTH).toBeGreaterThan(0);
  });

  it("says when the list it is showing is only the first page", () => {
    const source = component();

    expect(source).toContain("body.count === DEFAULT_LIMIT");
    expect(source).toContain('t("resultLimit", { limit: DEFAULT_LIMIT })');
    expect(ptBR.Foods.resultLimit).toContain("{limit, number}");
    expect(DEFAULT_LIMIT).toBeGreaterThan(0);
  });

  it("prints a trace and a blank cell as what they are", () => {
    // TACO's `Tr` and `NA` are not zeros, and this is the one screen that could
    // quietly turn them into zeros by rendering `value ?? 0`.
    const source = component();

    expect(source).toContain('sentinel === "Tr"');
    expect(source).toContain('sentinel === "NA"');
    expect(source).not.toMatch(/\?\?\s*0/);
    // And the legend that says what the two words mean, since neither is
    // self-explanatory to someone who has not read the publication.
    expect(source).toContain('t("legend")');
  });

  it("credits the publication on the screen that quotes it", () => {
    // The user's condition for using TACO at all: "need to be very referenced
    // that the data comes from them". A search screen that shows 597 rows with
    // no source on it is exactly where that would be forgotten.
    const page = read("src/app/[locale]/alimentos/page.tsx");

    expect(page).toContain('t("lead")');
    expect(ptBR.Foods.lead).toContain("TACO");
    expect(ptBR.Foods.lead).toContain("NEPA");
    expect(ptBR.Foods.lead).toContain("100 g");
  });

  it("says out loud that this screen leaves the device", () => {
    // Every other screen in DietKit is a promise that nothing is sent. This one
    // is the exception, so it carries the exception in writing, next to the box
    // rather than only on the privacy page.
    const source = component();

    expect(source).toContain('t("serverNote")');
    expect(source).toContain('href="/privacidade"');
    // And the privacy page has to admit the part that is easy to leave out: the
    // term rides in the URL, so it reaches the infrastructure logs.
    expect(ptBR.Privacy.serverSearch).toMatch(/logs/);
  });

  it("uses every message the namespace defines, and defines every one it uses", () => {
    // next-intl renders the key path when a message is missing, so a typo ships
    // as "Foods.searchng" printed on the page; a leftover key is the same drift
    // in the other direction.
    const sources = [
      component(),
      read("src/app/[locale]/alimentos/page.tsx"),
    ].join("\n");
    const used = new Set(
      [...sources.matchAll(/\bt\("([A-Za-z0-9]+)"/g)].map((match) => match[1]),
    );

    expect([...used].sort()).toEqual(Object.keys(ptBR.Foods).sort());
  });
});

/**
 * The route itself: a shape, not a behaviour. What it computes is covered by
 * `src/lib/foods/endpoint.test.ts` and `src/lib/db/foods.test.ts`, neither of
 * which can import this file — `server-only` throws under Vitest, which is the
 * reason the handler is a four-line adapter in the first place.
 */
describe("food search route wiring", () => {
  const route = () => read("src/app/api/foods/route.ts");

  it("is a thin adapter over the two halves that are tested", () => {
    const source = route();

    expect(source).toContain("foodSearchResponse");
    expect(source).toContain("searchFoods");
    // No parsing, no SQL and no response building of its own: everything the
    // handler does beyond handing over the search params is untestable code.
    expect(source).not.toContain("NextResponse");
    expect(source).not.toContain("parseFoodQuery");
  });

  it("reads the query string and nothing else about the caller", () => {
    // A route that sees no personal data is a route that does not look for any.
    // Cookies and headers are where it would start looking.
    const source = route();

    expect(source).toContain("new URL(request.url)");
    expect(source).not.toContain("cookies");
    expect(source).not.toContain("headers");
  });

  it("keeps no log of what was searched for", () => {
    const source = route();

    expect(source).not.toContain("console.");
    expect(source).not.toContain("insert(");
  });
});
