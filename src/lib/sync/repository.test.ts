import { beforeEach, describe, expect, it } from "vitest";

import { createMemoryRepository } from "@/lib/storage/memory";
import { DEFAULT_SETTINGS } from "@/lib/storage/shared";
import type {
  Diet,
  Snapshot,
  TrainingSession,
  WeightEntry,
} from "@/lib/storage/types";
import { SNAPSHOT_SCHEMA_VERSION } from "@/lib/storage/types";

import { createMemoryJournal } from "./journal";
import type { Journal } from "./journal";
import { createSyncRepository } from "./repository";
import type { SyncRepository } from "./repository";
import { generateDataKey } from "./sealed";
import { createMemoryTransport } from "./transport.fixture";
import type { MemoryTransport } from "./transport.fixture";
import type { SyncTransport } from "./transport";
import { PUSH_LIMIT } from "./transport";

/**
 * Two devices, one account, one server (#95).
 *
 * Every test in this file is the same shape as the situation it is about:
 * two independent repositories that share nothing except a transport they both
 * push to, and a key the transport does not have. Nothing here reaches into the
 * decorator — the assertions are all about what a person would see on the other
 * phone.
 */

interface Device {
  readonly repository: SyncRepository;
  readonly journal: Journal;
}

interface Account {
  readonly transport: MemoryTransport;
  readonly a: Device;
  readonly b: Device;
  /** A third device, signed in later, that has never synced before. */
  fresh(): Device;
}

async function account(pageLimit?: number): Promise<Account> {
  const transport = createMemoryTransport({ pageLimit });
  const dataKey = await generateDataKey();

  let tick = 0;
  const device = (deviceId: string): Device => {
    const journal = createMemoryJournal();
    return {
      journal,
      repository: createSyncRepository({
        inner: createMemoryRepository(),
        journal,
        transport,
        dataKey,
        deviceId,
        // A shared, strictly increasing clock: two devices never disagree about
        // what happened first for a reason unrelated to what is under test.
        now: () => new Date(Date.UTC(2026, 3, 1, 0, 0, ++tick)).toISOString(),
      }),
    };
  };

  let fresh = 0;
  return {
    transport,
    a: device("device-a"),
    b: device("device-b"),
    fresh: () => device(`device-fresh-${++fresh}`),
  };
}

/** Everything a device holds, minus the one field that is a clock reading. */
async function state(device: Device): Promise<Omit<Snapshot, "exportedAt">> {
  const { exportedAt: _exportedAt, ...rest } =
    await device.repository.exportAll();
  return rest;
}

function makeDiet(overrides: Partial<Diet> = {}): Diet {
  return {
    id: "diet-1",
    name: "Cutting",
    targets: { kcal: 2200, proteinG: 180, carbG: 200, fatG: 60 },
    meals: [],
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z",
    ...overrides,
  };
}

function makeWeight(overrides: Partial<WeightEntry> = {}): WeightEntry {
  return {
    id: "weight-1",
    date: "2026-03-02",
    weightKg: 81.4,
    recordedAt: "2026-03-02T07:15:00.000Z",
    ...overrides,
  };
}

function makeSession(
  overrides: Partial<TrainingSession> = {},
): TrainingSession {
  return {
    id: "session-1",
    date: "2026-03-07",
    splitSlug: "push-pull-legs",
    dayIndex: 0,
    dayName: "A",
    exercises: [],
    startedAt: "2026-03-07T18:00:00.000Z",
    finishedAt: "2026-03-07T19:02:00.000Z",
    ...overrides,
  };
}

