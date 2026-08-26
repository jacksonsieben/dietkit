import { describe, expect, it } from "vitest";

import { emptySnapshot } from "@/lib/storage/shared";
import { SNAPSHOT_SCHEMA_VERSION, type Snapshot } from "@/lib/storage/types";

import { fullSnapshot, fullSnapshotFile } from "./snapshot.fixture";
import { describeSnapshot, lastChangeAt, parseSnapshotFile } from "./snapshot";

/** The fixture with one corner bent, as text. */
function fileWith(edit: (raw: Record<string, unknown>) => void): string {
  const raw = JSON.parse(fullSnapshotFile()) as Record<string, unknown>;
  edit(raw);
  return JSON.stringify(raw);
}

/** The parse of a file that is expected to be restorable. */
function parsed(text: string) {
  const result = parseSnapshotFile(text);
  if (!result.ok) {
    throw new Error(`expected a restorable file, got ${result.error}`);
  }
  return result;
}

describe("parseSnapshotFile", () => {
  it("restores a file this app wrote, whole", () => {
    const { snapshot, drops } = parsed(fullSnapshotFile());

    expect(drops).toEqual([]);
    // The round trip is the entire promise of the feature: what comes back has
    // to be what went in, field for field, not merely the same shape.
    expect(snapshot).toEqual(fullSnapshot());
  });

  it("refuses anything that is not JSON", () => {
    expect(parseSnapshotFile("data;peso\n2026-08-18;81,7")).toEqual({
      ok: false,
      error: "notJson",
    });
  });

  it("refuses JSON that is not a backup", () => {
    for (const text of ["[]", '"olá"', "42", "null", '{"foo":1}']) {
      expect(parseSnapshotFile(text)).toEqual({
        ok: false,
        error: "notSnapshot",
      });
    }
  });

  it("refuses a section of the wrong type rather than reading past it", () => {
    // An object where an array belongs is not one bad record, it is a file this
    // version does not understand — and restoring it would silently empty the
    // log it was meant to bring back.
    expect(
      parseSnapshotFile(fileWith((raw) => (raw.weight = { "0": {} }))),
    ).toEqual({ ok: false, error: "notSnapshot" });
  });

  it("refuses a backup from a newer version, and says which", () => {
    expect(
      parseSnapshotFile(fileWith((raw) => (raw.schemaVersion = 7))),
    ).toEqual({
      ok: false,
      error: "futureVersion",
      version: 7,
    });
  });

  it("treats absent sections as empty rather than as damage", () => {
    // The oldest backups this can meet are ones written before a section
    // existed. Nothing was lost in them; there was nothing there.
    const { snapshot, drops } = parsed(
      JSON.stringify({
        schemaVersion: 1,
        exportedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    expect(drops).toEqual([]);
    expect(snapshot.weight).toEqual([]);
    expect(snapshot.diets).toEqual([]);
    expect(snapshot.customFoods).toEqual([]);
    expect(snapshot.substitutionGroups).toEqual([]);
    expect(snapshot.settings).toEqual({ locale: "pt-BR" });
  });

  it("keeps the good rows when one is corrupt, and names the one it dropped", () => {
    const { snapshot, drops } = parsed(
      fileWith((raw) => {
        const weight = raw.weight as Record<string, unknown>[];
        weight.push({ id: "w-3", date: "2026-08-20", weightKg: "muito" });
      }),
    );

    // The whole trade this module exists to make: 2 good mornings survive 1 bad
    // one, and the bad one is reported by the day it claimed.
    expect(snapshot.weight).toHaveLength(2);
    expect(drops).toEqual([{ kind: "weight", subject: "2026-08-20" }]);
  });

  it("reports a drop it cannot name", () => {
    const { drops } = parsed(
      fileWith((raw) => (raw.customFoods as unknown[]).push({ id: "c-9" })),
    );

    expect(drops).toEqual([{ kind: "customFood" }]);
  });

  it("rejects a day the calendar does not have", () => {
    const { snapshot, drops } = parsed(
      fileWith((raw) => {
        const weight = raw.weight as Record<string, unknown>[];
        weight[0].date = "2026-02-31";
      }),
    );

    // Accepting it would move the weighing to 3 March without saying so.
    expect(snapshot.weight).toHaveLength(1);
    expect(drops).toEqual([{ kind: "weight", subject: "2026-02-31" }]);
  });

  it("drops a profile that does not describe a person", () => {
    const { snapshot, drops } = parsed(
      fileWith((raw) => {
        (raw.profile as Record<string, unknown>).heightCm = 0;
      }),
    );

    expect(snapshot.profile).toBeUndefined();
    expect(drops).toEqual([{ kind: "profile" }]);
  });

  it("keeps a plan whose meal lost an item", () => {
    const { snapshot, drops } = parsed(
      fileWith((raw) => {
        const diets = raw.diets as { meals: { items: unknown[] }[] }[];
        diets[0].meals[0].items[0] = { id: "i-1", quantityG: 150 };
      }),
    );

    // A lunch missing one of its foods is a plan the reconciliation panel can
    // show and the user can repair. Dropping the plan would hide the damage.
    expect(snapshot.diets).toHaveLength(1);
    expect(snapshot.diets[0].meals[0].items).toHaveLength(1);
    expect(drops).toEqual([]);
  });

  it("repairs a selection that points at an option that did not survive", () => {
    // `selectedOption` would cover for it at read time, but a file restored
    // holding a selection nobody can see is a bug that gets saved again on the
    // next edit.
    const { snapshot, drops } = parsed(
      fileWith((raw) => {
        const diets = raw.diets as {
          meals: { optionSets: Record<string, unknown>[] }[];
        }[];
        diets[0].meals[0].optionSets[0].selectedId = "op-gone";
      }),
    );

    expect(snapshot.diets[0].meals[0].optionSets?.[0].selectedId).toBe("op-1");
    expect(drops).toEqual([]);
  });

  it("drops an option it cannot read and keeps the rest of the set", () => {
    const { snapshot } = parsed(
      fileWith((raw) => {
        const diets = raw.diets as {
          meals: { optionSets: { options: unknown[] }[] }[];
        }[];
        diets[0].meals[0].optionSets[0].options[0] = { id: "op-1" };
      }),
    );

    const set = snapshot.diets[0].meals[0].optionSets?.[0];

    expect(set?.options.map((option) => option.id)).toEqual(["op-2"]);
    expect(set?.selectedId).toBe("op-2");
  });

  it("drops a set with nothing left to choose between", () => {
    const { snapshot } = parsed(
      fileWith((raw) => {
        const diets = raw.diets as {
          meals: { optionSets: { options: unknown[] }[] }[];
        }[];
        diets[0].meals[0].optionSets[0].options = [];
      }),
    );

    // Absent rather than empty: a meal that ends up with no options must
    // restore to exactly the record a meal that never had one is.
    expect("optionSets" in snapshot.diets[0].meals[0]).toBe(false);
  });

  it("leaves a meal that never had options without the key", () => {
    const { snapshot } = parsed(
      fileWith((raw) => {
        const diets = raw.diets as { meals: Record<string, unknown>[] }[];
        delete diets[0].meals[0].optionSets;
      }),
    );

    expect("optionSets" in snapshot.diets[0].meals[0]).toBe(false);
  });

  it("drops a plan with no targets", () => {
    const { snapshot, drops } = parsed(
      fileWith((raw) => {
        delete (raw.diets as Record<string, unknown>[])[0].targets;
      }),
    );

    expect(snapshot.diets).toEqual([]);
    expect(drops).toEqual([{ kind: "diet", subject: "Cutting agosto" }]);
  });

  it("falls back to defaults when settings are unreadable", () => {
    const { snapshot, drops } = parsed(
      fileWith((raw) => (raw.settings = "sim")),
    );

    expect(snapshot.settings).toEqual({ locale: "pt-BR" });
    // Nothing the user typed was in there, so nothing is worth reporting.
    expect(drops).toEqual([]);
  });

  it("falls back to the shipped locale for one it does not have", () => {
    const { snapshot } = parsed(
      fileWith((raw) => {
        (raw.settings as Record<string, unknown>).locale = "en-GB";
      }),
    );

    expect(snapshot.settings.locale).toBe("pt-BR");
  });

  it("reports a broken goal, because it is a decision and not a default", () => {
    const { snapshot, drops } = parsed(
      fileWith((raw) => {
        const settings = raw.settings as { goal: Record<string, unknown> };
        settings.goal.kind = "bulk";
      }),
    );

    expect(snapshot.settings.goal).toBeUndefined();
    expect(snapshot.settings.lastBackupAt).toBe("2026-08-10T09:00:00.000Z");
    expect(drops).toEqual([{ kind: "goal" }]);
  });

  it("restores a version 1 file, which has no training section at all", () => {
    const { snapshot, drops } = parsed(
      fileWith((raw) => {
        raw.schemaVersion = 1;
        delete raw.training;
      }),
    );

    // Absent is not broken: this is what every file written before #78 looks
    // like, and what a device that has never chosen a split looks like now.
    expect(snapshot.training).toBeUndefined();
    expect(drops).toEqual([]);
  });

  it("drops a rotation it cannot read, and keeps the rest of the file", () => {
    const { snapshot, drops } = parsed(
      fileWith((raw) => (raw.training = { splitSlug: "abc-3x" })),
    );

    expect(snapshot.training).toBeUndefined();
    expect(snapshot.weight).toHaveLength(2);
    expect(drops).toEqual([{ kind: "training" }]);
  });

  it("refuses a rotation pointing at a day that is not a whole number", () => {
    const { drops } = parsed(
      fileWith((raw) => {
        const training = raw.training as Record<string, unknown>;
        training.nextDay = 1.5;
      }),
    );

    expect(drops).toEqual([{ kind: "training" }]);
  });

  it("keeps a rotation that has never been finished", () => {
    const { snapshot, drops } = parsed(
      fileWith((raw) => {
        const training = raw.training as Record<string, unknown>;
        delete training.lastFinishedAt;
      }),
    );

    expect(snapshot.training).toEqual({
      splitSlug: "abc-3x",
      nextDay: 1,
      updatedAt: "2026-08-14T18:40:00.000Z",
    });
    expect(drops).toEqual([]);
  });

  it("keeps a rotation past the end of a split this build has shortened", () => {
    // Not the parser's call. Which splits exist is a property of the build
    // doing the restoring, and the screen wraps — discarding the choice here
    // would lose a real decision over a number that is already survivable.
    const { snapshot } = parsed(
      fileWith((raw) => {
        const training = raw.training as Record<string, unknown>;
        training.nextDay = 40;
      }),
    );

    expect(snapshot.training?.nextDay).toBe(40);
  });

  it("restores a file written before the log existed", () => {
    const { snapshot, drops } = parsed(
      fileWith((raw) => {
        raw.schemaVersion = 2;
        delete raw.trainingSessions;
      }),
    );

    // Every file written between #78 and #79 looks like this, and so does a
    // device that has a split and has not finished a session on it yet.
    expect(snapshot.trainingSessions).toEqual([]);
    expect(drops).toEqual([]);
  });

  it("brings back a logged session with its sets in order", () => {
    const { snapshot } = parsed(fullSnapshotFile());

    expect(snapshot.trainingSessions).toEqual(fullSnapshot().trainingSessions);
  });

  it("drops one unreadable session by name and keeps the others", () => {
    const { snapshot, drops } = parsed(
      fileWith((raw) => {
        const sessions = raw.trainingSessions as Record<string, unknown>[];
        sessions.push({
          ...sessions[0],
          id: "s-2",
          dayName: "B · Costas",
          date: "não",
        });
      }),
    );

    expect(snapshot.trainingSessions).toHaveLength(1);
    expect(drops).toEqual([{ kind: "trainingSession", subject: "B · Costas" }]);
  });

  it("drops the whole session when one set inside it is broken", () => {
    // Half a session is a session that lies about what was done, and the
    // slice that reads these numbers to raise a load must never see one.
    const { snapshot, drops } = parsed(
      fileWith((raw) => {
        const sessions = raw.trainingSessions as Record<string, unknown>[];
        const exercises = sessions[0]!.exercises as Record<string, unknown>[];
        (exercises[0]!.sets as Record<string, unknown>[])[1]!.reps = 0;
      }),
    );

    expect(snapshot.trainingSessions).toEqual([]);
    expect(drops).toEqual([
      { kind: "trainingSession", subject: "A · Peito, ombros e tríceps" },
    ]);
  });

  it("refuses a set that claims a load of zero", () => {
    // Bodyweight work, and anybody who checked a set off without typing a
    // number. Absent is the answer; zero would be the claim that nothing was
    // lifted, which is why a zero is refused instead.
    const { snapshot, drops } = parsed(
      fileWith((raw) => {
        const sessions = raw.trainingSessions as Record<string, unknown>[];
        const exercises = sessions[0]!.exercises as Record<string, unknown>[];
        (exercises[0]!.sets as Record<string, unknown>[])[0]!.loadKg = 0;
      }),
    );

    expect(snapshot.trainingSessions).toEqual([]);
    expect(drops).toHaveLength(1);
  });

  it("keeps a session from a split this build no longer ships", () => {
    // The workout happened. `dayName` is copied into the record for exactly
    // this: the split can be gone and the session still reads.
    const { snapshot } = parsed(
      fileWith((raw) => {
        const sessions = raw.trainingSessions as Record<string, unknown>[];
        sessions[0]!.splitSlug = "abc-4x-2019";
      }),
    );

    expect(snapshot.trainingSessions?.[0]?.splitSlug).toBe("abc-4x-2019");
  });

  it("stamps the version it understood rather than the one the file claimed", () => {
    const { snapshot } = parsed(fileWith((raw) => (raw.schemaVersion = 1)));

    expect(snapshot.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
  });

  it("survives a file with no export date", () => {
    const { snapshot } = parsed(fileWith((raw) => delete raw.exportedAt));

    // Something rather than nothing: the restore screen prints this, and the
    // rest of the file is perfectly good.
    expect(Number.isNaN(Date.parse(snapshot.exportedAt))).toBe(false);
  });

  it("never throws, whatever it is handed", () => {
    const nasty = [
      "",
      "{",
      "[[[",
      '{"schemaVersion":"1"}',
      '{"schemaVersion":0}',
      '{"schemaVersion":1,"weight":[null,1,"x",[]]}',
      '{"schemaVersion":1,"profile":null,"settings":null}',
    ];

    for (const text of nasty) {
      expect(() => parseSnapshotFile(text)).not.toThrow();
    }
  });
});

describe("describeSnapshot", () => {
  it("counts what a restore would replace", () => {
    expect(describeSnapshot(fullSnapshot())).toEqual({
      exportedAt: "2026-08-20T12:00:00.000Z",
      hasProfile: true,
      hasGoal: true,
      weight: 2,
      weightFrom: "2026-08-18",
      weightTo: "2026-08-19",
      diets: 1,
      customFoods: 1,
      groups: 1,
      hasTraining: true,
      trainingSessions: 1,
    });
  });

  it("describes an empty device without inventing a range", () => {
    const summary = describeSnapshot(emptySnapshot());

    expect(summary.hasProfile).toBe(false);
    expect(summary.hasGoal).toBe(false);
    expect(summary.weight).toBe(0);
    expect(summary.weightFrom).toBeUndefined();
    expect(summary.weightTo).toBeUndefined();
  });

  it("finds the range whatever order the log is in", () => {
    const snapshot = fullSnapshot();
    snapshot.weight.reverse();

    const summary = describeSnapshot(snapshot);

    expect(summary.weightFrom).toBe("2026-08-18");
    expect(summary.weightTo).toBe("2026-08-19");
  });
});

describe("lastChangeAt", () => {
  it("finds the most recent write across every kind of record", () => {
    // The plan edited on the 15th is later than the profile and the foods, and
    // earlier than the last weighing — so only a search of all of them is right.
    expect(lastChangeAt(fullSnapshot())).toBe("2026-08-19T07:05:00.000Z");
  });

  it("counts a logged session as a change worth saving", () => {
    // The strongest case there is: a rotation can be re-chosen in two taps and
    // a month of loads cannot be reconstructed from anything.
    const snapshot: Snapshot = {
      ...fullSnapshot(),
      weight: [],
      diets: [],
      customFoods: [],
      substitutionGroups: [],
      profile: undefined,
      training: undefined,
    };

    expect(lastChangeAt(snapshot)).toBe("2026-08-14T18:40:00.000Z");
  });

  it("sees a change in a plan that no weighing followed", () => {
    const snapshot: Snapshot = { ...fullSnapshot(), weight: [] };

    expect(lastChangeAt(snapshot)).toBe("2026-08-15T10:00:00.000Z");
  });

  it("counts advancing the rotation as a change worth saving", () => {
    const snapshot: Snapshot = {
      ...fullSnapshot(),
      weight: [],
      diets: [],
      customFoods: [],
      substitutionGroups: [],
      profile: undefined,
    };

    expect(lastChangeAt(snapshot)).toBe("2026-08-14T18:40:00.000Z");
  });

  it("has nothing to report for an empty store", () => {
    expect(lastChangeAt(emptySnapshot())).toBeUndefined();
  });

  it("ignores the export stamp, which is not a change to anything", () => {
    const snapshot: Snapshot = {
      ...emptySnapshot(),
      exportedAt: "2030-01-01T00:00:00.000Z",
    };

    expect(lastChangeAt(snapshot)).toBeUndefined();
  });
});
