import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDietKitDatabase } from "@/lib/storage/dexie/db";
import { createDexieRepository } from "@/lib/storage/dexie/repository";
import type { Repository } from "@/lib/storage";

import { fullSnapshot } from "./snapshot.fixture";
import { exportBackup, restoreBackup } from "./store";
import { isBackupDue } from "./reminder";
import { parseSnapshotFile } from "./snapshot";

/**
 * Against the Dexie adapter through `fake-indexeddb`, because the claim worth
 * testing is about a real store: that what comes off the device is what a
 * restore puts back, through the same JSON a browser would carry.
 */
let repository: Repository;
let dispose: () => Promise<void>;

const NOW = "2026-08-20T12:00:00.000Z";

beforeEach(() => {
  const db = createDietKitDatabase(`backup-test-${crypto.randomUUID()}`);
  repository = createDexieRepository(db);
  dispose = async () => {
    db.close();
    await db.delete();
  };
});

afterEach(async () => {
  await dispose();
});

describe("exportBackup", () => {
  it("writes a file that restores onto an empty device", async () => {
    await repository.importAll(fullSnapshot());

    const { text } = await exportBackup(repository, NOW);
    const parse = parseSnapshotFile(text);

    expect(parse.ok).toBe(true);
    if (!parse.ok) return;

    // Through a fresh database, which is the case the whole feature is for: a
    // new phone, nothing in it, one file.
    const other = createDietKitDatabase(`backup-test-${crypto.randomUUID()}`);
    const fresh = createDexieRepository(other);

    await restoreBackup(fresh, parse.snapshot, NOW);
    const restored = await fresh.exportAll();

    expect(restored.weight).toEqual(fullSnapshot().weight);
    expect(restored.diets).toEqual(fullSnapshot().diets);
    expect(restored.customFoods).toEqual(fullSnapshot().customFoods);
    expect(restored.substitutionGroups).toEqual(
      fullSnapshot().substitutionGroups,
    );
    expect(restored.profile).toEqual(fullSnapshot().profile);
    expect(restored.settings.goal).toEqual(fullSnapshot().settings.goal);

    other.close();
    await other.delete();
  });

  it("records that the export happened, so the reminder stops", async () => {
    await repository.importAll(fullSnapshot());
    expect(isBackupDue(await repository.exportAll(), await repository.settings.get(), new Date(NOW))).toBe(
      true,
    );

    await exportBackup(repository, NOW);

    expect(
      isBackupDue(
        await repository.exportAll(),
        await repository.settings.get(),
        new Date(NOW),
      ),
    ).toBe(false);
  });

  it("stamps the file with when it was written", async () => {
    const { snapshot } = await exportBackup(repository, NOW);

    expect(snapshot.exportedAt).toBe(NOW);
  });
});

describe("restoreBackup", () => {
  it("replaces what was there rather than merging into it", async () => {
    await repository.weight.put({
      id: "old",
      date: "2020-01-01",
      weightKg: 99,
      recordedAt: "2020-01-01T00:00:00.000Z",
    });

    await restoreBackup(repository, fullSnapshot(), NOW);
    const after = await repository.exportAll();

    expect(after.weight.map((entry) => entry.date)).toEqual([
      "2026-08-18",
      "2026-08-19",
    ]);
  });

  it("does not ask for a backup of the file just restored from", async () => {
    // The fixture's own `lastBackupAt` is older than its data, so carrying it
    // across would put the prompt on screen the moment the restore finished.
    await restoreBackup(repository, fullSnapshot(), NOW);

    expect(
      isBackupDue(
        await repository.exportAll(),
        await repository.settings.get(),
        new Date(NOW),
      ),
    ).toBe(false);
  });

  it("does not inherit a dismissal from inside the file", async () => {
    // Exported on a day the user had just said "agora não". Carrying that
    // across would silence the prompt for a fortnight measured from a moment
    // that has nothing to do with this device — and the first thing someone
    // does after restoring is start changing things again.
    const file = fullSnapshot();
    file.settings.backupRemindedAt = "2026-08-19T00:00:00.000Z";

    await restoreBackup(repository, file, NOW);

    expect((await repository.settings.get()).backupRemindedAt).toBeUndefined();
  });
});
