import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { PresetCatalog } from "@/lib/db/presets";

import { presetCatalogResponse, type PresetCatalogFn } from "./endpoint";

/**
 * The request-to-response half of `GET /api/presets` (#114).
 *
 * The query itself is settled in src/lib/db/presets.test.ts against a real
 * Postgres. What is left here is what a database cannot tell you about: what
 * the body says, who is allowed to hold it, and how long an empty answer is
 * allowed to outlive the seed that fixes it.
 */

const CATALOG: PresetCatalog = {
  presets: [
    {
      slug: "quatro-refeicoes",
      name: "Quatro refeições",
      description: "Café da manhã, almoço, lanche e jantar.",
      groups: [{ slug: "frutas", name: "Frutas", foodIds: [2] }],
      meals: [
        {
          name: "Café da manhã",
          share: 0.2,
          items: [
            {
              foodId: 1,
              quantityG: 60,
              mandatory: false,
              minG: 30,
              maxG: 120,
              groupSlug: null,
            },
          ],
          optionSets: [],
        },
      ],
    },
  ],
  foods: [
    {
      id: 1,
      description: "Aveia, flocos, crua",
      groupSlug: "cereais-e-derivados",
      groupName: "Cereais e derivados",
      energyKcal: 394,
      proteinG: 13.9,
      carbG: 66.6,
      fatG: 8.5,
      fiberG: 9.1,
      sentinels: {},
    },
  ],
};

function stub(catalog: PresetCatalog = CATALOG) {
  return vi.fn<PresetCatalogFn>(async () => catalog);
}

describe("presetCatalogResponse", () => {
  it("answers with the presets and the compositions they name", async () => {
    const response = await presetCatalogResponse(stub());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      count: 1,
      presets: CATALOG.presets,
      foods: CATALOG.foods,
    });
  });

  it("is asked nothing, because there is nothing to ask it", async () => {
    // The signature is the privacy property. A route that took a slug would be
    // a route whose access log says which diet somebody chose, and § D23 is the
    // published list of what this server learns (#114).
    const load = stub();
    await presetCatalogResponse(load);

    expect(load).toHaveBeenCalledWith();
  });

  it("lets a shared cache hold the answer", async () => {
    // Public, not private: nothing in the body is anybody's. The alternative is
    // every device on a network paying for the same quotation of a published
    // table.
    const response = await presetCatalogResponse(stub());
    const cache = response.headers.get("cache-control");

    expect(cache).toContain("public");
    expect(cache).toContain("s-maxage=3600");
  });

  it("does not let an unseeded branch's silence outlive the seed", async () => {
    // What actually happened to food search on the preview deployment: an empty
    // answer cached with a day's `stale-while-revalidate` kept being served
    // long after the rows arrived, and it took a redeploy to clear. An empty
    // catalogue is a deployment state, not a fact about the catalogue.
    const response = await presetCatalogResponse(
      stub({ presets: [], foods: [] }),
    );
    const cache = response.headers.get("cache-control");

    await expect(response.json()).resolves.toEqual({
      count: 0,
      presets: [],
      foods: [],
    });
    expect(cache).toContain("s-maxage=60");
    expect(cache).not.toContain("stale-while-revalidate");
  });
});

/**
 * Why serving presets adds no line to docs/DECISIONS.md § D23 (#114).
 *
 * § D23 is the published list of everything this server gets to learn about a
 * person, and the honest way to keep such a list short is not to be careful
 * when writing it -- it is to build routes that have nothing to add. This one
 * has nothing to add: it is a GET with no query, no body and no session, it
 * answers every device with the same bytes, and it never writes anywhere.
 *
 * So the list is unchanged, and this is the test that says why. It reads the
 * route rather than calling it, because what it is asserting is an absence, and
 * an absence is not something a request can demonstrate: a handler that counted
 * fetches would pass every test in the block above.
 *
 * The obvious additions are the ones this refuses. A hit counter ("which model
 * is popular?") is a table of what diets people start. An access log keyed to a
 * slug is the same thing with a timestamp. Neither is bad faith; both are one
 * afternoon's work away, and both would be a line in § D23.
 */
describe("what the server learns from a preset request", () => {
  const source = (file: string) =>
    fs.readFileSync(
      path.resolve(import.meta.dirname, "../../..", file),
      "utf8",
    );

  it("takes no request, so it cannot read a header, a cookie or an address", () => {
    // `GET()` rather than `GET(request)`. Next hands the handler a Request; a
    // handler that never names it cannot reach an IP or a user agent, and that
    // is checkable from here in a way "we do not look at it" is not.
    expect(source("src/app/api/presets/route.ts")).toContain(
      "export async function GET()",
    );
  });

  it("counts nothing, logs nothing and writes nothing", () => {
    const code = [
      source("src/app/api/presets/route.ts"),
      source("src/lib/presets/endpoint.ts"),
    ]
      .join("\n")
      // Comments say what these files refuse to do, and a sentence naming
      // `console.log` should not fail the test that bans `console.log`.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    for (const forbidden of [
      /\bconsole\./,
      /\bcookies\(/,
      /\bheaders\(/,
      /\binsert\(/,
      /\bupdate\(/,
      /\bwaitUntil\b/,
      /\bfetch\(/,
    ]) {
      expect(
        forbidden.exec(code)?.[0],
        `${forbidden.source} in the route`,
      ).toBeUndefined();
    }
  });
});
