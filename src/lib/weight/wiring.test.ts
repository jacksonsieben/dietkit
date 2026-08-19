import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import ptBR from "../../../messages/pt-BR.json";
import { WEIGHT_ERROR_CODES } from "./validation";

const ROOT = path.resolve(import.meta.dirname, "../../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(ROOT, relative), "utf8");

/**
 * The parts of #23 that are about how the pieces are wired rather than about
 * what any one of them computes. Components cannot be rendered here —
 * `next-intl/server` resolves to its client build under Vitest — so the source
 * is read instead, and each check is written to fail if the thing it names is
 * removed rather than merely moved.
 */
describe("weight log wiring", () => {
  it("has a message for every way an entry can be rejected", () => {
    // next-intl renders the key path when a message is missing, so a new code
    // ships as "Weight.errors.xyz" in red under an input.
    for (const code of WEIGHT_ERROR_CODES) {
      expect(ptBR.Weight.errors, `no message for ${code}`).toHaveProperty(code);
    }
  });

  it("has no message left over for a code nothing can produce", () => {
    expect(Object.keys(ptBR.Weight.errors).sort()).toEqual(
      [...WEIGHT_ERROR_CODES].sort(),
    );
  });

  it("says what saving over an existing day will do, before it does it", () => {
    // The defined duplicate-date behaviour is "the day is a slot": choosing an
    // occupied one replaces what is in it. A user who is not told that is one
    // who loses a measurement to a keystroke.
    const source = read("src/components/WeightLog.tsx");

    // Shown from the day in the box, which is known as it is typed — not from
    // the result of the save, which would be an apology rather than a warning.
    expect(source).toContain("entryOn(entries, values.date");
    const warning = source.slice(source.indexOf("occupied === undefined ? null"));
    expect(warning.slice(0, warning.indexOf(")}"))).toContain('t("replaceWarning"');

    // And it quotes the weight that is about to be overwritten, so the user can
    // see whether it is worth keeping.
    expect(ptBR.Weight.replaceWarning).toContain("{weight, number}");
  });

  it("offers a day other than today", () => {
    // Backfilling is half of what the issue asks for, and a date input pinned
    // to today would make the other half unreachable from the screen.
    const source = read("src/components/WeightLog.tsx");

    expect(source).toContain('type="date"');
    expect(source).toContain("max={today}");
  });

  it("writes through the repository, not the store underneath it", () => {
    const source = read("src/components/WeightLog.tsx");

    expect(source).toContain("getRepository()");
    expect(source).not.toContain("dexie");
    expect(source).not.toContain("indexedDB");
  });

  it("sends nothing anywhere", () => {
    // A weight is the most personal number this app holds, and the promise is
    // that it never leaves the device (docs/DECISIONS.md § D1).
    const source = read("src/components/WeightLog.tsx");

    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("navigator.sendBeacon");
  });

  it("is reachable from the home screen", () => {
    expect(read("src/app/[locale]/page.tsx")).toContain('href="/peso"');
  });

  it("renders the day in words rather than as a stored string", () => {
    // `new Date("2026-08-19")` is UTC midnight — the evening of the 18th in
    // Brazil — so every row would print the day before the one it measures.
    const source = read("src/components/WeightLog.tsx");

    expect(source).toContain("calendarDate(");
    expect(source).toContain("format.dateTime(");
  });
});
