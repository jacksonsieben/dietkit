import { afterEach, describe, expect, it } from "vitest";

import type { TrainingSession } from "@/lib/storage/types";

import {
  LOAD_STEP_KG,
  addSet,
  finishedSession,
  hasAnyDone,
  isDone,
  lastPerformance,
  removeSet,
  repStep,
  restClock,
  shownReps,
  startDraft,
  stepLoad,
  stepReps,
  summarise,
  toggleDone,
  updateSet,
  type SessionDraft,
} from "./log";
import type { CurrentSession } from "./rotation";
import { splitBySlug } from "./splits";

const originalTz = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTz;
});

const abc = splitBySlug("abc-3x")!;

/** A · Peito, ombros e tríceps — seven movements, every one bilateral. */
const pushDay = abc.days[0]!;

/**
 * B · Costas e bíceps, which is where the unilateral case lives: the rosca
 * alternada is item five, prescribed three sets of ten to twelve *per arm*.
 */
const pullDay = abc.days[1]!;
const ROSCA = 5;

const session: CurrentSession = { day: pushDay, index: 0, split: abc };

function logged(overrides: Partial<TrainingSession> = {}): TrainingSession {
  return {
    id: "s1",
    date: "2026-08-20",
    splitSlug: "abc-3x",
    dayIndex: 0,
    dayName: "A · Peito, ombros e tríceps",
    exercises: [],
    startedAt: "2026-08-20T22:00:00.000Z",
    finishedAt: "2026-08-20T23:00:00.000Z",
    ...overrides,
  };
}

describe("startDraft", () => {
  it("lays out the card: one entry per movement, the prescribed sets each", () => {
    const draft = startDraft(pushDay);

    expect(draft).toHaveLength(pushDay.items.length);
    expect(draft[0]!.exercise).toBe("supino-reto-barra");
    expect(draft[0]!.sets).toHaveLength(4);
    expect(draft[0]!.restSeconds).toBe(150);
    expect(draft[0]!.targetReps).toEqual([6, 10]);
  });

  it("starts at the bottom of the range with nothing to go on", () => {
    // Not the top. A session pre-filled at twelve and checked off unread would
    // report a session nobody had, and the slice that decides whether the load
    // may go up reads these numbers.
    const draft = startDraft(pushDay);

    expect(draft[0]!.sets.map((set) => set.reps)).toEqual([6, 6, 6, 6]);
  });

  it("leaves the load blank rather than zero", () => {
    const set = startDraft(pushDay)[0]!.sets[0]!;

    expect(set.loadKg).toBeUndefined();
    expect("loadKg" in set).toBe(false);
  });

  it("nothing is checked off before anybody has trained", () => {
    expect(hasAnyDone(startDraft(pushDay))).toBe(false);
  });

  it("doubles the prescription for a movement done one side at a time", () => {
    // The card says ten to twelve per arm; the log stores the total, so the
    // draft opens at twenty and the screen shows ten.
    const rosca = startDraft(pullDay)[ROSCA]!;

    expect(rosca.exercise).toBe("rosca-alternada-halteres");
    expect(rosca.unilateral).toBe(true);
    expect(rosca.sets.map((set) => set.reps)).toEqual([20, 20, 20]);
    expect(shownReps(rosca.sets[0]!.reps, true)).toBe(10);
  });

  it("pre-fills what was lifted the last time the movement was done", () => {
    const draft = startDraft(pushDay, [
      logged({
        exercises: [
          {
            exercise: "supino-reto-barra",
            sets: [
              { reps: 8, loadKg: 60 },
              { reps: 7, loadKg: 60 },
              { reps: 6, loadKg: 62.5 },
              { reps: 6, loadKg: 62.5 },
            ],
          },
        ],
      }),
    ]);

    expect(draft[0]!.sets).toEqual([
      { reps: 8, loadKg: 60 },
      { reps: 7, loadKg: 60 },
      { reps: 6, loadKg: 62.5 },
      { reps: 6, loadKg: 62.5 },
    ]);
  });

  it("carries nothing over into a movement that was not in the history", () => {
    const draft = startDraft(pushDay, [
      logged({
        exercises: [{ exercise: "supino-reto-barra", sets: [{ reps: 8 }] }],
      }),
    ]);

    expect(draft[1]!.sets.map((set) => set.reps)).toEqual([8, 8, 8]);
    expect(draft[1]!.sets[0]!.loadKg).toBeUndefined();
  });

  it("keeps the card's set count when last time had more", () => {
    // How many sets to do today is a prescription this build ships; what was
    // lifted is a measurement. A fifth set last week does not rewrite the card.
    const draft = startDraft(pushDay, [
      logged({
        exercises: [
          {
            exercise: "supino-reto-barra",
            sets: [
              { reps: 8, loadKg: 60 },
              { reps: 8, loadKg: 60 },
              { reps: 8, loadKg: 60 },
              { reps: 8, loadKg: 60 },
              { reps: 5, loadKg: 60 },
            ],
          },
        ],
      }),
    ]);

    expect(draft[0]!.sets).toHaveLength(4);
  });

  it("repeats the last set when last time had fewer", () => {
    const draft = startDraft(pushDay, [
      logged({
        exercises: [
          {
            exercise: "supino-reto-barra",
            sets: [
              { reps: 8, loadKg: 60 },
              { reps: 6, loadKg: 65 },
            ],
          },
        ],
      }),
    ]);

    expect(draft[0]!.sets).toEqual([
      { reps: 8, loadKg: 60 },
      { reps: 6, loadKg: 65 },
      { reps: 6, loadKg: 65 },
      { reps: 6, loadKg: 65 },
    ]);
  });

  it("does not carry a check-off forward", () => {
    const draft = startDraft(pushDay, [
      logged({
        exercises: [
          { exercise: "supino-reto-barra", sets: [{ reps: 8, loadKg: 60 }] },
        ],
      }),
    ]);

    expect(hasAnyDone(draft)).toBe(false);
  });
});

