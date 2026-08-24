import { describe, expect, it } from "vitest";

import type { LoggedSet, TrainingSession } from "@/lib/storage/types";

import {
  LOAD_STEP_KG,
  STALL_LIMIT,
  nextPrescription,
  performances,
  type Card,
} from "./progression";

const SLUG = "supino-reto-barra";

/** Three sets of eight to twelve, the ordinary shape of a `SplitItem`. */
function card(overrides: Partial<Card> = {}): Card {
  return { sets: 3, reps: [8, 12], repStep: 1, ...overrides };
}

/** `count` identical sets. A load of `undefined` means nothing on the bar. */
function sets(count: number, reps: number, loadKg?: number): LoggedSet[] {
  return Array.from({ length: count }, () => ({
    reps,
    ...(loadKg === undefined ? {} : { loadKg }),
  }));
}

/**
 * A history of this one movement, written *oldest first* — the order the
 * sessions happened in, which is the order a stall is easiest to read in. What
 * comes back is deliberately not the order the repository promises, so every
 * test here also leans on the sort.
 */
function history(...done: LoggedSet[][]): TrainingSession[] {
  return done.map((logged, index) => ({
    id: `s${index}`,
    date: "2026-08-01",
    splitSlug: "abc-3x",
    dayIndex: 0,
    dayName: "A · Peito, ombros e tríceps",
    exercises: [{ exercise: SLUG, sets: logged }],
    startedAt: `2026-08-0${index + 1}T22:00:00.000Z`,
    finishedAt: `2026-08-0${index + 1}T23:00:00.000Z`,
  }));
}

describe("nextPrescription · nothing to go on", () => {
  it("starts at the bottom of the range, with nothing on the bar", () => {
    const next = nextPrescription([], SLUG, card());

    expect(next.reps).toBe(8);
    expect(next.reason).toEqual({ kind: "first" });
  });

  it("leaves the load out rather than calling it zero", () => {
    const next = nextPrescription([], SLUG, card());

    expect("loadKg" in next).toBe(false);
  });

  it("says the same for a movement the history has never seen", () => {
    const next = nextPrescription(history(sets(3, 12, 60)), "agachamento-livre", card());

    expect(next.reason).toEqual({ kind: "first" });
    expect(next.reps).toBe(8);
  });
});

describe("nextPrescription · climbing the range", () => {
  it("adds a rep when every set cleared the range but not its top", () => {
    const next = nextPrescription(history(sets(3, 9, 60)), SLUG, card());

    expect(next).toEqual({ reps: 10, loadKg: 60, reason: { kind: "addReps" } });
  });

  it("asks for the weakest set plus one, not the best set plus one", () => {
    // Twelve, twelve, nine is not a session of twelves: the next thing to do is
    // ten in all three, and claiming thirteen would be reading the good set and
    // ignoring the honest one.
    const next = nextPrescription(
      history([
        { reps: 12, loadKg: 60 },
        { reps: 12, loadKg: 60 },
        { reps: 9, loadKg: 60 },
      ]),
      SLUG,
      card(),
    );

    expect(next.reps).toBe(10);
    expect(next.reason).toEqual({ kind: "addReps" });
  });

  it("never asks for more than the top of the range", () => {
    const next = nextPrescription(history(sets(3, 11, 60)), SLUG, card({ repStep: 4 }));

    expect(next.reps).toBe(12);
  });

  it("moves a one-sided movement two at a time, so both sides go up", () => {
    // The card is ten to twelve per arm; everything here is the total.
    const next = nextPrescription(
      history(sets(3, 20, 14)),
      SLUG,
      card({ reps: [20, 24], repStep: 2 }),
    );

    expect(next.reps).toBe(22);
  });
});

