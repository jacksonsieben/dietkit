import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryRepository } from "@/lib/storage/memory";
import type { Repository } from "@/lib/storage/repository";

import { deleteGroup, saveGroup } from "./groupStore";

const banana = { source: "taco", tacoId: 12 } as const;
const mamao = { source: "taco", tacoId: 48 } as const;
const maca = { source: "taco", tacoId: 61 } as const;

let repository: Repository;

beforeEach(() => {
  repository = createMemoryRepository();
});

describe("saveGroup", () => {
  it("writes a new group under a fresh id", async () => {
    const group = await saveGroup(
      repository,
      { name: "Frutas", foods: [banana, mamao] },
      undefined,
      "2026-08-17T10:00:00.000Z",
    );

    expect(group.createdAt).toBe("2026-08-17T10:00:00.000Z");
    await expect(repository.substitutionGroups.list()).resolves.toEqual([group]);
  });

  it("keeps the id and the creation date across an edit", async () => {
    const first = await saveGroup(
      repository,
      { name: "Frutas", foods: [banana, mamao] },
      undefined,
      "2026-08-01T10:00:00.000Z",
    );

    const edited = await saveGroup(
      repository,
      { name: "Frutas", foods: [banana, mamao, maca] },
      first.id,
      "2026-08-17T10:00:00.000Z",
    );

    // Slots point at the group by id: a new id would leave them on the version
    // that was replaced.
    expect(edited.id).toBe(first.id);
    expect(edited.createdAt).toBe("2026-08-01T10:00:00.000Z");
    expect(edited.updatedAt).toBe("2026-08-17T10:00:00.000Z");
    await expect(repository.substitutionGroups.list()).resolves.toHaveLength(1);
  });

  it("keeps the id even if the record vanished from another tab", async () => {
    const group = await saveGroup(
      repository,
      { name: "Frutas", foods: [banana, mamao] },
      "g-gone",
      "2026-08-17T10:00:00.000Z",
    );

    expect(group.id).toBe("g-gone");
  });
});

describe("deleteGroup", () => {
  it("removes the group and nothing else", async () => {
    const group = await saveGroup(
      repository,
      { name: "Frutas", foods: [banana, mamao] },
      undefined,
      "2026-08-17T10:00:00.000Z",
    );
    const kept = await saveGroup(
      repository,
      { name: "Grãos", foods: [banana, maca] },
      undefined,
      "2026-08-17T10:00:00.000Z",
    );

    await deleteGroup(repository, group.id);

    await expect(repository.substitutionGroups.list()).resolves.toEqual([kept]);
  });
});