describe("lastPerformance", () => {
  const older = logged({
    id: "old",
    finishedAt: "2026-08-10T23:00:00.000Z",
    exercises: [
      { exercise: "supino-reto-barra", sets: [{ reps: 5, loadKg: 55 }] },
    ],
  });
  const newer = logged({
    id: "new",
    finishedAt: "2026-08-17T23:00:00.000Z",
    exercises: [
      { exercise: "supino-reto-barra", sets: [{ reps: 8, loadKg: 60 }] },
    ],
  });

  it("reads the most recent session that has the movement", () => {
    expect(lastPerformance([newer, older], "supino-reto-barra")).toEqual([
      { reps: 8, loadKg: 60 },
    ]);
  });

  it("sorts rather than trusting the order it is handed", () => {
    // The repository promises newest first. A pure function that silently
    // depends on that promise breaks the first time somebody builds the array.
    expect(lastPerformance([older, newer], "supino-reto-barra")).toEqual([
      { reps: 8, loadKg: 60 },
    ]);
  });

  it("skips a session where the movement was on the card and not done", () => {
    const skipped = logged({
      id: "skipped",
      finishedAt: "2026-08-21T23:00:00.000Z",
      exercises: [{ exercise: "supino-reto-barra", sets: [] }],
    });

    expect(lastPerformance([skipped, newer], "supino-reto-barra")).toEqual([
      { reps: 8, loadKg: 60 },
    ]);
  });

  it("gives nothing back for a movement never done", () => {
    expect(lastPerformance([newer], "agachamento-livre")).toBeUndefined();
  });

  it("gives nothing back with no history at all", () => {
    expect(lastPerformance([], "supino-reto-barra")).toBeUndefined();
  });
});

