import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getCurrentTime,
  getCurrentDate,
  getCurrentDateInTimezone,
  formatDateTimeLocal,
  formatLongDate,
  isBeforeSchedule,
  isAfterSchedule,
  getCurrentDayNumber,
  getTimePeriod,
} from "../time-utils";
import type { StoredSchedule } from "@/types/schedule";

describe("getCurrentTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns time in HH:MM format", () => {
    vi.setSystemTime(new Date("2026-01-15T14:30:00"));
    expect(getCurrentTime()).toBe("14:30");
  });

  it("pads single digit hours", () => {
    vi.setSystemTime(new Date("2026-01-15T09:05:00"));
    expect(getCurrentTime()).toBe("09:05");
  });

  it("handles midnight", () => {
    vi.setSystemTime(new Date("2026-01-15T00:00:00"));
    expect(getCurrentTime()).toBe("00:00");
  });

  it("handles 23:59", () => {
    vi.setSystemTime(new Date("2026-01-15T23:59:00"));
    expect(getCurrentTime()).toBe("23:59");
  });
});

describe("getCurrentDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns date in YYYY-MM-DD format", () => {
    vi.setSystemTime(new Date("2026-01-15T14:30:00"));
    expect(getCurrentDate()).toBe("2026-01-15");
  });

  it("pads single digit months and days", () => {
    vi.setSystemTime(new Date("2026-05-03T14:30:00"));
    expect(getCurrentDate()).toBe("2026-05-03");
  });
});

describe("getCurrentDateInTimezone", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns date in specified timezone", () => {
    // Set time to Jan 15, 2026 at 23:00 UTC
    // In America/Los_Angeles (UTC-8), it's still Jan 15 at 15:00
    // In Asia/Tokyo (UTC+9), it's already Jan 16 at 08:00
    vi.setSystemTime(new Date("2026-01-15T23:00:00Z"));

    expect(getCurrentDateInTimezone("America/Los_Angeles")).toBe("2026-01-15");
    expect(getCurrentDateInTimezone("Asia/Tokyo")).toBe("2026-01-16");
  });

  it("handles UTC", () => {
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
    expect(getCurrentDateInTimezone("UTC")).toBe("2026-01-15");
  });
});

describe("formatDateTimeLocal", () => {
  it("formats a Date object correctly", () => {
    const date = new Date(2026, 0, 15, 14, 30); // Jan 15, 2026 14:30
    expect(formatDateTimeLocal(date)).toBe("2026-01-15T14:30");
  });

  it("pads single digit values", () => {
    const date = new Date(2026, 4, 3, 9, 5); // May 3, 2026 09:05
    expect(formatDateTimeLocal(date)).toBe("2026-05-03T09:05");
  });

  it("handles midnight", () => {
    const date = new Date(2026, 0, 1, 0, 0); // Jan 1, 2026 00:00
    expect(formatDateTimeLocal(date)).toBe("2026-01-01T00:00");
  });
});

describe("formatLongDate", () => {
  it("formats date string to long readable format", () => {
    const result = formatLongDate("2026-01-19");
    // This will be locale-dependent; check structure
    expect(result).toContain("January");
    expect(result).toContain("19");
  });

  it("includes weekday", () => {
    // January 19, 2026 is a Monday
    const result = formatLongDate("2026-01-19");
    expect(result).toContain("Monday");
  });
});

describe("getTimePeriod", () => {
  it("returns morning for 5:00-11:59", () => {
    expect(getTimePeriod("05:00")).toBe("morning");
    expect(getTimePeriod("08:30")).toBe("morning");
    expect(getTimePeriod("11:59")).toBe("morning");
  });

  it("returns afternoon for 12:00-16:59", () => {
    expect(getTimePeriod("12:00")).toBe("afternoon");
    expect(getTimePeriod("14:30")).toBe("afternoon");
    expect(getTimePeriod("16:59")).toBe("afternoon");
  });

  it("returns evening for 17:00-20:59", () => {
    expect(getTimePeriod("17:00")).toBe("evening");
    expect(getTimePeriod("19:00")).toBe("evening");
    expect(getTimePeriod("20:59")).toBe("evening");
  });

  it("returns night for 21:00-4:59", () => {
    expect(getTimePeriod("21:00")).toBe("night");
    expect(getTimePeriod("23:59")).toBe("night");
    expect(getTimePeriod("00:00")).toBe("night");
    expect(getTimePeriod("04:59")).toBe("night");
  });
});