describe("syncing two devices", () => {
  let shared: Account;

  beforeEach(async () => {
    shared = await account();
  });

  it("carries a record from one device to the other", async () => {
    await shared.a.repository.diets.put(makeDiet());
    await shared.a.repository.sync();
    await shared.b.repository.sync();

    expect(await shared.b.repository.diets.list()).toEqual([makeDiet()]);
  });

  it("settles, so a second sync has nothing to do", async () => {
    await shared.a.repository.diets.put(makeDiet());
    await shared.a.repository.sync();
    await shared.b.repository.sync();

    // The echo test. A device that pushed a record and then pulls it back has
    // to recognise its own write, or every sync would re-apply and re-push it
    // forever.
    expect(await shared.a.repository.sync()).toEqual({
      pushed: 0,
      applied: 0,
      skipped: 0,
    });
    expect(await shared.b.repository.sync()).toEqual({
      pushed: 0,
      applied: 0,
      skipped: 0,
    });
  });

  it("keeps both changes when the two devices changed different things", async () => {
    await shared.a.repository.diets.put(makeDiet());
    await shared.a.repository.sync();
    await shared.b.repository.sync();

    // Now they diverge: A finishes a session while B renames the plan.
    await shared.a.repository.trainingSessions.put(makeSession());
    await shared.b.repository.diets.put(
      makeDiet({ name: "Bulking", updatedAt: "2026-03-04T10:00:00.000Z" }),
    );

    await shared.a.repository.sync();
    await shared.b.repository.sync();
    await shared.a.repository.sync();

    expect(await state(shared.a)).toEqual(await state(shared.b));
    expect(await shared.a.repository.diets.list()).toEqual([
      makeDiet({ name: "Bulking", updatedAt: "2026-03-04T10:00:00.000Z" }),
    ]);
    expect(await shared.b.repository.trainingSessions.list()).toEqual([
      makeSession(),
    ]);
  });

  it("gives the same record to the later write, whichever device asks first", async () => {
    await shared.a.repository.diets.put(makeDiet());
    await shared.a.repository.sync();
    await shared.b.repository.sync();

    // Both edit the same plan. B's edit is older, and B pushes first — so the
    // server briefly holds the version that is going to lose.
    await shared.a.repository.diets.put(
      makeDiet({ name: "A wins", updatedAt: "2026-03-09T10:00:00.000Z" }),
    );
    await shared.b.repository.diets.put(
      makeDiet({ name: "B loses", updatedAt: "2026-03-08T10:00:00.000Z" }),
    );

    await shared.b.repository.sync();
    await shared.a.repository.sync();
    await shared.b.repository.sync();

    const winner = makeDiet({
      name: "A wins",
      updatedAt: "2026-03-09T10:00:00.000Z",
    });
    expect(await shared.a.repository.diets.list()).toEqual([winner]);
    expect(await shared.b.repository.diets.list()).toEqual([winner]);
  });

  it("does not resurrect a record the other device deleted", async () => {
    await shared.a.repository.diets.put(makeDiet());
    await shared.a.repository.sync();
    await shared.b.repository.sync();
    expect(await shared.b.repository.diets.list()).toHaveLength(1);

    await shared.a.repository.diets.remove("diet-1");
    await shared.a.repository.sync();
    await shared.b.repository.sync();

    expect(await shared.b.repository.diets.list()).toEqual([]);

    // The part a tombstone exists for: B, which still remembered the plan a
    // moment ago, must not push it back on the next round.
    await shared.b.repository.sync();
    await shared.a.repository.sync();
    expect(await shared.a.repository.diets.list()).toEqual([]);
    expect(await shared.b.repository.diets.list()).toEqual([]);
  });

  it("carries the day-collision delete that weight.put does silently", async () => {
    await shared.a.repository.weight.put(makeWeight());
    await shared.a.repository.sync();
    await shared.b.repository.sync();
    expect(await shared.b.repository.weight.list()).toEqual([makeWeight()]);

    // Re-logging the same day writes a *different* id and drops the old row.
    // Locally that is the one-weight-per-day rule; across devices it is a
    // delete that nobody typed, and it still has to travel.
    const corrected = makeWeight({
      id: "weight-2",
      weightKg: 80.9,
      recordedAt: "2026-03-02T20:00:00.000Z",
    });
    await shared.a.repository.weight.put(corrected);

    await shared.a.repository.sync();

    // The delete reaches the server on the same sync that caused it. Leaving it
    // to the other device to re-derive the collision would mean the displaced
    // row sits there live, and a device restoring from scratch would pull it.
    expect(
      shared.transport.rows().find((row) => row.recordId === "weight-1")
        ?.deleted,
    ).toBe(true);

    await shared.b.repository.sync();
    await shared.a.repository.sync();

    expect(await shared.b.repository.weight.list()).toEqual([corrected]);
    expect(await shared.a.repository.weight.list()).toEqual([corrected]);
  });

  it("propagates a restore as a replacement, not as a merge", async () => {
    await shared.a.repository.diets.put(makeDiet());
    await shared.a.repository.weight.put(makeWeight());
    await shared.a.repository.sync();
    await shared.b.repository.sync();

    const restored: Snapshot = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      exportedAt: "2026-03-10T00:00:00.000Z",
      weight: [],
      diets: [makeDiet({ id: "diet-2", name: "From a backup" })],
      customFoods: [],
      substitutionGroups: [],
      settings: { ...DEFAULT_SETTINGS },
    };
    await shared.a.repository.importAll(restored);

    await shared.a.repository.sync();
    await shared.b.repository.sync();

    // The weight and the old plan are gone on B too. A restore that only sent
    // what it wrote would have B push both of them straight back.
    expect(await shared.b.repository.weight.list()).toEqual([]);
    expect(await shared.b.repository.diets.list()).toEqual([
      makeDiet({ id: "diet-2", name: "From a backup" }),
    ]);
  });

  it("propagates erasing everything", async () => {
    await shared.a.repository.diets.put(makeDiet());
    await shared.a.repository.weight.put(makeWeight());
    await shared.a.repository.trainingSessions.put(makeSession());
    await shared.a.repository.sync();
    await shared.b.repository.sync();

    await shared.a.repository.clearAll();
    await shared.a.repository.sync();
    await shared.b.repository.sync();

    expect(await shared.b.repository.diets.list()).toEqual([]);
    expect(await shared.b.repository.weight.list()).toEqual([]);
    expect(await shared.b.repository.trainingSessions.list()).toEqual([]);
  });
});