describe("nextPrescription · adding load", () => {
  it("adds a pair of plates once every set closes the top of the range", () => {
    const next = nextPrescription(history(sets(3, 12, 60)), SLUG, card());

    expect(next).toEqual({
      reps: 8,
      loadKg: 62.5,
      reason: { kind: "addLoad", reps: 12 },
    });
  });

  it("drops back to the bottom of the range, which is double progression", () => {
    const next = nextPrescription(history(sets(3, 12, 60)), SLUG, card());

    expect(next.reps).toBe(8);
    expect(next.reps).not.toBe(12);
  });

  it("counts a set past the top of the range as closing it", () => {
    const next = nextPrescription(history(sets(3, 14, 60)), SLUG, card());

    expect(next.loadKg).toBe(62.5);
  });

  it("lands on the plate grid when the load came from somewhere else", () => {
    // Seven kilos is a dumbbell from another app's export. Nine and a half is
    // not a thing anybody can pick up, so it rounds to ten.
    const next = nextPrescription(history(sets(3, 12, 7)), SLUG, card());

    expect(next.loadKg).toBe(10);
  });
});

describe("nextPrescription · reading a session honestly", () => {
  it("holds when a set came in under the range", () => {
    const next = nextPrescription(
      history([
        { reps: 12, loadKg: 60 },
        { reps: 10, loadKg: 60 },
        { reps: 6, loadKg: 60 },
      ]),
      SLUG,
      card(),
    );

    expect(next).toEqual({ reps: 12, loadKg: 60, reason: { kind: "hold" } });
  });

  it("holds when fewer sets were done than the card asked for", () => {
    const next = nextPrescription(history(sets(2, 12, 60)), SLUG, card());

    expect(next.reason).toEqual({ kind: "hold" });
    expect(next.loadKg).toBe(60);
  });

  it("holds when the weight came off for the last set", () => {
    // Sixty, sixty, fifty-five is not three sets of fifty-five, and reading it
    // as one would offer to add weight to a session that fell apart.
    const next = nextPrescription(
      history([
        { reps: 12, loadKg: 60 },
        { reps: 12, loadKg: 60 },
        { reps: 12, loadKg: 55 },
      ]),
      SLUG,
      card(),
    );

    expect(next).toEqual({ reps: 12, loadKg: 60, reason: { kind: "hold" } });
  });

  it("keeps the target inside the range when the best set overshot it", () => {
    const next = nextPrescription(
      history([
        { reps: 15, loadKg: 60 },
        { reps: 4, loadKg: 60 },
      ]),
      SLUG,
      card(),
    );

    expect(next.reps).toBe(12);
  });

  it("keeps the target inside the range when nothing came near it", () => {
    const next = nextPrescription(history(sets(3, 5, 60)), SLUG, card());

    expect(next.reps).toBe(8);
    expect(next.reason).toEqual({ kind: "hold" });
  });

  it("ignores a session where the movement was on the card and not done", () => {
    const skipped = history(sets(3, 9, 60), []);

    expect(nextPrescription(skipped, SLUG, card()).loadKg).toBe(60);
    expect(nextPrescription(skipped, SLUG, card()).reason).toEqual({
      kind: "addReps",
    });
  });

  it("reads the most recent session, whatever order it is handed them in", () => {
    const [older, newer] = history(sets(3, 12, 50), sets(3, 9, 60));

    expect(nextPrescription([newer!, older!], SLUG, card()).loadKg).toBe(60);
    expect(nextPrescription([older!, newer!], SLUG, card()).loadKg).toBe(60);
  });
});

