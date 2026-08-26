import { describe, expect, it } from "vitest";

import { SNAPSHOT_SCHEMA_VERSION } from "@/lib/storage/types";

import { context, openEnvelope, sealEnvelope, wins } from "./envelope";
import { WrongKeyError, generateDataKey, seal } from "./sealed";

const RECORD = {
  id: "diet-1",
  name: "Cutting",
  updatedAt: "2026-03-03T10:00:00.000Z",
};

describe("the sealed envelope", () => {
  it("comes back out the way it went in", async () => {
    const key = await generateDataKey();
    const sealed = await sealEnvelope(key, "diets", "diet-1", {
      record: RECORD,
      updatedAt: RECORD.updatedAt,
      deviceId: "device-a",
    });

    expect(await openEnvelope(key, "diets", "diet-1", sealed)).toEqual({
      record: RECORD,
      updatedAt: RECORD.updatedAt,
      deviceId: "device-a",
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    });
  });

  it("carries nothing the server could read", async () => {
    const key = await generateDataKey();
    const sealed = await sealEnvelope(key, "diets", "diet-1", {
      record: RECORD,
      updatedAt: RECORD.updatedAt,
      deviceId: "device-a",
    });

    const wire = JSON.stringify(sealed);
    for (const secret of ["Cutting", "diet-1", "device-a", "2026-03-03"]) {
      expect(wire).not.toContain(secret);
    }
  });

  it("refuses to open under a record id it was not sealed for", async () => {
    const key = await generateDataKey();
    const sealed = await sealEnvelope(key, "diets", "diet-1", {
      record: RECORD,
      updatedAt: RECORD.updatedAt,
      deviceId: "device-a",
    });

    // A server that moved a blob to another row produces a failure rather than
    // one record's contents showing up as another's.
    await expect(openEnvelope(key, "diets", "diet-2", sealed)).rejects.toThrow(
      WrongKeyError,
    );
  });

  it("refuses to open under a collection it was not sealed for", async () => {
    const key = await generateDataKey();
    const sealed = await sealEnvelope(key, "diets", "shared-id", {
      record: RECORD,
      updatedAt: RECORD.updatedAt,
      deviceId: "device-a",
    });

    await expect(
      openEnvelope(key, "customFoods", "shared-id", sealed),
    ).rejects.toThrow(WrongKeyError);
  });

  it("leaves a record from a newer app version alone", async () => {
    const key = await generateDataKey();
    const sealed = await seal(
      key,
      JSON.stringify({
        record: RECORD,
        updatedAt: RECORD.updatedAt,
        deviceId: "device-b",
        schemaVersion: SNAPSHOT_SCHEMA_VERSION + 1,
      }),
      context("diets", "diet-1"),
    );

    // `undefined`, not a throw: the pull skips this row and keeps going. The
    // alternative is an old build writing back a record it did not understand.
    expect(await openEnvelope(key, "diets", "diet-1", sealed)).toBeUndefined();
  });

  it("still opens a record from an older app version", async () => {
    const key = await generateDataKey();
    const sealed = await seal(
      key,
      JSON.stringify({
        record: RECORD,
        updatedAt: RECORD.updatedAt,
        deviceId: "device-b",
        schemaVersion: 1,
      }),
      context("diets", "diet-1"),
    );

    expect(await openEnvelope(key, "diets", "diet-1", sealed)).toMatchObject({
      schemaVersion: 1,
    });
  });
});

describe("last write wins", () => {
  const older = { updatedAt: "2026-03-01T10:00:00.000Z", deviceId: "device-a" };
  const newer = { updatedAt: "2026-03-02T10:00:00.000Z", deviceId: "device-a" };

  it("prefers the later write", () => {
    expect(wins(newer, older)).toBe(true);
    expect(wins(older, newer)).toBe(false);
  });

  it("gives anything at all to a record that is not here yet", () => {
    expect(wins(older, undefined)).toBe(true);
  });

  it("breaks a tie the same way on both devices", () => {
    const a = { updatedAt: newer.updatedAt, deviceId: "device-a" };
    const b = { updatedAt: newer.updatedAt, deviceId: "device-b" };

    // The point is not which one wins; it is that both devices asking the
    // question get the same answer without talking to each other. A random or
    // "whoever asked" tiebreak would have them push each other back forever.
    expect(wins(b, a)).toBe(true);
    expect(wins(a, b)).toBe(false);
  });

  it("does not let a record beat itself", () => {
    expect(wins(newer, newer)).toBe(false);
  });
});
