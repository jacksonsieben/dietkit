import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import ptBR from "../../messages/pt-BR.json";
import {
  DISMISSIBLE_NOTICES,
  dismissedNotices,
  isNoticeDismissed,
  withNoticeDismissed,
  withNoticeRestored,
} from "./notices";
import { routing } from "@/i18n/routing";
import type { Settings } from "@/lib/storage/types";

const ROOT = path.resolve(import.meta.dirname, "../..");

function read(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function settings(overrides: Partial<Settings> = {}): Settings {
  return { locale: routing.defaultLocale, ...overrides };
}

describe("dismissing a standing notice", () => {
  it("shows a notice nobody has answered", () => {
    expect(isNoticeDismissed(settings(), "backup")).toBe(false);
  });

  it("remembers the one that was put away", () => {
    const answered = settings({
      dismissedNotices: withNoticeDismissed(settings(), "legal"),
    });

    expect(isNoticeDismissed(answered, "legal")).toBe(true);
  });

  it("leaves the other notices alone", () => {
    // The failure this exists to catch is a dismiss handler that writes
    // `["legal"]` rather than appending: the user hides the fine print and
    // silently gets the backup warning back, or worse, the other way round.
    const both = settings({ dismissedNotices: ["backup"] });

    expect(withNoticeDismissed(both, "legal")).toEqual(["backup", "legal"]);
  });

  it("cannot record the same answer twice", () => {
    const once = settings({ dismissedNotices: ["backup"] });

    expect(withNoticeDismissed(once, "backup")).toEqual(["backup"]);
  });

  it("brings back only what was asked for", () => {
    const both = settings({ dismissedNotices: ["backup", "legal"] });

    expect(withNoticeRestored(both, "backup")).toEqual(["legal"]);
  });

  it("survives restoring something that was never hidden", () => {
    expect(withNoticeRestored(settings(), "legal")).toEqual([]);
  });

  it("lists what is hidden in one order, whatever order it was answered in", () => {
    // `/mais` renders this list. Two devices that dismissed the same pair in
    // different orders should not show the rows in different orders.
    const reversed = settings({ dismissedNotices: ["legal", "backup"] });

    expect(dismissedNotices(reversed)).toEqual([...DISMISSIBLE_NOTICES]);
  });

  it("names every notice on the page that brings them back", () => {
    // The label is derived from the id (`notice_backup`), so a notice added
    // without a name for it would render its own identifier at the user. This
    // is the check that turns that into a failing test instead.
    for (const notice of DISMISSIBLE_NOTICES) {
      expect(ptBR.More, `More.notice_${notice} is missing`).toHaveProperty(
        `notice_${notice}`,
      );
      expect(ptBR.More, `More.notice_${notice}Hint is missing`).toHaveProperty(
        `notice_${notice}Hint`,
      );
    }
  });
});

/**
 * Source-level wiring. What these guard is the difference between a dismiss
 * button that stores an answer and one that only hides a strip until the next
 * reload — which is what the user asked for the app to stop doing.
 */
describe("the notices are wired to the store", () => {
  it("saves the answer to the backup strip instead of a timestamp", () => {
    const reminder = read("src/components/BackupReminder.tsx");

    expect(reminder).toContain('withNoticeDismissed(settings, "backup")');
    expect(reminder).not.toContain("backupRemindedAt");
  });

  it("saves the answer to the fine print", () => {
    expect(read("src/components/SourceFooter.tsx")).toContain(
      'withNoticeDismissed(settings, "legal")',
    );
  });

  it("keeps a way back on /mais", () => {
    // A dismissal with no undo is not a preference, it is a deletion the user
    // performed by accident — and one of the two notices is a data-loss
    // warning.
    expect(read("src/app/[locale]/mais/page.tsx")).toMatch(
      /<DismissedNotices\s*\/>/,
    );
    expect(read("src/components/DismissedNotices.tsx")).toContain(
      "withNoticeRestored(settings, notice)",
    );
  });

  it("stores the answers where the backup file and the other devices see them", () => {
    // `Settings.dismissedNotices`, not `localStorage`: the snapshot carries it,
    // so the answer travels with the rest of the user's preferences.
    expect(read("src/lib/backup/snapshot.ts")).toContain("dismissedNotices");
  });
});
