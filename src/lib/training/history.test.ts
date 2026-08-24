import { describe, expect, it } from "vitest";

import type { LoggedSet, TrainingSession } from "@/lib/storage/types";

import {
  ONE_REP_MAX_LIMIT,
  bestSet,
  brokenRecords,
  estimatedOneRepMax,
  loggedMovements,
  movementRecords,
  movementSessions,
  strengthCurve,
  strengthGeometry,
} from "./history";

const SLUG = "supino-reto-barra";
/** One arm at a time: reps are stored doubled and read halved. */
const CURL = "rosca-alternada-halteres";
const PULLUP = "barra-fixa-pronada";

function set(reps: number, loadKg?: number): LoggedSet {
  return { reps, ...(loadKg === undefined ? {} : { loadKg }) };
}

let sequence = 0;

/** A session on a date, with whatever was logged in it. */
function session(
  date: string,
  exercises: Record<string, LoggedSet[]>,
): TrainingSession {
  sequence += 1;

  return {
    id: `s${sequence}`,
    date,
    splitSlug: "abc-3x",
    dayIndex: 0,
    dayName: "A · Peito, ombros e tríceps",
    exercises: Object.entries(exercises).map(([exercise, sets]) => ({
      exercise,
      sets,
    })),
    startedAt: `${date}T22:00:00.000Z`,
    finishedAt: `${date}T23:0${sequence % 10}:00.000Z`,
  };
}

describe("estimatedOneRepMax", () => {
  it("is Epley, in whole kilos", () => {
    // 100 × 10 → 100 × (1 + 10/30) = 133,3, printed as 133. The decimal would
    // be precision the formula does not have.
    expect(estimatedOneRepMax(100, 10)).toBe(133);
    expect(estimatedOneRepMax(60, 5)).toBe(70);
  });

  it("returns a single as itself rather than extrapolating from it", () => {
    // A single is the measurement. Epley would add three and a half percent to
    // it and call the result an estimate, which is exactly backwards.
    expect(estimatedOneRepMax(135, 1)).toBe(135);
  });

  it("stops at twelve reps rather than printing fiction", () => {
    expect(estimatedOneRepMax(100, ONE_REP_MAX_LIMIT)).toBe(140);
    expect(estimatedOneRepMax(100, ONE_REP_MAX_LIMIT + 1)).toBeUndefined();
    expect(estimatedOneRepMax(60, 25)).toBeUndefined();
  });

  it("has nothing to say about a set with no weight in it", () => {
    // A bodyweight set is not a zero-kilo set, and neither is one somebody
    // logged without recording the load.
    expect(estimatedOneRepMax(undefined, 8)).toBeUndefined();
    expect(estimatedOneRepMax(0, 8)).toBeUndefined();
  });

  it("has nothing to say about a set of no reps", () => {
    expect(estimatedOneRepMax(100, 0)).toBeUndefined();
  });
});

describe("bestSet", () => {
  it("is the best set, not the heaviest one", () => {
    // 120 × 3 is more weight; 100 × 10 is more lift. A chart drawn off the
    // heavier bar would show somebody getting worse the week they started
    // training volume.
    const best = bestSet([set(3, 120), set(10, 100)], false);

    expect(best?.loadKg).toBe(100);
    expect(best?.estimateKg).toBe(133);
  });

  it("breaks a tie toward the heavier load", () => {
    // Two equal estimates: the one under more weight is less of a guess.
    const best = bestSet([set(6, 100), set(2, 114)], false);

    expect(best?.loadKg).toBe(114);
  });

  it("skips the sets it cannot estimate rather than skipping the session", () => {
    const best = bestSet([set(20, 60), set(8, 90)], false);

    expect(best?.loadKg).toBe(90);
  });

  it("names nothing when there is nothing to estimate", () => {
    expect(bestSet([set(12), set(10)], false)).toBeUndefined();
    expect(bestSet([], false)).toBeUndefined();
  });

  it("reads a unilateral set per side, and estimates per side", () => {
    // 24 stored reps is 12 per arm, and 15 kg in the hand for 12 is a 21 kg
    // arm — not a 27 kg one, which is what 24 reps would have claimed.
    const best = bestSet([set(24, 15)], true);

    expect(best?.reps).toBe(12);
    expect(best?.estimateKg).toBe(21);
  });

  it("applies the rep limit to the reps a person actually did", () => {
    // 26 stored is 13 per side — past the limit, even though 26 would have
    // been past it too. The number the cap applies to is the one on screen.
    expect(bestSet([set(26, 15)], true)).toBeUndefined();
    expect(bestSet([set(24, 15)], true)?.estimateKg).toBe(21);
  });
});