describe("shownReps and repStep", () => {
  it("halves a unilateral total and leaves a bilateral one alone", () => {
    expect(shownReps(16, true)).toBe(8);
    expect(shownReps(16, false)).toBe(16);
  });

  it("steps a unilateral in twos, so both sides move together", () => {
    expect(repStep(true)).toBe(2);
    expect(repStep(false)).toBe(1);
  });
});

describe("stepReps", () => {
  it("moves one rep at a time on a two-handed movement", () => {
    const draft = stepReps(startDraft(pushDay), 0, 0, 1);

    expect(draft[0]!.sets[0]!.reps).toBe(7);
  });

  it("moves two at a time on a one-sided one, so the screen stays halvable", () => {
    const draft = stepReps(startDraft(pullDay), ROSCA, 0, -1);

    expect(draft[ROSCA]!.sets[0]!.reps).toBe(18);
    expect(shownReps(draft[ROSCA]!.sets[0]!.reps, true)).toBe(9);
  });

  it("stops at one rep, or one per side", () => {
    let draft = startDraft(pushDay);
    for (let tap = 0; tap < 20; tap += 1) draft = stepReps(draft, 0, 0, -1);
    expect(draft[0]!.sets[0]!.reps).toBe(1);

    let sided = startDraft(pullDay);
    for (let tap = 0; tap < 20; tap += 1) sided = stepReps(sided, ROSCA, 0, -1);
    expect(sided[ROSCA]!.sets[0]!.reps).toBe(2);
  });

  it("leaves the other sets and movements alone", () => {
    const before = startDraft(pushDay);
    const after = stepReps(before, 0, 1, 1);

    expect(after[0]!.sets[0]).toBe(before[0]!.sets[0]);
    expect(after[1]).toBe(before[1]);
    expect(before[0]!.sets[1]!.reps).toBe(6);
  });
});

describe("stepLoad", () => {
  it("puts the lightest pair of plates on an empty field", () => {
    const draft = stepLoad(startDraft(pushDay), 0, 0, 1);

    expect(draft[0]!.sets[0]!.loadKg).toBe(LOAD_STEP_KG);
  });

  it("comes back off to blank rather than down to zero", () => {
    // Zero would read as having lifted nothing, which is a claim. Blank is the
    // silence a bodyweight movement — or an unrecorded set — actually means.
    const draft = stepLoad(stepLoad(startDraft(pushDay), 0, 0, 1), 0, 0, -1);
    const set = draft[0]!.sets[0]!;

    expect(set.loadKg).toBeUndefined();
    expect("loadKg" in set).toBe(false);
  });

  it("does not go negative from blank", () => {
    const draft = stepLoad(startDraft(pushDay), 0, 0, -1);

    expect(draft[0]!.sets[0]!.loadKg).toBeUndefined();
  });

  it("moves in plate pairs from whatever was carried over", () => {
    let draft = updateSet(startDraft(pushDay), 0, 0, { loadKg: 60 });
    draft = stepLoad(draft, 0, 0, 1);

    expect(draft[0]!.sets[0]!.loadKg).toBe(62.5);
  });

  it("will put a belt on a bodyweight movement if somebody asks", () => {
    // Barra fixa is `peso-corporal`, and weighted pull-ups exist. The field
    // starts blank; nothing forbids a number going in it.
    const draft = stepLoad(startDraft(pullDay), 0, 0, 1);

    expect(pullDay.items[0]!.exercise).toBe("barra-fixa-pronada");
    expect(draft[0]!.sets[0]!.loadKg).toBe(LOAD_STEP_KG);
  });
});