describe("what the server ends up holding", () => {
  it("is bytes, and nothing else", async () => {
    const shared = await account();

    await shared.a.repository.diets.put(
      makeDiet({ name: "Cutting de janeiro" }),
    );
    await shared.a.repository.weight.put(makeWeight({ note: "após o almoço" }));
    await shared.a.repository.trainingSessions.put(makeSession());
    await shared.a.repository.sync();

    const rows = shared.transport.rows();
    expect(rows.length).toBeGreaterThan(0);

    const wire = JSON.stringify(rows);
    // Asserted against the real stored rows, not against a hand-built one:
    // this is the sentence the privacy notice makes, checked on output.
    for (const secret of [
      "Cutting de janeiro",
      "após o almoço",
      "81.4",
      "push-pull-legs",
      "2026-03-02",
    ]) {
      expect(wire).not.toContain(secret);
    }

    for (const row of rows) {
      // The collection and the record id *are* on the row, and are the one
      // thing the server does learn: it has to address a row somehow. They are
      // ids and category names, never content.
      expect(Object.keys(row).sort()).toEqual([
        "ciphertext",
        "collection",
        "deleted",
        "nonce",
        "recordId",
        "rev",
        "updatedAt",
      ]);
    }
  });
});

describe("a pull that starts from further back than it had to", () => {
  it("converges to the same state as a device that followed along", async () => {
    const shared = await account();

    await shared.a.repository.diets.put(makeDiet());
    await shared.a.repository.weight.put(makeWeight());
    await shared.a.repository.trainingSessions.put(makeSession());
    await shared.a.repository.sync();

    await shared.b.repository.sync();
    await shared.a.repository.diets.put(
      makeDiet({ name: "Renamed", updatedAt: "2026-03-11T10:00:00.000Z" }),
    );
    await shared.a.repository.diets.remove("diet-1");
    await shared.a.repository.sync();
    await shared.b.repository.sync();

    // A device that has never synced at all pulls the whole history, tombstones
    // included, and must land exactly where B did.
    const late = shared.fresh();
    await late.repository.sync();

    expect(await state(late)).toEqual(await state(shared.b));
  });

  it("recognises its own writes when it re-reads its own history", async () => {
    const shared = await account();

    await shared.a.repository.diets.put(makeDiet());
    await shared.a.repository.weight.put(makeWeight());
    await shared.a.repository.sync();

    // The cursor is the only reason a device does not normally see its own rows
    // come back at all. Take it away and it sees every one of them, and has to
    // recognise the revisions it already agreed to — otherwise losing a cursor
    // would re-apply the whole account, and for weight would re-derive a day
    // collision that was already settled.
    await shared.a.journal.setCursor(null);

    expect(await shared.a.repository.sync()).toEqual({
      pushed: 0,
      applied: 0,
      skipped: 2,
    });
  });

  it("converges when a device throws its cursor away mid-history", async () => {
    const shared = await account();

    await shared.a.repository.diets.put(makeDiet());
    await shared.a.repository.sync();
    await shared.b.repository.sync();

    await shared.a.repository.diets.put(
      makeDiet({ name: "Second", updatedAt: "2026-03-12T10:00:00.000Z" }),
    );
    await shared.a.repository.sync();

    // Losing the cursor is a supported way to be wrong: it costs bandwidth and
    // nothing else. Re-applying rows already applied has to be a no-op.
    await shared.b.journal.setCursor(null);
    await shared.b.repository.sync();

    expect(await state(shared.b)).toEqual(await state(shared.a));
  });

  it("walks every page when one pull cannot carry them all", async () => {
    const shared = await account(3);

    for (let index = 0; index < 12; index += 1) {
      await shared.a.repository.diets.put(
        makeDiet({ id: `diet-${index}`, name: `Plano ${index}` }),
      );
    }
    await shared.a.repository.sync();

    // Every row above was written in one push, so they all share a timestamp —
    // which is exactly the case a cursor made only of a clock would either skip
    // or loop on. Four pages of three, and B has to end up with all twelve.
    const first = await shared.transport.pull(null);
    expect(first.rows).toHaveLength(3);
    expect(first.more).toBe(true);

    await shared.b.repository.sync();
    expect(await shared.b.repository.diets.list()).toHaveLength(12);

    const late = shared.fresh();
    await late.repository.sync();
    expect(await late.repository.diets.list()).toHaveLength(12);
  });
});

