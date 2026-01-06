import { describe, it, expect } from "vitest";
import {
  calculateTimeShift,
  formatTimeShift,
  calculateFlightDuration,
  formatDuration,
} from "../timezone-utils";

describe("calculateTimeShift", () => {
  it("calculates positive shift for eastward travel", () => {
    // SFO (UTC-8) to London (UTC+0) = +8 hours
    const shift = calculateTimeShift(
      "America/Los_Angeles",
      "Europe/London",
      new Date("2026-01-15T12:00:00Z") // Winter, no DST
    );
    expect(shift).toBe(8);
  });

  it("calculates negative shift for westward travel", () => {
    // London (UTC+0) to SFO (UTC-8) = -8 hours
    const shift = calculateTimeShift(
      "Europe/London",
      "America/Los_Angeles",
      new Date("2026-01-15T12:00:00Z")
    );
    expect(shift).toBe(-8);
  });

  it("returns 0 for same timezone", () => {
    const shift = calculateTimeShift(
      "America/Los_Angeles",
      "America/Los_Angeles"
    );
    expect(shift).toBe(0);
  });

  it("handles Tokyo (UTC+9)", () => {
    // SFO (UTC-8) to Tokyo (UTC+9) = +17 hours
    const shift = calculateTimeShift(
      "America/Los_Angeles",
      "Asia/Tokyo",
      new Date("2026-01-15T12:00:00Z")
    );
    expect(shift).toBe(17);
  });

  it("handles India (UTC+5:30) half-hour offset", () => {
    // UTC to India (UTC+5:30) = +5.5 hours
    const shift = calculateTimeShift(
      "UTC",
      "Asia/Kolkata",
      new Date("2026-01-15T12:00:00Z")
    );
    expect(shift).toBe(5.5);
  });

  it("handles Nepal (UTC+5:45) quarter-hour offset", () => {
    // UTC to Nepal (UTC+5:45) = +5.75 hours
    const shift = calculateTimeShift(
      "UTC",
      "Asia/Kathmandu",
      new Date("2026-01-15T12:00:00Z")
    );
    expect(shift).toBe(5.75);
  });

  it("handles Australia with half-hour offset", () => {
    // UTC to Adelaide (UTC+10:30 in summer, UTC+9:30 in winter)
    const shift = calculateTimeShift(
      "UTC",
      "Australia/Adelaide",
      new Date("2026-01-15T12:00:00Z") // January = summer in Australia
    );
    // Summer time: UTC+10:30
    expect(shift).toBe(10.5);
  });
});

describe("formatTimeShift", () => {
  it("formats positive whole hours", () => {
    expect(formatTimeShift(8)).toBe("+8h");
    expect(formatTimeShift(12)).toBe("+12h");
  });

  it("formats negative whole hours", () => {
    expect(formatTimeShift(-8)).toBe("-8h");
    expect(formatTimeShift(-5)).toBe("-5h");
  });

  it("formats zero as positive", () => {
    expect(formatTimeShift(0)).toBe("+0h");
  });

  it("formats half hours", () => {
    expect(formatTimeShift(5.5)).toBe("+5.5h");
    expect(formatTimeShift(-3.5)).toBe("-3.5h");
  });

  it("rounds to nearest half hour", () => {
    // Math.round(5.75 * 2) / 2 = 12 / 2 = 6
    expect(formatTimeShift(5.75)).toBe("+6h");
    // Math.round(5.25 * 2) / 2 = 11 / 2 = 5.5
    expect(formatTimeShift(5.25)).toBe("+5.5h");
    // Math.round(5.4 * 2) / 2 = 11 / 2 = 5.5
    expect(formatTimeShift(5.4)).toBe("+5.5h");
    // Math.round(5.1 * 2) / 2 = 10 / 2 = 5
    expect(formatTimeShift(5.1)).toBe("+5h");
  });
});

