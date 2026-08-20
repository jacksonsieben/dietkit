import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fullSnapshot } from "./snapshot.fixture";
import { backupFilename, serializeSnapshot } from "./file";
import { parseSnapshotFile } from "./snapshot";

describe("backupFilename", () => {
  it("names the file after the day it was made", () => {
    expect(backupFilename(new Date(2026, 7, 20, 9, 30))).toBe(
      "dietkit-2026-08-20.json",
    );
  });

  it("pads, so a folder of backups sorts by date", () => {
    const names = [
      backupFilename(new Date(2026, 0, 9)),
      backupFilename(new Date(2026, 10, 2)),
      backupFilename(new Date(2026, 0, 20)),
    ];

    expect([...names].sort()).toEqual([
      "dietkit-2026-01-09.json",
      "dietkit-2026-01-20.json",
      "dietkit-2026-11-02.json",
    ]);
  });

  describe("in São Paulo", () => {
    // The clock has to be moved for this one to mean anything: on a UTC runner
    // the local day and the UTC day are the same day, and the assertion below
    // would hold no matter which the implementation used.
    const original = process.env.TZ;

    beforeAll(() => {
      process.env.TZ = "America/Sao_Paulo";
    });

    afterAll(() => {
      process.env.TZ = original;
    });

    it("uses the day it is on the device, not the day it is in UTC", () => {
      // Nine in the evening in São Paulo is already tomorrow in UTC. A backup
      // made on Wednesday night should not be filed under Thursday.
      const evening = new Date(2026, 7, 20, 21, 0);

      expect(evening.toISOString().startsWith("2026-08-21")).toBe(true);
      expect(backupFilename(evening)).toBe("dietkit-2026-08-20.json");
    });
  });
});

describe("serializeSnapshot", () => {
  it("writes a file the restore reads back unchanged", () => {
    const result = parseSnapshotFile(serializeSnapshot(fullSnapshot()));

    expect(result).toEqual({ ok: true, snapshot: fullSnapshot(), drops: [] });
  });

  it("writes it so a person can read it", () => {
    const text = serializeSnapshot(fullSnapshot());

    // One record per line and a name they will recognise: this is the file
    // someone opens when they want to check their backup is really theirs.
    expect(text).toContain('\n  "weight": [');
    expect(text).toContain("Cutting agosto");
    expect(text.endsWith("\n")).toBe(true);
  });
});
