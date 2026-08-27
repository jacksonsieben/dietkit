import { describe, expect, it } from "vitest";

import type { PresetCopy } from "@/lib/diet/fromPreset";
import { createMemoryRepository } from "@/lib/storage/memory";
import type { Repository } from "@/lib/storage/repository";
import type { Diet, SubstitutionGroup } from "@/lib/storage/types";

import { applyPresetCopy, fetchPresetCatalog } from "./store";

const NOW = "2026-08-27T10:00:00.000Z";

/**
 * The I/O around starting from a preset (#114).
 *
 * The failures matter more than the happy path here, which is why most of these
 * are about them: "there are no presets" and "this device cannot reach them"
 * are different sentences, and the whole reason this module does not copy
 * `import/store.ts`'s empty-map-on-failure is that collapsing the two would
 * print the first when the second is true.
 */
describe("fetching the preset catalogue", () => {
  it("asks for the whole catalogue, with nothing in the query string", async () => {
    const asked: string[] = [];
    const result = await fetchPresetCatalog(async (input) => {
      asked.push(input);
      return ok({ count: 1, presets: [{ slug: "a" }], foods: [{ id: 1 }] });
    });

    // No `?slug=`: a route that could name a preset is a route whose access
    // log records which diet somebody chose (docs/DECISIONS.md § D23).
    expect(asked).toEqual(["/api/presets"]);
    expect(result).toMatchObject({
      status: "ok",
      catalog: { presets: [{ slug: "a" }] },
    });
  });

  it("says the device is offline rather than saying there are none", async () => {
    const result = await fetchPresetCatalog(async () => {
      throw new TypeError("Failed to fetch");
    });

    expect(result).toEqual({ status: "offline" });
  });

  it("keeps a server that answered badly apart from one it never reached", async () => {
    const result = await fetchPresetCatalog(async () => ({
      ok: false,
      json: async () => ({}),
    }));

    expect(result).toEqual({ status: "unavailable" });
  });

  it("refuses a body that is not the shape it asked for", async () => {
    const result = await fetchPresetCatalog(async () => ({
      ok: true,
      json: async () => ({ count: 2 }),
    }));

    expect(result).toEqual({ status: "unavailable" });
  });

  it("passes the abort signal through, so leaving the screen cancels", async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;

    await fetchPresetCatalog(async (_input, init) => {
      seen = init?.signal;
      return ok({ count: 0, presets: [], foods: [] });
    }, controller.signal);

    expect(seen).toBe(controller.signal);
  });
});

describe("writing the copy", () => {
  it("writes the groups before the plan that points at them", async () => {
    const repository = createMemoryRepository();
    const order: string[] = [];

    await applyPresetCopy(watch(repository, order), copy());

    expect(order).toEqual(["group", "diet"]);
  });

  it("adds a plan without touching the one already there", async () => {
    const repository = createMemoryRepository();
    await repository.diets.put({ ...copy().diet, id: "mine", name: "O meu" });

    await applyPresetCopy(repository, copy());

    const stored = await repository.diets.list();
    expect(stored.map((diet) => diet.name).sort()).toEqual([
      "Do modelo",
      "O meu",
    ]);
    expect(await repository.substitutionGroups.list()).toHaveLength(1);
  });
});

function ok(body: unknown) {
  return { ok: true, json: async () => body };
}

const GROUP: SubstitutionGroup = {
  id: "group-1",
  name: "Frutas",
  foods: [
    { source: "taco", tacoId: 30 },
    { source: "taco", tacoId: 31 },
  ],
  createdAt: NOW,
  updatedAt: NOW,
};

const DIET: Diet = {
  id: "diet-1",
  name: "Do modelo",
  targets: { kcal: 2200, proteinG: 165, carbG: 240, fatG: 70 },
  meals: [],
  basedOnWeightKg: 82,
  createdAt: NOW,
  updatedAt: NOW,
};

function copy(): PresetCopy {
  return { diet: DIET, groups: [GROUP] };
}

/** Records the order the writes happen in, and changes nothing else. */
function watch(repository: Repository, order: string[]): Repository {
  return {
    ...repository,
    diets: {
      ...repository.diets,
      put: async (diet) => {
        order.push("diet");
        return repository.diets.put(diet);
      },
    },
    substitutionGroups: {
      ...repository.substitutionGroups,
      put: async (group) => {
        order.push("group");
        return repository.substitutionGroups.put(group);
      },
    },
  };
}