// Helper to create mock schedule
function createMockSchedule(
  interventions: Array<{ date: string; day: number }>,
  originTz: string = "America/Los_Angeles"
): StoredSchedule {
  return {
    id: "test-id",
    createdAt: "2026-01-10T12:00:00Z",
    request: {
      origin: { code: "SFO", name: "San Francisco", city: "San Francisco", country: "US", tz: originTz },
      destination: { code: "LHR", name: "Heathrow", city: "London", country: "GB", tz: "Europe/London" },
      departureDateTime: "2026-01-20T20:00",
      arrivalDateTime: "2026-01-21T14:00",
      prepDays: 3,
      wakeTime: "07:00",
      sleepTime: "23:00",
      usesMelatonin: true,
      usesCaffeine: true,
      usesExercise: false,
      napPreference: "flight_only",
    },
    schedule: {
      total_shift_hours: 8,
      direction: "advance",
      estimated_adaptation_days: interventions.length,
      interventions: interventions.map((i) => ({
        date: i.date,
        day: i.day,
        items: [],
      })),
    },
  };
}

describe("isBeforeSchedule", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true when today is before schedule start", () => {
    // Set time in UTC, but schedule uses America/Los_Angeles
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z")); // Jan 15 in LA

    const schedule = createMockSchedule([
      { date: "2026-01-18", day: -2 },
      { date: "2026-01-19", day: -1 },
      { date: "2026-01-20", day: 0 },
    ]);

    expect(isBeforeSchedule(schedule)).toBe(true);
  });

  it("returns false when today is on schedule", () => {
    vi.setSystemTime(new Date("2026-01-18T20:00:00Z")); // Jan 18 in LA

    const schedule = createMockSchedule([
      { date: "2026-01-18", day: -2 },
      { date: "2026-01-19", day: -1 },
      { date: "2026-01-20", day: 0 },
    ]);

    expect(isBeforeSchedule(schedule)).toBe(false);
  });

  it("returns false when today is after schedule", () => {
    vi.setSystemTime(new Date("2026-01-25T12:00:00Z"));

    const schedule = createMockSchedule([
      { date: "2026-01-18", day: -2 },
      { date: "2026-01-19", day: -1 },
      { date: "2026-01-20", day: 0 },
    ]);

    expect(isBeforeSchedule(schedule)).toBe(false);
  });
});

describe("isAfterSchedule", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true when today is after schedule end", () => {
    vi.setSystemTime(new Date("2026-01-25T12:00:00Z"));

    const schedule = createMockSchedule([
      { date: "2026-01-18", day: -2 },
      { date: "2026-01-19", day: -1 },
      { date: "2026-01-20", day: 0 },
    ]);

    expect(isAfterSchedule(schedule)).toBe(true);
  });

  it("returns false when today is on schedule", () => {
    vi.setSystemTime(new Date("2026-01-19T12:00:00Z"));

    const schedule = createMockSchedule([
      { date: "2026-01-18", day: -2 },
      { date: "2026-01-19", day: -1 },
      { date: "2026-01-20", day: 0 },
    ]);

    expect(isAfterSchedule(schedule)).toBe(false);
  });

  it("returns false when today is before schedule", () => {
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));

    const schedule = createMockSchedule([
      { date: "2026-01-18", day: -2 },
      { date: "2026-01-19", day: -1 },
      { date: "2026-01-20", day: 0 },
    ]);

    expect(isAfterSchedule(schedule)).toBe(false);
  });
});

describe("getCurrentDayNumber", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns day number when today is a schedule day", () => {
    vi.setSystemTime(new Date("2026-01-19T20:00:00Z")); // Jan 19 in LA

    const schedule = createMockSchedule([
      { date: "2026-01-18", day: -2 },
      { date: "2026-01-19", day: -1 },
      { date: "2026-01-20", day: 0 },
    ]);

    expect(getCurrentDayNumber(schedule)).toBe(-1);
  });

  it("returns null when today is not a schedule day", () => {
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));

    const schedule = createMockSchedule([
      { date: "2026-01-18", day: -2 },
      { date: "2026-01-19", day: -1 },
      { date: "2026-01-20", day: 0 },
    ]);

    expect(getCurrentDayNumber(schedule)).toBe(null);
  });

  it("returns 0 for flight day", () => {
    vi.setSystemTime(new Date("2026-01-20T20:00:00Z")); // Jan 20 in LA

    const schedule = createMockSchedule([
      { date: "2026-01-18", day: -2 },
      { date: "2026-01-19", day: -1 },
      { date: "2026-01-20", day: 0 },
    ]);

    expect(getCurrentDayNumber(schedule)).toBe(0);
  });
});