describe("calculateFlightDuration", () => {
  it("calculates duration for SFO to London flight", () => {
    // Depart SFO 8:45pm local, arrive London 3:15pm local next day
    // SFO is UTC-8, London is UTC+0
    // 8:45pm PST = 4:45am UTC next day
    // 3:15pm GMT = 3:15pm UTC
    // Duration: ~10.5 hours
    const result = calculateFlightDuration(
      "2026-01-20T20:45",
      "2026-01-21T15:15",
      "America/Los_Angeles",
      "Europe/London"
    );

    expect(result).not.toBeNull();
    expect(result!.hours).toBe(10);
    expect(result!.minutes).toBe(30);
  });

  it("calculates duration for same timezone", () => {
    const result = calculateFlightDuration(
      "2026-01-20T10:00",
      "2026-01-20T12:30",
      "America/New_York",
      "America/New_York"
    );

    expect(result).not.toBeNull();
    expect(result!.hours).toBe(2);
    expect(result!.minutes).toBe(30);
  });

  it("handles westward flight (NY to LA)", () => {
    // NY (UTC-5) to LA (UTC-8)
    // Depart NY 8:00am, arrive LA 11:00am (same day)
    // Duration should be 6 hours (not 3)
    const result = calculateFlightDuration(
      "2026-01-20T08:00",
      "2026-01-20T11:00",
      "America/New_York",
      "America/Los_Angeles"
    );

    expect(result).not.toBeNull();
    expect(result!.hours).toBe(6);
    expect(result!.minutes).toBe(0);
  });

  it("handles eastward flight (LA to NY)", () => {
    // LA (UTC-8) to NY (UTC-5)
    // Depart LA 8:00am, arrive NY 4:00pm (same day)
    // Duration should be 5 hours
    const result = calculateFlightDuration(
      "2026-01-20T08:00",
      "2026-01-20T16:00",
      "America/Los_Angeles",
      "America/New_York"
    );

    expect(result).not.toBeNull();
    expect(result!.hours).toBe(5);
    expect(result!.minutes).toBe(0);
  });

  it("returns null for empty departure", () => {
    const result = calculateFlightDuration(
      "",
      "2026-01-21T15:15",
      "America/Los_Angeles",
      "Europe/London"
    );
    expect(result).toBeNull();
  });

  it("returns null for empty arrival", () => {
    const result = calculateFlightDuration(
      "2026-01-20T20:45",
      "",
      "America/Los_Angeles",
      "Europe/London"
    );
    expect(result).toBeNull();
  });

  it("returns null for negative duration (arrival before departure)", () => {
    const result = calculateFlightDuration(
      "2026-01-21T20:45",
      "2026-01-20T15:15",
      "America/Los_Angeles",
      "Europe/London"
    );
    expect(result).toBeNull();
  });

  it("handles overnight flights within same timezone", () => {
    const result = calculateFlightDuration(
      "2026-01-20T22:00",
      "2026-01-21T06:00",
      "America/New_York",
      "America/New_York"
    );

    expect(result).not.toBeNull();
    expect(result!.hours).toBe(8);
    expect(result!.minutes).toBe(0);
  });

  it("handles Tokyo to LA flight crossing date line", () => {
    // Tokyo (UTC+9) to LA (UTC-8) = -17 hours
    // Depart Tokyo 5pm Jan 20, arrive LA 11am Jan 20 (same calendar day!)
    // This is because you "gain" 17 hours going west
    const result = calculateFlightDuration(
      "2026-01-20T17:00",
      "2026-01-20T11:00",
      "Asia/Tokyo",
      "America/Los_Angeles"
    );

    expect(result).not.toBeNull();
    expect(result!.hours).toBe(11);
    expect(result!.minutes).toBe(0);
  });
});

describe("formatDuration", () => {
  it("formats hours only when no minutes", () => {
    expect(formatDuration(5, 0)).toBe("5h");
    expect(formatDuration(12, 0)).toBe("12h");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration(5, 30)).toBe("5h 30m");
    expect(formatDuration(12, 15)).toBe("12h 15m");
  });

  it("formats zero hours with minutes", () => {
    expect(formatDuration(0, 45)).toBe("0h 45m");
  });
});