describe("nextPrescription · stalls and deloads", () => {
  const missed = sets(3, 6, 60);

  it("holds for a bad session, and for a second one", () => {
    expect(nextPrescription(history(missed), SLUG, card()).reason).toEqual({
      kind: "hold",
    });
    expect(nextPrescription(history(missed, missed), SLUG, card()).reason).toEqual({
      kind: "hold",
    });
  });

  it("backs the load off after three in a row, and says how many", () => {
    const next = nextPrescription(history(missed, missed, missed), SLUG, card());

    expect(next).toEqual({
      reps: 8,
      loadKg: 52.5,
      reason: { kind: "deload", sessions: 3 },
    });
  });

  it("takes a real step off, not a rounding that lands back where it was", () => {
    // A tenth off five kilos is four and a half, which rounds to five: a deload
    // that deloads nothing. It has to come off the grid downwards instead.
    const light = sets(3, 6, 5);
    const next = nextPrescription(history(light, light, light), SLUG, card());

    expect(next.loadKg).toBe(2.5);
    expect(next.reason).toEqual({ kind: "deload", sessions: 3 });
  });

  it("holds instead when there is no lighter load to go to", () => {
    const lightest = sets(3, 6, LOAD_STEP_KG);
    const next = nextPrescription(
      history(lightest, lightest, lightest),
      SLUG,
      card(),
    );

    expect(next).toEqual({ reps: 8, loadKg: 2.5, reason: { kind: "hold" } });
  });

  it("starts the count again after a session that went well", () => {
    const next = nextPrescription(
      history(missed, sets(3, 9, 60), missed, missed),
      SLUG,
      card(),
    );

    expect(next.reason).toEqual({ kind: "hold" });
  });

  it("does not count misses made at a load that has since changed", () => {
    // This is what stops a deload firing again on the very next session: the
    // three misses that caused it were at sixty, and today's work is at
    // fifty-two and a half, so the count is one and starts from here.
    const next = nextPrescription(
      history(missed, missed, missed, sets(3, 6, 52.5)),
      SLUG,
      card(),
    );

    expect(next).toEqual({ reps: 8, loadKg: 52.5, reason: { kind: "hold" } });
  });

  it("needs the misses to be consecutive up to now", () => {
    expect(STALL_LIMIT).toBe(3);

    const next = nextPrescription(
      history(missed, missed, missed, sets(3, 9, 60)),
      SLUG,
      card(),
    );

    expect(next.reason).toEqual({ kind: "addReps" });
  });
});

describe("nextPrescription · nothing to add weight to", () => {
  it("progresses in reps when no load was logged", () => {
    const next = nextPrescription(history(sets(3, 9)), SLUG, card());

    expect(next.reps).toBe(10);
    expect(next.reason).toEqual({ kind: "addReps" });
    expect("loadKg" in next).toBe(false);
  });

  it("stops asking for one more rep at the top of the range", () => {
    // A fortieth push-up is not a training prescription. Past here the honest
    // answer is a belt or a harder variation, and the app says so.
    const next = nextPrescription(history(sets(3, 12)), SLUG, card());

    expect(next).toEqual({ reps: 12, reason: { kind: "ceiling" } });
  });

  it("never backs off a load that is not there", () => {
    const missed = sets(3, 6);
    const next = nextPrescription(history(missed, missed, missed), SLUG, card());

    expect(next.reason).toEqual({ kind: "hold" });
    expect("loadKg" in next).toBe(false);
  });

  it("progresses the load once somebody put a belt on", () => {
    // The trigger is what was logged, not what the catalog says the equipment
    // is: a dip with ten kilos hanging off it has a load to add to.
    const next = nextPrescription(history(sets(3, 12, 10)), SLUG, card());

    expect(next).toEqual({
      reps: 8,
      loadKg: 12.5,
      reason: { kind: "addLoad", reps: 12 },
    });
  });
});

describe("performances", () => {
  it("gives back every session of the movement, newest first", () => {
    expect(performances(history(sets(1, 5, 55), sets(1, 8, 60)), SLUG)).toEqual([
      [{ reps: 8, loadKg: 60 }],
      [{ reps: 5, loadKg: 55 }],
    ]);
  });

  it("sorts rather than trusting the order it is handed", () => {
    const [older, newer] = history(sets(1, 5, 55), sets(1, 8, 60));

    expect(performances([older!, newer!], SLUG)[0]).toEqual([
      { reps: 8, loadKg: 60 },
    ]);
  });

  it("drops a session where the movement was on the card and not done", () => {
    expect(performances(history(sets(1, 8, 60), []), SLUG)).toEqual([
      [{ reps: 8, loadKg: 60 }],
    ]);
  });

  it("gives nothing back for a movement never done", () => {
    expect(performances(history(sets(1, 8, 60)), "agachamento-livre")).toEqual([]);
  });

  it("gives nothing back with no history at all", () => {
    expect(performances([], SLUG)).toEqual([]);
  });

  it("does not hand out a load of zero", () => {
    const zeroed = history([{ reps: 8, loadKg: 0 }]);

    expect(performances(zeroed, SLUG)[0]![0]).toEqual({ reps: 8 });
  });
});
