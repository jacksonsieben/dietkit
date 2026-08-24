import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { activeTab, PLATES, plateKey, TABS } from "@/lib/nav/tabs";

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

  it("says why the numbers are the numbers, on every movement", () => {
    // The reason comes off the draft rather than being worked out again here,
    // so the sentence and the numbers under it cannot disagree; and it is
    // worded from `messages/` rather than assembled in `lib`, which is what
    // makes it a sentence anybody can change (docs/DECISIONS.md § D5, § D20).
    const source = screen();

    expect(source).toContain("<Reason reason={exercise.reason}");
    expect(source).toContain('useTranslations("Training.progression")');
    expect(source).toContain("t(reason.kind)");
    expect(source).not.toContain("nextPrescription(");
  });

  it("halves a rep count inside a reason, like every other rep count", () => {
    // Everything crossing out of the log is a total across both sides. A
    // reason saying "you closed twenty" for ten per arm would be the one
    // number on the screen that lied.
    const source = screen();

    expect(source).toContain("shownReps(reason.reps, unilateral)");
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

/**
 * The history screen's wiring (#81). What the numbers *mean* is
 * `history.test.ts`; this is the part that only the source can answer — that
 * the series never leaves the device, that there is one charting idea rather
 * than two, and that a record is read out of the log rather than kept
 * somewhere it can drift.
 */
describe("history wiring", () => {
  const screen = () => read("src/components/StrengthHistory.tsx");
  const page = () => read("src/app/[locale]/treino/historico/page.tsx");
  const training = () => read("src/components/Training.tsx");

  it("keeps the whole series on the device", () => {
    // Two months of loads is a more revealing document than any single
    // weighing (docs/DECISIONS.md § D1), and this is the screen that holds all
    // of it at once.
    const source = screen();

    expect(source).not.toContain("fetch(");
    expect(source).not.toMatch(/method:\s*"POST"/);
    expect(source).not.toContain("dexie");
  });

  it("reads the log through the store, like every other training screen", () => {
    const source = screen();

    expect(source).toContain("loadHistory(getRepository())");
    expect(source).not.toContain("repository.trainingSessions");
  });

  it("draws with the chart the weight screen already uses", () => {
    // § D21: one geometry, two vocabularies. A second charting idea here would
    // be a second set of decisions about floors and bands to keep in step —
    // and the first one is already tested.
    const source = screen();

    expect(source).toContain("strengthGeometry(");
    expect(source).not.toContain("recharts");
    expect(source).not.toContain("chart.js");
  });

  it("never prints an estimate without the set it came from", () => {
    // "137 kg estimado" is not a claim anybody can check (§ D21). The wording
    // is shared with the finish so there is one copy of that rule.
    const source = screen();

    expect(source).toContain('from "@/components/training/records"');
    expect(source).toContain("estimateFrom(");
    expect(training()).toContain('from "@/components/training/records"');
  });

  it("derives the records it announces at the finish", () => {
    // Never a stored counter (§ D19, § D21): `brokenRecords` asks the log
    // twice rather than incrementing anything.
    const source = training();

    expect(source).toContain("brokenRecords(history, record)");
    expect(source).not.toMatch(/records\.(put|add)\(/);
  });

  it("offers the history from the session, and only once there is some", () => {
    const source = training();

    expect(source).toContain('<TextLink href="/treino/historico">');
    expect(source).toContain("lastFinishedAt === undefined ? null");
  });

  it("stays behind the training plate", () => {
    // A sub-route of /treino, so the tab that was already lit stays lit — no
    // change to tabs.ts, which is the point of matching on the prefix.
    expect(activeTab("/treino/historico")).toBe("training");
    expect(TABS.find((tab) => tab.id === "training")?.href).toBe("/treino");
    expect(plateKey("/treino/historico")).toBe("trainingHistory");
    expect(page()).toContain("<StrengthHistory />");
  });
});