describe("pushing an account that is bigger than one request", () => {
  it("sends it in batches, and journals each one before the next", async () => {
    const server = createMemoryTransport();
    const batches: number[] = [];

    // The one thing the memory transport cannot show on its own: how many
    // requests it took. A first sync carries the whole account, and the route
    // refuses a body with more than PUSH_LIMIT rows in it (endpoint.ts) — so a
    // device that sent them all at once would fail on exactly the sync that
    // matters most, the one that restores a phone.
    const transport: SyncTransport = {
      push(rows) {
        batches.push(rows.length);
        return server.push(rows);
      },
      pull: (cursor, limit) => server.pull(cursor, limit),
    };

    const dataKey = await generateDataKey();
    const journal = createMemoryJournal();
    const repository = createSyncRepository({
      inner: createMemoryRepository(),
      journal,
      transport,
      dataKey,
      deviceId: "device-a",
    });

    const count = PUSH_LIMIT + 5;
    for (let index = 0; index < count; index += 1) {
      await repository.diets.put(makeDiet({ id: `diet-${index}` }));
    }

    expect(await repository.sync()).toMatchObject({ pushed: count });
    expect(batches).toEqual([PUSH_LIMIT, 5]);
    expect(server.rows()).toHaveLength(count);

    // And nothing is left dirty, which is what makes the second sync empty
    // rather than a repeat of the first.
    expect(await journal.pending()).toEqual([]);
  });
});
