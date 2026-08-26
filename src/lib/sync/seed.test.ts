import { describe, expect, it } from "vitest";

import { createMemoryRepository } from "@/lib/storage/memory";
import type { IsoDate, IsoTimestamp } from "@/lib/storage/types";

import { createMemoryJournal } from "./journal";
import { createSyncRepository } from "./repository";
import { generateDataKey } from "./sealed";
import { seedJournal } from "./seed";
import { createMemoryTransport } from "./transport.fixture";

/**
 * The records that were already there when sync was turned on (#96).
 *
 * The decorator journals writes as they happen, so on its own it would push an
 * empty account for anybody who used the app before today. This is the catch-up
 * pass, and the last test is the one that matters: seed, sync, and see a year
 * of weights arrive on the server.
 */

const KEY = await generateDataKey();

function weight(id: string, date: string, recordedAt: string) {
  return {
    id,
    date: date as IsoDate,
    weightKg: 72.4,
    recordedAt: recordedAt as IsoTimestamp,
  };
}

async function filled() {
  const repository = createMemoryRepository();

  await repository.weight.put(
    weight("w-1", "2026-01-02", "2026-01-02T07:00:00.000Z"),
  );
  await repository.weight.put(
    weight("w-2", "2026-01-03", "2026-01-03T07:00:00.000Z"),
  );
  await repository.profile.save({
    heightCm: 180,
    birthDate: "1990-05-05" as IsoDate,
    sex: "male",
    activityFactor: 1.5,
    updatedAt: "2026-01-01T09:00:00.000Z" as IsoTimestamp,
  });

  return repository;
}

const now = () => "2026-08-20T10:00:00.000Z" as IsoTimestamp;

describe("seeding the journal", () => {
  it("marks everything already on the device as needing a push", async () => {
    const repository = await filled();
    const journal = createMemoryJournal();

    // Two weights, a profile, and the settings singleton — which always exists,
    // because an unset settings store reads back as the defaults.
    const { seeded } = await seedJournal(repository, journal, now);
    expect(seeded).toBe(4);

    const pending = await journal.pending();
    expect(
      pending.map((entry) => `${entry.collection}/${entry.recordId}`).sort(),
    ).toEqual([
      "profile/singleton",
      "settings/singleton",
      "weight/w-1",
      "weight/w-2",
    ]);
    expect(pending.every((entry) => !entry.deleted)).toBe(true);
  });

  it("claims no revision it has not been given", async () => {
    const journal = createMemoryJournal();
    await seedJournal(await filled(), journal, now);

    // `rev: 0` is "the server has never seen this". Seeding with anything else
    // would be this device asserting agreement that never happened, and the
    // first push would be rejected as a conflict against a revision the server
    // has no record of.
    expect((await journal.pending()).every((entry) => entry.rev === 0)).toBe(
      true,
    );
  });

  it("dates each record by the record, not by today", async () => {
    const journal = createMemoryJournal();
    await seedJournal(await filled(), journal, now);

    // Somebody with a year of weights did not write them all this morning. The
    // merge settles ties on this timestamp, and today's date would beat every
    // genuinely newer record on the other device.
    const entry = await journal.get("weight", "w-1");
    expect(entry?.writtenAt).toBe("2026-01-02T07:00:00.000Z");

    // Settings carry no timestamp of their own (see `recordUpdatedAt`), so the
    // clock stands in — the one record where that is the honest answer.
    expect((await journal.get("settings", "singleton"))?.writtenAt).toBe(
      "2026-08-20T10:00:00.000Z",
    );
  });

  it("leaves alone anything the journal already knows about", async () => {
    const repository = await filled();
    const journal = createMemoryJournal();

    await journal.markSynced(
      "weight",
      "w-1",
      7,
      false,
      "2026-01-02T07:00:00.000Z" as IsoTimestamp,
    );

    // A record that came down from the server is not a local write, and marking
    // it dirty would send back what was just pulled -- as a conflict, since the
    // revision it was pulled at would be gone.
    const { seeded } = await seedJournal(repository, journal, now);
    expect(seeded).toBe(3);

    const entry = await journal.get("weight", "w-1");
    expect(entry).toMatchObject({ dirty: false, rev: 7 });
  });

  it("does nothing the second time", async () => {
    const repository = await filled();
    const journal = createMemoryJournal();

    await seedJournal(repository, journal, now);
    await expect(seedJournal(repository, journal, now)).resolves.toEqual({
      seeded: 0,
    });
  });

  it("puts the records that were already there onto the server", async () => {
    const inner = await filled();
    const journal = createMemoryJournal();
    const transport = createMemoryTransport();

    const repository = createSyncRepository({
      inner,
      journal,
      transport,
      dataKey: KEY,
      deviceId: "device-1",
    });

    // The whole point of the file, end to end: nothing below was written
    // through the decorator, and all of it reaches the server anyway.
    await seedJournal(inner, journal, now);
    const outcome = await repository.sync();

    expect(outcome.pushed).toBe(4);
    expect(await journal.pending()).toEqual([]);
  });
});
