import { describe, expect, it } from "vitest";

import type { TrainingRotation } from "@/lib/storage/types";

import {
  advanceRotation,
  currentSession,
  rotationSplit,
  sessionLabel,
  startRotation,
} from "./rotation";
import { SPLITS, splitBySlug } from "./splits";

const NOW = "2026-08-24T18:30:00.000Z";

/** The ABC, because three days is enough to see a wrap and short enough to read. */
const abc = splitBySlug("abc-3x")!;

function rotation(overrides: Partial<TrainingRotation> = {}): TrainingRotation {
  return {
    splitSlug: "abc-3x",
    nextDay: 0,
    updatedAt: "2026-08-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("startRotation", () => {
  it("starts at the first day rather than at whatever today is", () => {
    // The rotation has no calendar in it: choosing a split on a Thursday puts
    // you on A, not on the day a weekday schedule would have said you missed.
    expect(startRotation("abc-3x", NOW)).toEqual({
      splitSlug: "abc-3x",
      nextDay: 0,
      updatedAt: NOW,
    });
  });

  it("has never been finished, because it has not been", () => {
    expect(startRotation("abc-3x", NOW).lastFinishedAt).toBeUndefined();
  });
});

describe("rotationSplit", () => {
  it("resolves the split a rotation names", () => {
    expect(rotationSplit(rotation())?.slug).toBe("abc-3x");
  });

  it("gives nothing back for a split this build no longer ships", () => {
    // Not a throw: this is a screen someone opens in a basement, and the only
    // useful answer is "choose again".
    expect(rotationSplit(rotation({ splitSlug: "abc-4x-2019" }))).toBeUndefined();
  });
});

describe("currentSession", () => {
  it("reads the day that has not been done yet", () => {
    const session = currentSession(rotation({ nextDay: 1 }), abc);

    expect(session.index).toBe(1);
    expect(session.day.name).toBe("B · Costas e bíceps");
  });

  it("wraps a pointer past the end of a split that has been shortened", () => {
    // A device holds whatever it was last given. A build that dropped a day
    // must not turn that into a screen that cannot render.
    expect(currentSession(rotation({ nextDay: 3 }), abc).index).toBe(0);
    expect(currentSession(rotation({ nextDay: 7 }), abc).index).toBe(1);
  });

  it("wraps a negative pointer forwards, not off the front of the array", () => {
    expect(currentSession(rotation({ nextDay: -1 }), abc).index).toBe(2);
  });
});

describe("advanceRotation", () => {
  it("moves one day on and stamps when it happened", () => {
    expect(advanceRotation(rotation({ nextDay: 0 }), abc, NOW)).toEqual({
      splitSlug: "abc-3x",
      nextDay: 1,
      lastFinishedAt: NOW,
      updatedAt: NOW,
    });
  });

  it("comes back round to the first day after the last one", () => {
    expect(advanceRotation(rotation({ nextDay: 2 }), abc, NOW).nextDay).toBe(0);
  });

  it("lands on the day after the one the screen showed", () => {
    // `nextDay: 3` renders as A on a three-day split, so finishing it has to
    // leave the rotation on B — 1, never the 4 that is off the end.
    expect(advanceRotation(rotation({ nextDay: 3 }), abc, NOW).nextDay).toBe(1);
  });

  it("leaves the split alone — finishing a day is not changing your mind", () => {
    expect(advanceRotation(rotation(), abc, NOW).splitSlug).toBe("abc-3x");
  });
});

describe("sessionLabel", () => {
  it("keeps the letter people actually say", () => {
    expect(sessionLabel("Treino A")).toBe("A");
    expect(sessionLabel("A · Peito, ombros e tríceps")).toBe("A");
  });

  it("keeps a name that is the whole label", () => {
    expect(sessionLabel("Superior A")).toBe("SUPERIOR A");
    expect(sessionLabel("Empurrar")).toBe("EMPURRAR");
  });

  it("never hands the panel a character the face cannot light", () => {
    // `·` is not in the glyph face and would render as a filled block — a
    // display that looks broken rather than one that says something.
    for (const split of SPLITS) {
      for (const day of split.days) {
        const label = sessionLabel(day.name);

        expect(label).not.toContain("·");
        expect(label).toMatch(/^[A-Z ]+$/);
        // Short enough that the headline panel is legible at arm's length
        // rather than shrunk to fit the column.
        expect(label.length).toBeLessThanOrEqual(10);
      }
    }
  });
});
