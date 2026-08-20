import { afterEach, describe, expect, it } from "vitest";

import { calendarDate, daysBetween, todayIsoDate } from "./date";

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

describe("calendarDate", () => {
  it("lands on the day the string names, not the day before", () => {
    // `new Date("2026-08-19")` is UTC midnight, which in São Paulo is 21:00 on
    // the 18th — so the log would print every entry one day early.
    process.env.TZ = "America/Sao_Paulo";
    const date = calendarDate("2026-08-19");

    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(19);
    expect(new Date("2026-08-19").getDate()).toBe(18);
  });

  it("lands on the same day east of UTC", () => {
    process.env.TZ = "Pacific/Kiritimati";

    expect(calendarDate("2026-08-19").getDate()).toBe(19);
  });

  it("puts it at local midnight, so no formatter can round it away", () => {
    process.env.TZ = "America/Sao_Paulo";
    const date = calendarDate("2026-08-19");

    expect([date.getHours(), date.getMinutes()]).toEqual([0, 0]);
  });
});

describe("daysBetween", () => {
  it("counts the days from one calendar day to another", () => {
    expect(daysBetween("2026-08-01", "2026-08-08")).toBe(7);
  });

  it("goes negative backwards", () => {
    expect(daysBetween("2026-08-08", "2026-08-01")).toBe(-7);
  });

  it("is zero for the same day", () => {
    expect(daysBetween("2026-08-08", "2026-08-08")).toBe(0);
  });

  it("crosses a month and a leap day without drifting", () => {
    expect(daysBetween("2028-02-27", "2028-03-01")).toBe(3);
  });

  it("returns whole days across a daylight saving change", () => {
    // The clocks moving makes one local day 23 hours long, and subtracting two
    // local `Date`s across it yields 6.958… — a week the moving average would
    // then measure with a fraction of a day.
    process.env.TZ = "America/New_York";

    expect(daysBetween("2026-03-05", "2026-03-12")).toBe(7);
  });
});
