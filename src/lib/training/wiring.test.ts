import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PLATES, TABS } from "@/lib/nav/tabs";

const ROOT = path.resolve(import.meta.dirname, "../../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(ROOT, relative), "utf8");

/**
 * The half of #78 that is only visible in the source (the other half is
 * `rotation.test.ts` and `store.test.ts`, which cover what the rotation means).
 *
 * Read rather than rendered, for the reason every wiring test in this repo
 * gives: next-intl resolves to its client build under Vitest, so a component
 * cannot be mounted here. What is checked is the wiring a mounted test would
 * have caught anyway — that the screen goes through the store, that the
 * rotation stays on the device, and that the panel is handed the short label
 * rather than a day's full name.
 */
describe("training wiring", () => {
  const screen = () => read("src/components/Training.tsx");
  const page = () => read("src/app/[locale]/treino/page.tsx");

  it("keeps the rotation on the device", () => {
    // Which split somebody runs is a fact about their body and their week
    // (docs/DECISIONS.md § D1). The one way that promise breaks is a screen
    // that posts it somewhere, so the screen is the place to check.
    const source = screen();

    expect(source).not.toContain("fetch(");
    expect(source).not.toMatch(/method:\s*"POST"/);
    expect(source).not.toContain("dexie");
  });

  it("goes through the store rather than the repository", () => {
    // Every write on this screen is one of the four functions in store.ts, so
    // the rule about what a finish does is in a file that can be tested. A
    // `repository.training.save` here would be a second copy of it.
    const source = screen();

    expect(source).toContain("chooseSplit(repository");
    expect(source).toContain("finishSession(repository");
    expect(source).toContain("stopTraining(repository)");
    expect(source).not.toContain("repository.training.");
  });

  it("re-reads the device after a write it does not get the state back from", () => {
    // `finishSession` hands back the state it just wrote; choosing and
    // stopping do not, and assuming what they did is how a screen and a
    // device start disagreeing.
    const source = screen();

    expect(source).toContain("setState(await loadTraining(repository))");
  });

  it("lights the short label, never the day's full name", () => {
    // "A · Peito, ombros e tríceps" in the panel would be a middle dot the
    // face has no glyph for — a solid block, which reads as broken hardware —
    // in a string far too long for the column. `sessionLabel` is the trim.
    const source = screen();

    expect(source).toContain("sessionLabel(session.day.name)");
    expect(source).toContain("displayFontSize(label)");
    expect(source).not.toContain("displayFontSize(session.day.name");
  });

  it("pre-fills today from what the device already logged", () => {
    // The pre-fill is the point of the log: opening a session should show
    // what was lifted last time, not an empty card. It is one read, through
    // the store like every other, and `startDraft` is where the rule about
    // which numbers carry forward lives.
    const source = screen();

    expect(source).toContain("loadHistory(repository)");
    expect(source).toContain("startDraft(session.day, history)");
    expect(source).not.toContain("repository.trainingSessions");
  });

  it("writes the session once, at the finish", () => {
    // A draft is not a record. Nothing on this screen persists a set as it is
    // checked off — the whole session is built by `finishedSession` and handed
    // to the store in one write, so a workout abandoned halfway leaves no
    // half-record behind claiming to be one.
    const source = screen();

    expect(source).toContain("finishedSession(");
    expect(source).not.toContain(".put(");
  });

  it("keeps the rest clock a size below the day's letter", () => {
    // The panel is the loudest thing the app draws and there is one headline
    // per screen (src/components/nd/readouts.test.ts). The letter has it, so
    // the clock is the subordinate slot — and it is `restClock` that renders
    // it, because "90" in a panel is not a rest, it is a number.
    const source = screen();

    expect(source).toContain("restClock(seconds)");
    expect(source).toContain("displayFontSize(clock, 16)");
  });

  it("asks for reps the way the movement is done", () => {
    // A unilateral set is stored as the total across both sides and shown
    // halved, so the screen has to go through `shownReps` rather than print
    // `set.reps` — the difference between "8 por lado" and a claim of eight.
    const source = screen();

    expect(source).toContain("shownReps(set.reps, unilateral)");
    expect(source).toContain("log.repsPerSide");
  });

  it("offers a load only where there is one to record", () => {
    // A bodyweight movement carries no external weight, so it gets no load
    // stepper — and a belt is an addition, which is why there is a control
    // that adds one rather than a field sitting at zero.
    const source = screen();

    expect(source).toContain('equipment === "peso-corporal"');
    expect(source).toContain("bodyweight && set.loadKg === undefined");
    expect(source).toContain("log.addLoad");
  });

  it("has a rendering for each of the three states", () => {
    // None of them is a spinner over an empty layout: a device with no split
    // gets the chooser, a device holding a split this build dropped gets a
    // sentence about it *and* the chooser, and anything else gets the session.
    const source = screen();

    expect(source).toContain('state.status === "unknownSplit"');
    expect(source).toContain('state.status === "ready"');
    expect(source).toContain("<Chooser");
    expect(source).toContain("<Session");
  });

  it("puts the screen behind the tab that was holding its seat", () => {
    expect(TABS.find((tab) => tab.id === "training")?.href).toBe("/treino");
    expect(PLATES["/treino"]).toBe("training");
    expect(page()).toContain("<Training />");
  });
});