describe("movementSessions", () => {
  const history = [
    session("2026-08-01", { [SLUG]: [set(10, 80)] }),
    session("2026-08-08", { [SLUG]: [set(10, 85)], [PULLUP]: [set(8)] }),
    session("2026-08-15", { [PULLUP]: [set(9)] }),
  ];

  it("gives back only the sessions that touched the movement, newest first", () => {
    const found = movementSessions(history, SLUG);

    expect(found.map((one) => one.date)).toEqual(["2026-08-08", "2026-08-01"]);
  });

  it("carries the day's name as it read that day", () => {
    // The log keeps its own copy for the same reason it keeps the split slug:
    // a day this build renamed is still the day somebody trained.
    expect(movementSessions(history, SLUG)[0]?.dayName).toContain("A ·");
  });

  it("ignores a movement that was on the card but never logged", () => {
    const skipped = [session("2026-08-20", { [SLUG]: [] })];

    expect(movementSessions(skipped, SLUG)).toEqual([]);
  });
});

describe("strengthCurve", () => {
  it("runs oldest first, because that is the direction time runs", () => {
    const curve = strengthCurve(
      [
        session("2026-08-15", { [SLUG]: [set(10, 90)] }),
        session("2026-08-01", { [SLUG]: [set(10, 80)] }),
      ],
      SLUG,
    );

    expect(curve.map((point) => point.date)).toEqual([
      "2026-08-01",
      "2026-08-15",
    ]);
  });

  it("keeps one point per day, the best of that day", () => {
    // Two sessions on one date would otherwise sit on the same vertical line
    // and read as a drop.
    const curve = strengthCurve(
      [
        session("2026-08-01", { [SLUG]: [set(10, 80)] }),
        session("2026-08-01", { [SLUG]: [set(10, 90)] }),
      ],
      SLUG,
    );

    expect(curve).toHaveLength(1);
    expect(curve[0]?.loadKg).toBe(90);
  });

  it("leaves a gap rather than a zero where nothing can be estimated", () => {
    // A day of burnout sets is a day the formula has nothing to say about.
    // The line joins what is known and the gap is the truth.
    const curve = strengthCurve(
      [
        session("2026-08-01", { [SLUG]: [set(10, 80)] }),
        session("2026-08-08", { [SLUG]: [set(25, 40)] }),
        session("2026-08-15", { [SLUG]: [set(10, 85)] }),
      ],
      SLUG,
    );

    expect(curve.map((point) => point.date)).toEqual([
      "2026-08-01",
      "2026-08-15",
    ]);
  });

  it("has nothing to draw for a movement that carries no load", () => {
    const curve = strengthCurve(
      [
        session("2026-08-01", { [PULLUP]: [set(8)] }),
        session("2026-08-08", { [PULLUP]: [set(9)] }),
      ],
      PULLUP,
    );

    expect(curve).toEqual([]);
  });
});

describe("movementRecords", () => {
  const history = [
    session("2026-08-01", { [SLUG]: [set(10, 80), set(8, 80)] }),
    session("2026-08-08", { [SLUG]: [set(3, 100), set(14, 60)] }),
    session("2026-08-15", { [SLUG]: [set(10, 85)] }),
  ];

  it("names the heaviest set", () => {
    expect(movementRecords(history, SLUG).heaviest).toMatchObject({
      loadKg: 100,
      reps: 3,
      date: "2026-08-08",
    });
  });

  it("names the best estimate, which is a different set", () => {
    // 85 × 10 estimates 113; the 100 kg triple estimates 110. The heaviest bar
    // is not the best lift, which is the whole reason there are three records.
    expect(movementRecords(history, SLUG).bestEstimate).toMatchObject({
      loadKg: 85,
      estimateKg: 113,
      date: "2026-08-15",
    });
  });

  it("names the most reps, and the load they were done at", () => {
    // "14 reps" alone is not a claim anybody can read. The set of fourteen at
    // sixty kilos is.
    expect(movementRecords(history, SLUG).mostReps).toMatchObject({
      reps: 14,
      loadKg: 60,
    });
  });

  it("breaks a rep tie toward the heavier load, however long ago it was", () => {
    // Ten at eighty beats ten at sixty even though the sixty is this week's.
    // The record is the better set, not the more recent one.
    const tied = [
      session("2026-08-01", { [SLUG]: [set(10, 80)] }),
      session("2026-08-08", { [SLUG]: [set(10, 60)] }),
    ];

    expect(movementRecords(tied, SLUG).mostReps?.loadKg).toBe(80);
  });

  it("gives a bodyweight movement the one record it can hold", () => {
    // No load means no heaviest set and nothing to estimate — but a set of
    // twelve pull-ups is still a record, and the screen would be empty
    // without it.
    const records = movementRecords(
      [session("2026-08-01", { [PULLUP]: [set(12)] })],
      PULLUP,
    );

    expect(records.heaviest).toBeUndefined();
    expect(records.bestEstimate).toBeUndefined();
    expect(records.mostReps?.reps).toBe(12);
  });

  it("has nothing to say about a movement that was never logged", () => {
    expect(movementRecords([], SLUG)).toEqual({
      heaviest: undefined,
      bestEstimate: undefined,
      mostReps: undefined,
    });
  });
});

