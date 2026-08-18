import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import ptBR from "../../../messages/pt-BR.json";
import {
  CUSTOM_FOOD_ERROR_CODES,
  CUSTOM_FOOD_FIELDS,
} from "./custom";
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
    expect(source).toContain("controller.abort()");
    expect(source).toContain("controller.signal.aborted");

    // The signal reaches the request. It is handed down a level now that the
    // fetch lives in its own function (#17 gave the effect a second source to
    // wait on), so this checks the two ends of that rather than one literal.
    expect(source).toContain("fetchTaco(asked, controller.signal)");
    expect(source).toMatch(/fetch\(`[^`]*`,\s*\{\s*signal,?\s*\}\)/);
  });

  it("sends the typed word and nothing else", () => {
    // The load-bearing one. Anything else appended to this URL is personal data
    // leaving the device, and it would leave in the query string of a request
    // that is logged by infrastructure.
    //
    // This used to be enforced the blunt way — the component was forbidden from
    // importing the store at all. #17 puts the user's own foods in these same
    // results, so the store is now legitimately here, and the invariant has to
    // be stated about the request rather than about the imports: exactly one
    // call goes out, it is a GET, and its URL is that one literal.
    const source = component();
    const urls = [...source.matchAll(/`\/api\/foods\?([^`]*)`/g)].map(
      (match) => match[1],
    );

    expect(urls).toEqual(["q=${encodeURIComponent(asked)}"]);
    expect([...source.matchAll(/\bfetch\(/g)]).toHaveLength(1);

    // Nothing is ever sent, only asked for: a body or a method is the shape a
    // leak of the device's data would have to take.
    expect(source).not.toMatch(/\bbody:/);
    expect(source).not.toMatch(/method:\s*"/);

    // And the device half is read where it lives. `searchCustomFoods` takes a
    // repository and returns rows; there is no path from it to the network.
    expect(source).toContain("searchCustomFoods(getRepository(), terms)");
  });

  it("shows both halves of the food list, and says which is which", () => {
    // #17's done-when: the user's own foods "appear in search alongside TACO
    // results, visually distinguished". Merged in one place so the ordering
    // rule is `mergeListings`, tested in results.test.ts, rather than a `.map`
    // written twice here.
    const source = component();

    expect(source).toContain("mergeListings(custom, body?.foods ?? [])");
    expect(source).toContain('listing.source === "custom"');
    // The badge is the distinction that survives a screenshot in grey scale;
    // the border alone would not.
    expect(source).toContain('t("mine")');
    expect(ptBR.Foods.mine).not.toBe("");
  });

  it("keeps showing the half that answered when the other one fails", () => {
    // The two sources fail for unrelated reasons — the network is down, or
    // IndexedDB is unavailable in a private window. A single failure state for
    // the pair would hide the user's own foods every time the app went offline,
    // which is the moment a PWA is meant to be most useful.
    const source = component();

    expect(source).toContain("Promise.all(");
    expect(source).toContain("if (!answer.taco.ok && !answer.custom.ok)");
    expect(source).toContain('t("tacoUnavailable")');
    expect(source).toContain('t("deviceUnavailable")');
  });

  it("offers the way to add what the table does not have", () => {
    // Offered before anyone has searched, not only after an empty result: the
    // moment someone needs this is the moment they were about to give up.
    const source = component();

    expect(source).toContain('href="/alimentos/meus"');
    expect(source).toContain('t("manageLink")');
    expect(ptBR.Foods.missingNote).toMatch(/whey/i);
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

    expect(source).toContain("tacoCount === DEFAULT_LIMIT");
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
 * The screen where the foods TACO does not have get typed in (#17).
 *
 * Its arithmetic and its persistence are tested on their own (custom.test.ts,
 * persistence.test.ts). What is left here is what only the component can get
 * wrong: that this screen never becomes a request, that an edit stays an edit,
 * and that a delete is asked twice.
 */
describe("custom food screen wiring", () => {
  const component = () => read("src/components/CustomFoodManager.tsx");

  it("never leaves the device", () => {
    // The counterpart of the search screen's exception. Everything on this page
    // is a fact about a person — what they eat, and which brand of it — so the
    // network has no business here at all.
    const source = component();

    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("/api/");
  });

  it("keeps an edit an edit", () => {
    // A `Diet` stores foods by id. A save that minted a new one would leave
    // every meal pointing at the version being replaced, with nothing on screen
    // looking wrong — so the id being edited is passed through to the save.
    const source = component();

    expect(source).toContain(
      "saveCustomFood(repository, result.value, editing, new Date().toISOString())",
    );
    expect(source).toContain("setEditing(food.id)");
    expect(source).toContain("toCustomFoodForm(food)");
  });

  it("re-reads the list after a write instead of patching it by hand", () => {
    // The store decides the order — by name, in both adapters — and a list kept
    // in step by hand drifts from it the first time somebody renames a food.
    const source = component();

    expect([...source.matchAll(/await repository\.customFoods\.list\(\)/g)]).toHaveLength(2);
  });

  it("asks twice before deleting, in this app's own words", () => {
    // A native `confirm()` is the one piece of UI here that cannot be
    // translated, cannot be styled, and cannot be read by a test.
    const source = component();

    expect(source).toContain("confirming === food.id");
    expect(source).toContain('t("removeConfirm")');
    expect(source).toContain('t("removeWarning")');
    expect(source).not.toMatch(/\bconfirm\(/);
    expect(source).not.toMatch(/\balert\(/);
  });

  it("derives the energy rather than asking for it", () => {
    // A typed kcal that disagrees with the typed macros is a food that
    // contradicts itself. There is no box for it, and the number on screen is
    // the same arithmetic that gets stored.
    const source = component();

    expect(source).toContain("deriveKcal(protein, carb, fat)");
    expect(source).toContain('t("energyPreview"');
    expect(CUSTOM_FOOD_FIELDS).not.toContain("kcal");
  });

  it("has a message for every way the form can be wrong", () => {
    // next-intl renders the key path when a message is missing, so an error
    // code with no message ships as "MyFoods.errors.macroSum" printed in red
    // under the box — the one place a user is already confused.
    expect(Object.keys(ptBR.MyFoods.errors).sort()).toEqual(
      [...CUSTOM_FOOD_ERROR_CODES].sort(),
    );
  });

  it("uses every message the namespace defines, and defines every one it uses", () => {
    const sources = [
      component(),
      read("src/app/[locale]/alimentos/meus/page.tsx"),
    ].join("\n");
    const used = new Set(
      [...sources.matchAll(/\bt\("([A-Za-z0-9]+)"/g)].map((match) => match[1]),
    );

    // `errors` is reached through a computed key, `t(`errors.${code}`)`, and is
    // covered by the test above instead.
    const defined = Object.keys(ptBR.MyFoods).filter((key) => key !== "errors");

    expect([...used].sort()).toEqual(defined.sort());
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
