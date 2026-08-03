import { describe, it, expect } from "vitest";
import {
  getWeekStart,
  formatWeekLabel,
  toISODate,
  parseISODate,
  getWeekDays,
  combineDateAndTime,
  splitDateTime,
  formatEventTime,
  formatFullDate,
  getMonthStart,
  getMonthGridStart,
  formatMonthLabel,
  formatDayHeading,
  getMonthGridDays,
} from "./dates";

describe("getWeekStart", () => {
  it("returns the same date when given a Sunday", () => {
    // 2026-07-19 is a Sunday.
    expect(toISODate(getWeekStart(new Date(2026, 6, 19)))).toBe("2026-07-19");
  });

  it("rolls back to the preceding Sunday for a mid-week date", () => {
    // 2026-07-24 is a Friday in the same week as 2026-07-19.
    expect(toISODate(getWeekStart(new Date(2026, 6, 24)))).toBe("2026-07-19");
  });
});

describe("formatWeekLabel", () => {
  it("formats a week within a single month", () => {
    expect(formatWeekLabel(new Date(2026, 6, 19))).toBe("Week of July 19 – 25, 2026");
  });

  it("formats a week spanning a month boundary", () => {
    expect(formatWeekLabel(new Date(2026, 6, 26))).toBe("Week of July 26 – August 1, 2026");
  });
});

describe("parseISODate", () => {
  it("parses a valid YYYY-MM-DD string", () => {
    const fallback = new Date(2000, 0, 1);
    const parsed = parseISODate("2026-07-19", fallback);
    expect(toISODate(parsed)).toBe("2026-07-19");
  });

  it("falls back for an invalid or missing value", () => {
    const fallback = new Date(2026, 6, 19);
    expect(parseISODate(undefined, fallback)).toBe(fallback);
    expect(parseISODate("not-a-date", fallback)).toBe(fallback);
  });
});

describe("getWeekDays", () => {
  it("returns 7 days starting from weekStart, with isToday flagged correctly", () => {
    const weekStart = new Date(2026, 6, 19);
    const today = new Date(2026, 6, 24); // Friday
    const days = getWeekDays(weekStart, today);
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.label)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    expect(days.find((d) => d.isToday)?.isoDate).toBe("2026-07-24");
  });
});

describe("combineDateAndTime / formatEventTime", () => {
  it("combines a 12-hour AM time correctly", () => {
    const iso = combineDateAndTime("2026-07-20", "8", "30", "AM");
    expect(iso).toBe("2026-07-20T08:30:00");
    expect(formatEventTime(iso)).toBe("8:30 AM");
  });

  it("combines a 12-hour PM time correctly, including 12 PM noon", () => {
    expect(combineDateAndTime("2026-07-20", "6", "0", "PM")).toBe("2026-07-20T18:00:00");
    expect(combineDateAndTime("2026-07-20", "12", "0", "PM")).toBe("2026-07-20T12:00:00");
  });

  it("handles 12 AM as midnight", () => {
    expect(combineDateAndTime("2026-07-20", "12", "0", "AM")).toBe("2026-07-20T00:00:00");
  });
});

describe("splitDateTime", () => {
  it("is the inverse of combineDateAndTime for AM times", () => {
    const iso = combineDateAndTime("2026-07-20", "8", "30", "AM");
    expect(splitDateTime(iso)).toEqual({ date: "2026-07-20", hour: "8", minute: "30", ampm: "AM" });
  });

  it("is the inverse of combineDateAndTime for PM times", () => {
    const iso = combineDateAndTime("2026-07-20", "6", "0", "PM");
    expect(splitDateTime(iso)).toEqual({ date: "2026-07-20", hour: "6", minute: "00", ampm: "PM" });
  });

  it("round-trips midnight and noon correctly", () => {
    expect(splitDateTime(combineDateAndTime("2026-07-20", "12", "0", "AM")).hour).toBe("12");
    expect(splitDateTime(combineDateAndTime("2026-07-20", "12", "0", "AM")).ampm).toBe("AM");
    expect(splitDateTime(combineDateAndTime("2026-07-20", "12", "0", "PM")).hour).toBe("12");
    expect(splitDateTime(combineDateAndTime("2026-07-20", "12", "0", "PM")).ampm).toBe("PM");
  });
});

describe("formatFullDate", () => {
  it("formats an ISO-ish datetime as 'Mon, Jul 20'", () => {
    expect(formatFullDate("2026-07-20T08:30:00")).toBe("Mon, Jul 20");
  });
});

describe("getMonthStart", () => {
  it("returns the 1st of the month for a mid-month date", () => {
    expect(toISODate(getMonthStart(new Date(2026, 7, 15)))).toBe("2026-08-01");
  });
});

describe("getMonthGridStart", () => {
  it("rolls back to the preceding Sunday when the 1st isn't a Sunday", () => {
    // August 1, 2026 is a Saturday — the grid should start Sunday July 26.
    expect(toISODate(getMonthGridStart(new Date(2026, 7, 15)))).toBe("2026-07-26");
  });

  it("stays on the 1st when it's already a Sunday", () => {
    // November 1, 2026 is a Sunday.
    expect(toISODate(getMonthGridStart(new Date(2026, 10, 15)))).toBe("2026-11-01");
  });
});

describe("formatMonthLabel", () => {
  it("formats as 'August 2026'", () => {
    expect(formatMonthLabel(new Date(2026, 7, 15))).toBe("August 2026");
  });
});

describe("formatDayHeading", () => {
  it("formats as 'Sunday, August 2, 2026'", () => {
    expect(formatDayHeading(new Date(2026, 7, 2))).toBe("Sunday, August 2, 2026");
  });
});

describe("getMonthGridDays", () => {
  it("always returns a fixed 42-cell grid", () => {
    expect(getMonthGridDays(new Date(2026, 7, 15))).toHaveLength(42);
  });

  it("marks leading/trailing days from adjacent months as not the current month", () => {
    const days = getMonthGridDays(new Date(2026, 7, 15));
    expect(days[0]).toMatchObject({ isoDate: "2026-07-26", isCurrentMonth: false });
    expect(days[41]).toMatchObject({ isoDate: "2026-09-05", isCurrentMonth: false });
  });

  it("marks every day actually in the target month as current", () => {
    const days = getMonthGridDays(new Date(2026, 7, 15));
    const augustDays = days.filter((d) => d.isCurrentMonth);
    expect(augustDays).toHaveLength(31);
    expect(augustDays[0]!.isoDate).toBe("2026-08-01");
    expect(augustDays[30]!.isoDate).toBe("2026-08-31");
  });

  it("flags isToday correctly against the given reference date", () => {
    const today = new Date(2026, 7, 10);
    const days = getMonthGridDays(new Date(2026, 7, 15), today);
    expect(days.find((d) => d.isToday)?.isoDate).toBe("2026-08-10");
  });
});
