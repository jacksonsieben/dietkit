import { describe, expect, it } from "vitest";

import { ageYearsOn, parseIsoDate } from "./age";

describe("ageYearsOn", () => {
  it("counts completed years", () => {
    expect(ageYearsOn("1995-03-14", "2026-08-18")).toBe(31);
  });

  it("does not round up the day before a birthday", () => {
    expect(ageYearsOn("1995-03-14", "2026-03-13")).toBe(30);
    expect(ageYearsOn("1995-03-14", "2026-03-14")).toBe(31);
  });

  it("treats a birthday earlier in the same month as passed", () => {
    expect(ageYearsOn("1995-03-01", "2026-03-31")).toBe(31);
    expect(ageYearsOn("1995-03-31", "2026-03-01")).toBe(30);
  });

  it("is zero for the day someone was born", () => {
    expect(ageYearsOn("2026-08-18", "2026-08-18")).toBe(0);
  });

  it("gives a 29 February birthday its birthday on 1 March", () => {
    // Arbitrary, and documented as arbitrary in age.ts — five kilocalories for
    // one day a year. What matters is that it is decided rather than emergent.
    expect(ageYearsOn("2000-02-29", "2025-02-28")).toBe(24);
    expect(ageYearsOn("2000-02-29", "2025-03-01")).toBe(25);
    // In a leap year the day exists and behaves normally.
    expect(ageYearsOn("2000-02-29", "2024-02-29")).toBe(24);
  });

  it("does not shift the answer by a timezone", () => {
    // `new Date("2000-03-01")` is UTC midnight, so a Date-based implementation
    // reading `.getDate()` in São Paulo sees 29 February.
    //
    // Most date pairs survive that: both dates shift back by the same day and
    // the subtraction cancels, which is exactly why the bug is hard to find by
    // trying examples. It stops cancelling across a leap day. Someone born on
    // 1 March 2000 turns 25 on 1 March 2025 — but 2000 had a 29 February and
    // 2025 did not, so the shifted pair reads 29 Feb → 28 Feb and reports 24 on
    // the morning of their birthday. Everything in age.ts is string arithmetic
    // so that this stays true wherever the code runs.
    const original = process.env.TZ;
    try {
      for (const zone of ["UTC", "America/Sao_Paulo", "Pacific/Kiritimati"]) {
        process.env.TZ = zone;
        expect(ageYearsOn("2000-03-01", "2025-03-01"), zone).toBe(25);
        expect(ageYearsOn("2000-03-01", "2025-02-28"), zone).toBe(24);
      }
    } finally {
      process.env.TZ = original;
    }
  });

  it("refuses a birth date in the future", () => {
    expect(() => ageYearsOn("2027-01-01", "2026-08-18")).toThrow(RangeError);
  });
});

describe("parseIsoDate", () => {
  it("accepts a real calendar day", () => {
    expect(parseIsoDate("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it.each([
    "2025-02-29", // not a leap year
    "2025-13-01",
    "2025-04-31",
    "2025-00-10",
    "2025-01-00",
  ])("rejects %s, which is not a day", (value) => {
    expect(() => parseIsoDate(value)).toThrow(RangeError);
  });

  it.each(["14/03/1995", "1995-3-14", "1995-03-14T00:00:00Z", "", "yesterday"])(
    "rejects %s, which is not the format",
    (value) => {
      expect(() => parseIsoDate(value)).toThrow(RangeError);
    },
  );
});
