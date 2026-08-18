import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDietKitDatabase } from "@/lib/storage/dexie/db";
import { createDexieRepository } from "@/lib/storage/dexie/repository";
import type { Repository } from "@/lib/storage";

import { loadProfileForm, saveProfileForm, toField } from "./persistence";
import type { ProfileFormInput } from "./validation";

/**
 * Run against the Dexie adapter rather than the in-memory one, through
 * `fake-indexeddb`. The behaviour under test is an upsert that relies on the
 * unique index on `date`, and the point of checking it is to know the real
 * store enforces it — a mock would only confirm the test's own assumptions.
 */
let repository: Repository;
let dispose: () => Promise<void>;

const INPUT: ProfileFormInput = {
  weightKg: 82.4,
  heightCm: 178,
  birthDate: "1995-03-14",
  sex: "male",
  activityFactor: 1.55,
};

const TODAY = "2026-08-18";
const NOW = "2026-08-18T09:00:00.000Z";

beforeEach(() => {
  const db = createDietKitDatabase(`profile-test-${crypto.randomUUID()}`);
  repository = createDexieRepository(db);
  dispose = async () => {
    db.close();
    await db.delete();
  };
});

afterEach(async () => {
  await dispose();
});

describe("toField", () => {
  it("writes the decimal separator pt-BR uses", () => {
    expect(toField(82.4)).toBe("82,4");
  });

  it("leaves a whole number alone", () => {
    expect(toField(178)).toBe("178");
  });

  it("produces something the form's own parser accepts back", async () => {
    // The round-trip is the actual requirement: a formatter that emitted
    // "1.234,5" would render a value the field then refuses to validate.
    const { parseDecimal } = await import("./validation");

    for (const value of [82.4, 178, 1.55, 1, 2.5, 20, 400]) {
      expect(parseDecimal(toField(value)), `${value} did not survive`).toBe(value);
    }
  });
});

describe("loadProfileForm", () => {
  it("returns empty fields when nothing has been saved yet", async () => {
    const loaded = await loadProfileForm(repository);

    expect(loaded.values).toEqual({
      weightKg: "",
      heightCm: "",
      birthDate: "",
      sex: "",
      activityFactor: "",
    });
    expect(loaded.weightFrom).toBeUndefined();
  });

  it("reads back what was saved, so the form is editable after creation", async () => {
    await saveProfileForm(repository, INPUT, TODAY, NOW);

    const loaded = await loadProfileForm(repository);

    expect(loaded.values).toEqual({
      weightKg: "82,4",
      heightCm: "178",
      birthDate: "1995-03-14",
      sex: "male",
      activityFactor: "1,55",
    });
  });

  it("seeds the weight from the most recent entry and says which day it is", async () => {
    await saveProfileForm(repository, INPUT, "2026-08-11", NOW);
    await saveProfileForm(repository, { ...INPUT, weightKg: 81 }, "2026-08-15", NOW);

    const loaded = await loadProfileForm(repository);

    expect(loaded.values.weightKg).toBe("81");
    // Without this the field would show a four-day-old weight as if it were
    // today's, which is the reading a user would take from an undated number.
    expect(loaded.weightFrom).toBe("2026-08-15");
  });
});

describe("saveProfileForm", () => {
  it("does not put the weight in the profile", async () => {
    // The structural claim of `Profile` (src/lib/storage/types.ts): weight is
    // absent, because the log is the one place a current weight comes from.
    await saveProfileForm(repository, INPUT, TODAY, NOW);

    const profile = await repository.profile.get();

    expect(profile).toEqual({
      heightCm: 178,
      birthDate: "1995-03-14",
      sex: "male",
      activityFactor: 1.55,
      updatedAt: NOW,
    });
    expect(profile).not.toHaveProperty("weightKg");
  });

  it("writes the weight to the log, dated today", async () => {
    await saveProfileForm(repository, INPUT, TODAY, NOW);

    const entries = await repository.weight.list();

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ date: TODAY, weightKg: 82.4, recordedAt: NOW });
  });

  it("edits today's entry instead of stacking a second one", async () => {
    await saveProfileForm(repository, INPUT, TODAY, NOW);
    const first = (await repository.weight.getByDate(TODAY))?.id;

    await saveProfileForm(
      repository,
      { ...INPUT, weightKg: 81.9 },
      TODAY,
      "2026-08-18T21:30:00.000Z",
    );

    const entries = await repository.weight.list();

    expect(entries).toHaveLength(1);
    expect(entries[0].weightKg).toBe(81.9);
    // The id is the same row, not a replacement: anything that later points at
    // a weight entry keeps pointing at the same one.
    expect(entries[0].id).toBe(first);
  });

  it("keeps a note that was attached to the day", async () => {
    // The note belongs to the day (#23), not to whoever last touched the
    // profile form. Overwriting it here would lose data the form never showed.
    await repository.weight.put({
      id: crypto.randomUUID(),
      date: TODAY,
      weightKg: 83,
      note: "depois do almoço",
      recordedAt: NOW,
    });

    await saveProfileForm(repository, INPUT, TODAY, NOW);

    expect((await repository.weight.getByDate(TODAY))?.note).toBe("depois do almoço");
  });

  it("leaves earlier days untouched", async () => {
    await saveProfileForm(repository, { ...INPUT, weightKg: 84 }, "2026-08-01", NOW);
    await saveProfileForm(repository, INPUT, TODAY, NOW);

    const entries = await repository.weight.list();

    expect(entries.map((entry) => [entry.date, entry.weightKg])).toEqual([
      ["2026-08-01", 84],
      [TODAY, 82.4],
    ]);
  });

  it("overwrites the profile rather than accumulating profiles", async () => {
    await saveProfileForm(repository, INPUT, TODAY, NOW);
    await saveProfileForm(
      repository,
      { ...INPUT, heightCm: 179 },
      TODAY,
      "2026-08-19T09:00:00.000Z",
    );

    const profile = await repository.profile.get();

    expect(profile?.heightCm).toBe(179);
    expect(profile?.updatedAt).toBe("2026-08-19T09:00:00.000Z");
  });

  it("puts everything it wrote into the export, which is the only backup", async () => {
    // docs/SCOPE.md § 3: the JSON export is the whole of the user's backup. A
    // field written through a path the snapshot does not cover is a field that
    // silently does not survive a device being lost.
    await saveProfileForm(repository, INPUT, TODAY, NOW);

    const snapshot = await repository.exportAll();

    expect(snapshot.profile?.birthDate).toBe("1995-03-14");
    expect(snapshot.weight).toHaveLength(1);
    expect(snapshot.weight[0].weightKg).toBe(82.4);
  });
});