describe("loggedMovements", () => {
  const history = [
    session("2026-08-01", { [SLUG]: [set(10, 80)], [PULLUP]: [set(8)] }),
    session("2026-08-08", { [SLUG]: [set(10, 85)] }),
  ];

  it("lists what was actually trained, most recent first", () => {
    expect(loggedMovements(history).map((one) => one.slug)).toEqual([
      SLUG,
      PULLUP,
    ]);
  });

  it("counts the sessions and remembers when each was last done", () => {
    const [bench] = loggedMovements(history);

    expect(bench?.sessions).toBe(2);
    expect(bench?.lastDate).toBe("2026-08-08");
  });

  it("calls a movement what the gym calls it", () => {
    expect(loggedMovements(history)[0]?.name).toBe("Supino reto com barra");
  });

  it("keeps a movement this build has dropped, under its slug", () => {
    // The log is the record. A session does not stop having happened because
    // the catalog changed.
    const dropped = [session("2026-08-01", { "movimento-extinto": [set(10)] })];

    expect(loggedMovements(dropped)[0]?.name).toBe("movimento-extinto");
  });

  it("ignores a movement that was skipped", () => {
    expect(loggedMovements([session("2026-08-01", { [SLUG]: [] })])).toEqual([]);
  });
});

describe("brokenRecords", () => {
  const first = session("2026-08-01", { [SLUG]: [set(10, 80)] });

  it("says nothing the first time a movement is done", () => {
    // There was no record to beat. Three congratulations for a first attempt
    // is how congratulations stop meaning anything.
    expect(brokenRecords([], first)).toEqual([]);
  });

  it("names what the session beat, and what it was", () => {
    const better = session("2026-08-08", { [SLUG]: [set(10, 85)] });
    const broken = brokenRecords([first], better);

    expect(broken.map((one) => one.kind)).toEqual(["heaviest", "bestEstimate"]);
    expect(broken[0]?.set.loadKg).toBe(85);
    expect(broken[0]?.name).toBe("Supino reto com barra");
  });

  it("does not call equalling a record breaking it", () => {
    const same = session("2026-08-08", { [SLUG]: [set(10, 80)] });

    expect(brokenRecords([first], same)).toEqual([]);
  });

  it("ignores records held by movements this session did not touch", () => {
    const other = session("2026-08-08", { [PULLUP]: [set(20)] });

    expect(brokenRecords([first, session("2026-07-01", { [PULLUP]: [set(8)] })], other))
      .toHaveLength(1);
  });

  it("is unbothered by a session already in the log", () => {
    // Finishing twice — a second tap, a stale tab — must not have somebody
    // beating their own record with the same set.
    const better = session("2026-08-08", { [SLUG]: [set(10, 85)] });

    expect(brokenRecords([first, better], better)).toHaveLength(2);
  });

  it("reads a unilateral record per side", () => {
    const before = session("2026-08-01", { [CURL]: [set(20, 14)] });
    const after = session("2026-08-08", { [CURL]: [set(24, 14)] });
    const broken = brokenRecords([before], after);

    expect(broken.map((one) => one.kind)).toEqual(["bestEstimate", "mostReps"]);
    expect(broken[1]?.set.reps).toBe(12);
  });
});

describe("strengthGeometry", () => {
  const BOX = { width: 300, height: 100, padding: 10 };

  const curve = (history: TrainingSession[]) =>
    strengthGeometry(strengthCurve(history, SLUG), BOX);

  it("draws the load under the estimate, because that is where it is", () => {
    // The dots are what was on the bar and the line is what it implies, so the
    // gap between them is the reps. Drawn the other way round the chart would
    // be claiming somebody lifted more than they did.
    const drawn = curve([
      session("2026-08-01", { [SLUG]: [set(10, 80)] }),
      session("2026-08-15", { [SLUG]: [set(10, 90)] }),
    ]);
    const [load, estimate] = drawn?.samples[0]?.ys ?? [];

    expect(load).toBeGreaterThan(estimate ?? 0);
  });

  it("puts the axis on weights that exist on a rack", () => {
    const drawn = curve([
      session("2026-08-01", { [SLUG]: [set(10, 81)] }),
      session("2026-08-15", { [SLUG]: [set(10, 90)] }),
    ]);

    expect((drawn?.low ?? 0) % 2.5).toBe(0);
    expect((drawn?.high ?? 0) % 2.5).toBe(0);
  });

  it("has nothing to draw from one day", () => {
    expect(curve([session("2026-08-01", { [SLUG]: [set(10, 80)] })])).toBeUndefined();
  });
});
