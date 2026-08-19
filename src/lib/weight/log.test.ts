import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDietKitDatabase } from "@/lib/storage/dexie/db";
import { createDexieRepository } from "@/lib/storage/dexie/repository";
import type { Repository } from "@/lib/storage";

import { entryOn, loadWeightLog, removeWeightEntry, saveWeightEntry } from "./log";

/**
 * Against the Dexie adapter through `fake-indexeddb`, not the in-memory one:
 * the rule under test is an upsert that leans on the unique index on `date`,
 * and the point of testing it is to know the real store enforces it.
 */
let repository: Repository;
let dispose: () => Promise<void>;

const NOW = "2026-08-19T09:00:00.000Z";

beforeEach(() => {
  const db = createDietKitDatabase(`weight-test-${crypto.randomUUID()}`);
  repository = createDexieRepository(db);
  dispose = async () => {
    db.close();
    await db.delete();
  };
});

afterEach(async () => {
  await dispose();
});

describe("saveWeightEntry", () => {
  it("writes the day's weight", async () => {
    const { entry, replaced } = await saveWeightEntry(
      repository,
      { date: "2026-08-19", weightKg: 82.4 },
      NOW,
    );

    expect(replaced).toBe(false);
    expect(await repository.weight.getByDate("2026-08-19")).toEqual({
      id: entry.id,
      date: "2026-08-19",
      weightKg: 82.4,
      note: undefined,
      recordedAt: NOW,
    });
  });

  it("edits the day rather than stacking a second entry", async () => {
    // The defined answer to logging the same date twice. Two rows for one
    // Tuesday would leave the average (#24) and "my latest weight" (#25)
    // each picking one, and picking differently.
    await saveWeightEntry(repository, { date: "2026-08-19", weightKg: 82.4 }, NOW);
    const second = await saveWeightEntry(
      repository,
      { date: "2026-08-19", weightKg: 81.9 },
      "2026-08-19T20:00:00.000Z",
    );

    expect(second.replaced).toBe(true);
    expect(await repository.weight.list()).toHaveLength(1);
    expect((await repository.weight.getByDate("2026-08-19"))?.weightKg).toBe(81.9);
  });

  it("keeps the day's identity when it is corrected", async () => {
    // A correction is the same record with a better number in it, not a new
    // measurement that happens to fall on the same day.
    const first = await saveWeightEntry(
      repository,
      { date: "2026-08-19", weightKg: 82.4 },
      NOW,
    );
    const second = await saveWeightEntry(
      repository,
      { date: "2026-08-19", weightKg: 81.9 },
      NOW,
    );

    expect(second.entry.id).toBe(first.entry.id);
  });

  it("moves the recording time when the value is rewritten", async () => {
    await saveWeightEntry(repository, { date: "2026-08-19", weightKg: 82.4 }, NOW);
    await saveWeightEntry(
      repository,
      { date: "2026-08-19", weightKg: 81.9 },
      "2026-08-20T07:30:00.000Z",
    );

    expect((await repository.weight.getByDate("2026-08-19"))?.recordedAt).toBe(
      "2026-08-20T07:30:00.000Z",
    );
  });

  it("separates the day weighed from the moment typed", async () => {
    // A backfilled entry is days apart in the two fields, and that is the
    // point of keeping both.
    const { entry } = await saveWeightEntry(
      repository,
      { date: "2026-08-01", weightKg: 84 },
      NOW,
    );

    expect(entry.date).toBe("2026-08-01");
    expect(entry.recordedAt).toBe(NOW);
  });

  it("clears a note the user deleted", async () => {
    // Falling back to the stored note would leave "após o treino" attached to
    // a measurement it was never written about.
    await saveWeightEntry(
      repository,
      { date: "2026-08-19", weightKg: 82.4, note: "após o treino" },
      NOW,
    );
    await saveWeightEntry(repository, { date: "2026-08-19", weightKg: 82.4 }, NOW);

    expect((await repository.weight.getByDate("2026-08-19"))?.note).toBeUndefined();
  });

  it("leaves other days alone", async () => {
    await saveWeightEntry(repository, { date: "2026-08-18", weightKg: 83 }, NOW);
    await saveWeightEntry(repository, { date: "2026-08-19", weightKg: 82.4 }, NOW);

    expect(await repository.weight.list()).toHaveLength(2);
    expect((await repository.weight.getByDate("2026-08-18"))?.weightKg).toBe(83);
  });
});

describe("loadWeightLog", () => {
  it("reads back nothing on a device that has never logged", async () => {
    expect(await loadWeightLog(repository)).toEqual([]);
  });

  it("puts the most recent day first", async () => {
    // The opposite of `WeightRepository.list()`, which is ascending because the
    // chart is. A list is read from the day you just weighed yourself.
    for (const date of ["2026-08-17", "2026-08-19", "2026-08-18"]) {
      await saveWeightEntry(repository, { date, weightKg: 82 }, NOW);
    }

    expect((await loadWeightLog(repository)).map((entry) => entry.date)).toEqual([
      "2026-08-19",
      "2026-08-18",
      "2026-08-17",
    ]);
  });

  it("orders by the day weighed, not the day typed", async () => {
    // Backfilling writes an old date at a new instant; sorting by
    // `recordedAt` would file last month's weigh-in above this morning's.
    await saveWeightEntry(repository, { date: "2026-08-19", weightKg: 82 }, NOW);
    await saveWeightEntry(
      repository,
      { date: "2026-07-01", weightKg: 85 },
      "2026-08-19T23:00:00.000Z",
    );

    expect((await loadWeightLog(repository))[0]?.date).toBe("2026-08-19");
  });
});

describe("entryOn", () => {
  it("finds the day that is already filed", async () => {
    await saveWeightEntry(repository, { date: "2026-08-18", weightKg: 83 }, NOW);
    const entries = await loadWeightLog(repository);

    expect(entryOn(entries, "2026-08-18")?.weightKg).toBe(83);
  });

  it("finds nothing on a day nobody logged", async () => {
    await saveWeightEntry(repository, { date: "2026-08-18", weightKg: 83 }, NOW);
    const entries = await loadWeightLog(repository);

    expect(entryOn(entries, "2026-08-19")).toBeUndefined();
  });
});

describe("removeWeightEntry", () => {
  it("deletes the entry and leaves the rest", async () => {
    const { entry } = await saveWeightEntry(
      repository,
      { date: "2026-08-18", weightKg: 83 },
      NOW,
    );
    await saveWeightEntry(repository, { date: "2026-08-19", weightKg: 82.4 }, NOW);

    await removeWeightEntry(repository, entry.id);

    expect((await loadWeightLog(repository)).map((row) => row.date)).toEqual([
      "2026-08-19",
    ]);
  });

  it("frees the day up to be logged again", async () => {
    // The unique index on `date` is what makes this worth asserting: a delete
    // that left the row behind would turn the next save into a ConstraintError.
    const { entry } = await saveWeightEntry(
      repository,
      { date: "2026-08-18", weightKg: 83 },
      NOW,
    );
    await removeWeightEntry(repository, entry.id);

    const again = await saveWeightEntry(
      repository,
      { date: "2026-08-18", weightKg: 84 },
      NOW,
    );

    expect(again.replaced).toBe(false);
    expect((await repository.weight.getByDate("2026-08-18"))?.weightKg).toBe(84);
  });
});
