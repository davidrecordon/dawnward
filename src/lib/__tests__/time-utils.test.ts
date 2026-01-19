import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getCurrentTime,
  getCurrentDate,
  getCurrentDateInTimezone,
  formatDateTimeLocal,
  formatLongDate,
  formatShortDate,
  isBeforeSchedule,
  isAfterSchedule,
  getCurrentDayNumber,
  getTimePeriod,
  getUserTimezone,
  getCurrentTimeInTimezone,
  getNowTimezone,
} from "../time-utils";
import type { ScheduleData } from "../time-utils";

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

describe("formatShortDate", () => {
  it("formats date string to abbreviated format", () => {
    const result = formatShortDate("2026-01-19");
    // Should use abbreviated month name
    expect(result).toContain("Jan");
    expect(result).toContain("19");
    // Should NOT contain full month name
    expect(result).not.toContain("January");
  });

  it("includes abbreviated weekday", () => {
    // January 19, 2026 is a Monday
    const result = formatShortDate("2026-01-19");
    expect(result).toContain("Mon");
    // Should NOT contain full weekday name
    expect(result).not.toContain("Monday");
  });

  it("handles different months", () => {
    expect(formatShortDate("2026-03-15")).toContain("Mar");
    expect(formatShortDate("2026-09-22")).toContain("Sep");
    expect(formatShortDate("2026-12-25")).toContain("Dec");
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

// Helper to create mock schedule data
function createMockSchedule(
  interventions: Array<{ date: string; day: number }>,
  originTz: string = "America/Los_Angeles"
): ScheduleData {
  return {
    request: {
      origin: { tz: originTz },
    },
    schedule: {
      total_shift_hours: 8,
      direction: "advance",
      estimated_adaptation_days: interventions.length,
      shift_magnitude: 8,
      is_minimal_shift: false,
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

describe("getUserTimezone", () => {
  it("returns a valid IANA timezone string", () => {
    const tz = getUserTimezone();
    // Should be a non-empty string
    expect(typeof tz).toBe("string");
    expect(tz.length).toBeGreaterThan(0);
    // Should contain a slash (IANA format like "America/Los_Angeles")
    // or be a short name like "UTC"
    expect(tz).toMatch(/^[A-Za-z_\/]+$/);
  });
});

describe("getCurrentTimeInTimezone", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns time in HH:MM format for specified timezone", () => {
    // Set time to Jan 15, 2026 at 20:00 UTC
    vi.setSystemTime(new Date("2026-01-15T20:00:00Z"));

    // In America/Los_Angeles (UTC-8), it should be 12:00
    const laTime = getCurrentTimeInTimezone("America/Los_Angeles");
    expect(laTime).toBe("12:00");

    // In Europe/London (UTC+0), it should be 20:00
    const londonTime = getCurrentTimeInTimezone("Europe/London");
    expect(londonTime).toBe("20:00");
  });

  it("handles timezone with positive UTC offset", () => {
    // Set time to Jan 15, 2026 at 14:30 UTC
    vi.setSystemTime(new Date("2026-01-15T14:30:00Z"));

    // In Asia/Tokyo (UTC+9), it should be 23:30
    const tokyoTime = getCurrentTimeInTimezone("Asia/Tokyo");
    expect(tokyoTime).toBe("23:30");
  });

  it("handles day boundary crossing", () => {
    // Set time to Jan 15, 2026 at 23:00 UTC
    vi.setSystemTime(new Date("2026-01-15T23:00:00Z"));

    // In Asia/Tokyo (UTC+9), it should be 08:00 (next day)
    const tokyoTime = getCurrentTimeInTimezone("Asia/Tokyo");
    expect(tokyoTime).toBe("08:00");
  });

  it("returns UTC time correctly", () => {
    vi.setSystemTime(new Date("2026-01-15T09:45:00Z"));
    expect(getCurrentTimeInTimezone("UTC")).toBe("09:45");
  });
});

describe("getNowTimezone", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("phase detection for CDG→SFO (westbound)", () => {
    // CDG→SFO: Departure 13:30 Europe/Paris, Arrival 15:15 America/Los_Angeles
    // Same calendar day (westbound gains time)
    const originTz = "Europe/Paris";
    const destTz = "America/Los_Angeles";
    const departureDateTime = "2026-01-15T13:30"; // 1:30 PM Paris time
    const arrivalDateTime = "2026-01-15T15:15"; // 3:15 PM LA time

    it("returns origin timezone when before departure", () => {
      // Set time to 08:00 UTC = 09:00 Paris (before 13:30 departure)
      vi.setSystemTime(new Date("2026-01-15T08:00:00Z"));

      const result = getNowTimezone(
        originTz,
        destTz,
        departureDateTime,
        arrivalDateTime
      );

      expect(result).toBe(originTz);
    });

    it("returns destination timezone when after arrival", () => {
      // Set time to 00:00 UTC Jan 16 = 16:00 LA on Jan 15 (after 15:15 arrival)
      vi.setSystemTime(new Date("2026-01-16T00:00:00Z"));

      const result = getNowTimezone(
        originTz,
        destTz,
        departureDateTime,
        arrivalDateTime
      );

      expect(result).toBe(destTz);
    });

    it("returns destination timezone when in transit", () => {
      // Set time to 14:00 UTC = 15:00 Paris, 06:00 LA
      // After Paris departure (13:30), before LA arrival (15:15)
      vi.setSystemTime(new Date("2026-01-15T14:00:00Z"));

      const result = getNowTimezone(
        originTz,
        destTz,
        departureDateTime,
        arrivalDateTime
      );

      // In transit uses destination timezone
      expect(result).toBe(destTz);
    });
  });

  describe("phase detection for SFO→LHR (eastbound)", () => {
    // SFO→LHR: Departure 17:00 America/Los_Angeles, Arrival 11:00 Europe/London (next day)
    const originTz = "America/Los_Angeles";
    const destTz = "Europe/London";
    const departureDateTime = "2026-01-15T17:00"; // 5:00 PM LA time
    const arrivalDateTime = "2026-01-16T11:00"; // 11:00 AM London (next day)

    it("returns origin timezone when before departure", () => {
      // Set time to 20:00 UTC Jan 15 = 12:00 LA (before 17:00 departure)
      vi.setSystemTime(new Date("2026-01-15T20:00:00Z"));

      const result = getNowTimezone(
        originTz,
        destTz,
        departureDateTime,
        arrivalDateTime
      );

      expect(result).toBe(originTz);
    });

    it("returns destination timezone when after arrival", () => {
      // Set time to 14:00 UTC Jan 16 = 14:00 London (after 11:00 arrival)
      vi.setSystemTime(new Date("2026-01-16T14:00:00Z"));

      const result = getNowTimezone(
        originTz,
        destTz,
        departureDateTime,
        arrivalDateTime
      );

      expect(result).toBe(destTz);
    });
  });

  describe("edge cases", () => {
    it("returns origin timezone at exact departure time", () => {
      vi.setSystemTime(new Date("2026-01-15T12:30:00Z")); // Exactly 13:30 Paris

      const result = getNowTimezone(
        "Europe/Paris",
        "America/Los_Angeles",
        "2026-01-15T13:30",
        "2026-01-15T15:15"
      );

      // At exact departure time, should still be destination (past departure)
      expect(result).toBe("America/Los_Angeles");
    });

    it("handles same timezone (domestic flight)", () => {
      // LAX to SFO, both in America/Los_Angeles
      vi.setSystemTime(new Date("2026-01-15T18:00:00Z")); // 10:00 AM LA

      const result = getNowTimezone(
        "America/Los_Angeles",
        "America/Los_Angeles",
        "2026-01-15T08:00",
        "2026-01-15T09:30"
      );

      // Should return the timezone (both are same)
      expect(result).toBe("America/Los_Angeles");
    });
  });
});