describe("toggleDone", () => {
  const NOW = "2026-08-24T22:05:00.000Z";

  it("stamps the set with when it was checked off", () => {
    const draft = toggleDone(startDraft(pushDay), 0, 0, NOW);

    expect(draft[0]!.sets[0]!.doneAt).toBe(NOW);
    expect(isDone(draft[0]!.sets[0]!)).toBe(true);
    expect(hasAnyDone(draft)).toBe(true);
  });

  it("takes it back", () => {
    const draft = toggleDone(
      toggleDone(startDraft(pushDay), 0, 0, NOW),
      0,
      0,
      "2026-08-24T22:06:00.000Z",
    );

    expect(isDone(draft[0]!.sets[0]!)).toBe(false);
    expect(hasAnyDone(draft)).toBe(false);
  });
});

describe("addSet and removeSet", () => {
  it("adds a set weighing what the last one did", () => {
    const draft = addSet(
      updateSet(startDraft(pushDay), 0, 3, { loadKg: 65, reps: 5 }),
      0,
    );

    expect(draft[0]!.sets).toHaveLength(5);
    expect(draft[0]!.sets[4]).toEqual({ reps: 5, loadKg: 65 });
  });

  it("does not add it already checked off", () => {
    const draft = addSet(
      toggleDone(startDraft(pushDay), 0, 3, "2026-08-24T22:05:00.000Z"),
      0,
    );

    expect(draft[0]!.sets[4]!.doneAt).toBeUndefined();
  });

  it("falls back to the card when there is no last set to copy", () => {
    let draft = startDraft(pullDay);
    for (let tap = 0; tap < 3; tap += 1) draft = removeSet(draft, ROSCA);
    expect(draft[ROSCA]!.sets).toHaveLength(0);

    draft = addSet(draft, ROSCA);
    expect(draft[ROSCA]!.sets).toEqual([{ reps: 20 }]);
  });

  it("removes the last set and stops at none", () => {
    let draft = removeSet(startDraft(pushDay), 1);
    expect(draft[1]!.sets).toHaveLength(2);

    for (let tap = 0; tap < 5; tap += 1) draft = removeSet(draft, 1);
    expect(draft[1]!.sets).toHaveLength(0);
  });

  it("leaves the other movements alone", () => {
    const before = startDraft(pushDay);

    expect(addSet(before, 0)[1]).toBe(before[1]);
    expect(before[0]!.sets).toHaveLength(4);
  });
});

describe("finishedSession", () => {
  const FINISHED = "2026-08-24T23:30:00.000Z";

  function done(draft: SessionDraft, at: string): SessionDraft {
    return toggleDone(draft, 0, 0, at);
  }

  it("writes only the sets that were checked off", () => {
    let draft = updateSet(startDraft(pushDay), 0, 0, { reps: 8, loadKg: 60 });
    draft = updateSet(draft, 0, 1, { reps: 7, loadKg: 60 });
    draft = done(draft, "2026-08-24T22:40:00.000Z");

    const record = finishedSession(session, draft, "abc", FINISHED);

    expect(record.exercises[0]).toEqual({
      exercise: "supino-reto-barra",
      sets: [{ reps: 8, loadKg: 60 }],
    });
  });

  it("keeps a movement nobody touched, with no sets", () => {
    // "It was on the card and it did not happen" is a fact worth keeping.
    // Dropping it would make a skipped session and a shorter one read the same.
    const draft = done(startDraft(pushDay), "2026-08-24T22:40:00.000Z");
    const record = finishedSession(session, draft, "abc", FINISHED);

    expect(record.exercises).toHaveLength(pushDay.items.length);
    expect(record.exercises[6]).toEqual({
      exercise: "triceps-corda-cabo",
      sets: [],
    });
  });

  it("does not write a doneAt into the record", () => {
    const draft = done(startDraft(pushDay), "2026-08-24T22:40:00.000Z");
    const record = finishedSession(session, draft, "abc", FINISHED);

    expect(record.exercises[0]!.sets[0]).not.toHaveProperty("doneAt");
  });

  it("starts the clock at the first set checked off, not the screen opening", () => {
    // Opening the screen on the sofa is not training. A duration measured from
    // it would say this session took four hours.
    let draft = toggleDone(startDraft(pushDay), 1, 2, "2026-08-24T23:05:00.000Z");
    draft = toggleDone(draft, 0, 0, "2026-08-24T22:40:00.000Z");
    draft = toggleDone(draft, 0, 1, "2026-08-24T22:47:00.000Z");

    const record = finishedSession(session, draft, "abc", FINISHED);

    expect(record.startedAt).toBe("2026-08-24T22:40:00.000Z");
  });

  it("falls back to the finish when nothing was checked off", () => {
    const record = finishedSession(session, startDraft(pushDay), "abc", FINISHED);

    expect(record.startedAt).toBe(FINISHED);
  });

  it("copies the split, the day and its name off the session", () => {
    const record = finishedSession(
      { day: pullDay, index: 1, split: abc },
      startDraft(pullDay),
      "abc",
      FINISHED,
    );

    expect(record.splitSlug).toBe("abc-3x");
    expect(record.dayIndex).toBe(1);
    expect(record.dayName).toBe("B · Costas e bíceps");
  });

  it("files the session under the local calendar day", () => {
    // 23:30 UTC is 20:30 the same evening in São Paulo. The UTC shortcut would
    // file a Monday-night session under Tuesday.
    process.env.TZ = "America/Sao_Paulo";

    expect(
      finishedSession(session, startDraft(pushDay), "abc", FINISHED).date,
    ).toBe("2026-08-24");

    process.env.TZ = "Pacific/Kiritimati";
    expect(
      finishedSession(session, startDraft(pushDay), "abc", FINISHED).date,
    ).toBe("2026-08-25");
  });
});

