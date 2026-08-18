import { afterEach, describe, expect, it } from "vitest";

import { todayIsoDate } from "./date";

const originalTz = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTz;
});

describe("todayIsoDate", () => {
  it("names the local day, not the UTC one", () => {
    // 02:30 UTC on the 18th is 23:30 on the 17th in São Paulo. The UTC
    // shortcut (`toISOString().slice(0, 10)`) returns the 18th here, which is
    // how an evening weigh-in gets filed under a day that has not begun.
    const evening = new Date("2026-08-18T02:30:00Z");

    process.env.TZ = "America/Sao_Paulo";
    expect(todayIsoDate(evening)).toBe("2026-08-17");
    expect(evening.toISOString().slice(0, 10)).toBe("2026-08-18");
  });

  it("names the local day east of UTC too", () => {
    // The same instant is already the 18th in Kiritimati (UTC+14).
    process.env.TZ = "Pacific/Kiritimati";
    expect(todayIsoDate(new Date("2026-08-17T20:00:00Z"))).toBe("2026-08-18");
  });

  it("pads month and day to two digits", () => {
    process.env.TZ = "UTC";
    expect(todayIsoDate(new Date("2026-01-05T12:00:00Z"))).toBe("2026-01-05");
  });

  it("produces a value the ISO date parser accepts", () => {
    process.env.TZ = "America/Sao_Paulo";
    expect(todayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
