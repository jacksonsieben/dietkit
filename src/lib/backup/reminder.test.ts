import { describe, expect, it } from "vitest";

import { emptySnapshot } from "@/lib/storage/shared";
import type { Settings, Snapshot, WeightEntry } from "@/lib/storage/types";

import { fullSnapshot } from "./snapshot.fixture";
import { backupUrgency, hasEnoughToLose, isBackupDue } from "./reminder";

const NOW = new Date("2026-08-20T12:00:00.000Z");

function weighings(count: number): WeightEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `w-${index}`,
    date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    weightKg: 81 + index / 10,
    recordedAt: `2026-08-${String(index + 1).padStart(2, "0")}T07:00:00.000Z`,
  }));
}

/** A store holding only the given fields, everything else empty. */
function store(fields: Partial<Snapshot>): Snapshot {
  return { ...emptySnapshot(), ...fields };
}

const NEVER_BACKED_UP: Settings = { locale: "pt-BR" };

describe("hasEnoughToLose", () => {
  it("says no to an empty store", () => {
    expect(hasEnoughToLose(emptySnapshot())).toBe(false);
  });

  it("says yes to a single plan", () => {
    // The most expensive thing the app makes: a solve, adjusted by hand.
    expect(hasEnoughToLose(store({ diets: fullSnapshot().diets }))).toBe(true);
  });

  it("waits for a week of mornings before it counts the log", () => {
    expect(hasEnoughToLose(store({ weight: weighings(4) }))).toBe(false);
    expect(hasEnoughToLose(store({ weight: weighings(5) }))).toBe(true);
  });

  it("counts custom foods, each of which was typed off a package", () => {
    const foods = fullSnapshot().customFoods;
    const three = [0, 1, 2].map((index) => ({ ...foods[0], id: `c-${index}` }));

    expect(hasEnoughToLose(store({ customFoods: three.slice(0, 2) }))).toBe(false);
    expect(hasEnoughToLose(store({ customFoods: three }))).toBe(true);
  });

  it("does not count groups on their own", () => {
    // A couple of taps, and meaningless without the foods it points at.
    const groups = fullSnapshot().substitutionGroups;

    expect(hasEnoughToLose(store({ substitutionGroups: groups }))).toBe(false);
  });
});

describe("isBackupDue", () => {
  it("stays quiet until there is something worth losing", () => {
    expect(isBackupDue(store({ weight: weighings(2) }), NEVER_BACKED_UP, NOW)).toBe(
      false,
    );
  });

  it("asks once there is", () => {
    expect(isBackupDue(store({ weight: weighings(5) }), NEVER_BACKED_UP, NOW)).toBe(
      true,
    );
  });

  it("stays quiet when the last backup is newer than the last change", () => {
    // The whole point of the policy: someone who exported and then did not open
    // the app again is never nagged, however many months pass.
    const settings: Settings = {
      locale: "pt-BR",
      lastBackupAt: "2026-08-19T23:00:00.000Z",
    };

    expect(isBackupDue(fullSnapshot(), settings, NOW)).toBe(false);
  });

  it("asks again once something changes after the last backup", () => {
    // The fixture's backup is from the 10th and its last weighing from the 19th.
    expect(isBackupDue(fullSnapshot(), fullSnapshot().settings, NOW)).toBe(true);
  });

  it("holds off for a fortnight after being turned down", () => {
    const settings: Settings = {
      ...fullSnapshot().settings,
      backupRemindedAt: "2026-08-13T12:00:00.000Z",
    };

    expect(isBackupDue(fullSnapshot(), settings, NOW)).toBe(false);
  });

  it("comes back after the fortnight", () => {
    const settings: Settings = {
      ...fullSnapshot().settings,
      backupRemindedAt: "2026-08-05T12:00:00.000Z",
    };

    expect(isBackupDue(fullSnapshot(), settings, NOW)).toBe(true);
  });

  it("asks when there is data but nothing says when it changed", () => {
    // Rows written by an older version of the app, still sitting in IndexedDB
    // with a field this one expects missing. The cast is the point of the test:
    // the store is not a validated file, and staying quiet about real plans is
    // the one failure here that costs everything.
    const undated = fullSnapshot().diets.map((diet) => {
      const { updatedAt: _dropped, ...rest } = diet;
      return rest as typeof diet;
    });

    const settings: Settings = {
      locale: "pt-BR",
      lastBackupAt: "2026-08-19T23:00:00.000Z",
    };

    expect(isBackupDue(store({ diets: undated }), settings, NOW)).toBe(true);
  });
});

describe("backupUrgency", () => {
  it("distinguishes never from stale", () => {
    expect(backupUrgency(NEVER_BACKED_UP)).toBe("never");
    expect(backupUrgency(fullSnapshot().settings)).toBe("stale");
  });
});