describe("summarise", () => {
  const record = logged({
    startedAt: "2026-08-24T22:40:00.000Z",
    finishedAt: "2026-08-24T23:35:00.000Z",
    exercises: [
      {
        exercise: "supino-reto-barra",
        sets: [
          { reps: 8, loadKg: 60 },
          { reps: 6, loadKg: 60 },
        ],
      },
      { exercise: "barra-fixa-pronada", sets: [{ reps: 10 }] },
      { exercise: "triceps-corda-cabo", sets: [] },
    ],
  });

  it("counts what was done, not what was on the card", () => {
    expect(summarise(record).exercises).toBe(2);
    expect(summarise(record).sets).toBe(3);
    expect(summarise(record).reps).toBe(24);
  });

  it("adds up the kilograms actually moved", () => {
    expect(summarise(record).volumeKg).toBe(8 * 60 + 6 * 60);
  });

  it("counts a bodyweight session as no volume rather than as a guess", () => {
    const bodyweight = logged({
      exercises: [{ exercise: "barra-fixa-pronada", sets: [{ reps: 10 }] }],
    });

    expect(summarise(bodyweight).volumeKg).toBe(0);
  });

  it("says how long it took", () => {
    expect(summarise(record).durationMinutes).toBe(55);
  });

  it("never says a finished session took no time", () => {
    // "0 min" on a session somebody just finished reads as a broken screen.
    const quick = logged({
      startedAt: "2026-08-24T22:40:00.000Z",
      finishedAt: "2026-08-24T22:40:20.000Z",
    });

    expect(summarise(quick).durationMinutes).toBe(1);
  });
});

describe("restClock", () => {
  it("reads like a gym clock", () => {
    expect(restClock(90)).toBe("1:30");
    expect(restClock(45)).toBe("0:45");
    expect(restClock(120)).toBe("2:00");
    expect(restClock(605)).toBe("10:05");
  });

  it("stops at zero rather than counting into the negative", () => {
    expect(restClock(0)).toBe("0:00");
    expect(restClock(-7)).toBe("0:00");
  });

  it("rounds a part-second up, so the last second is shown as one", () => {
    expect(restClock(0.4)).toBe("0:01");
  });

  it("uses only characters the dot face can light", () => {
    expect(restClock(90)).toMatch(/^[0-9:]+$/);
  });
});
