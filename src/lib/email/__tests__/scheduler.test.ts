import { describe, it, expect, vi } from "vitest";

// Mock prisma to avoid DATABASE_URL requirement
vi.mock("@/lib/prisma", () => ({
  prisma: {},
}));

import { calculateEmailSendTime } from "../scheduler";

describe("calculateEmailSendTime", () => {
  describe("default behavior (5 AM on departure day)", () => {
    it("schedules for 5 AM local time on departure day", () => {
      const result = calculateEmailSendTime(
        "2026-01-20T09:00:00", // 9 AM departure
        "America/Los_Angeles"
      );

      // 5 AM PST = 13:00 UTC (PST is UTC-8)
      expect(result.sendAt.toISOString()).toBe("2026-01-20T13:00:00.000Z");
      expect(result.isNightBefore).toBe(false);
    });

    it("handles London timezone", () => {
      const result = calculateEmailSendTime(
        "2026-01-20T14:00:00", // 2 PM departure
        "Europe/London"
      );

      // 5 AM GMT = 05:00 UTC (GMT is UTC+0 in January)
      expect(result.sendAt.toISOString()).toBe("2026-01-20T05:00:00.000Z");
      expect(result.isNightBefore).toBe(false);
    });

    it("handles Tokyo timezone", () => {
      const result = calculateEmailSendTime(
        "2026-01-20T10:00:00", // 10 AM departure
        "Asia/Tokyo"
      );

      // 5 AM JST = 20:00 UTC previous day (JST is UTC+9)
      expect(result.sendAt.toISOString()).toBe("2026-01-19T20:00:00.000Z");
      expect(result.isNightBefore).toBe(false);
    });

    it("handles New York timezone", () => {
      const result = calculateEmailSendTime(
        "2026-01-20T08:00:00", // 8 AM departure
        "America/New_York"
      );

      // 5 AM EST = 10:00 UTC (EST is UTC-5)
      expect(result.sendAt.toISOString()).toBe("2026-01-20T10:00:00.000Z");
      expect(result.isNightBefore).toBe(false);
    });
  });

  describe("with first intervention time", () => {
    it("keeps 5 AM when first intervention is late enough (>3h notice)", () => {
      const result = calculateEmailSendTime(
        "2026-01-20T14:00:00", // 2 PM departure
        "America/Los_Angeles",
        "09:00" // First intervention at 9 AM (4h after 5 AM)
      );

      // 5 AM PST = 13:00 UTC
      expect(result.sendAt.toISOString()).toBe("2026-01-20T13:00:00.000Z");
      expect(result.isNightBefore).toBe(false);
    });

    it("keeps 5 AM when first intervention is exactly 3h after", () => {
      const result = calculateEmailSendTime(
        "2026-01-20T14:00:00",
        "America/Los_Angeles",
        "08:00" // First intervention at 8 AM (3h after 5 AM)
      );

      // 3h is the minimum, so stays at 5 AM
      expect(result.sendAt.toISOString()).toBe("2026-01-20T13:00:00.000Z");
      expect(result.isNightBefore).toBe(false);
    });

    it("falls back to 7 PM night before when <3h notice", () => {
      const result = calculateEmailSendTime(
        "2026-01-20T08:00:00", // 8 AM departure
        "America/Los_Angeles",
        "07:00" // First intervention at 7 AM (only 2h after 5 AM)
      );

      // 7 PM PST on Jan 19 = 03:00 UTC on Jan 20 (PST is UTC-8)
      expect(result.sendAt.toISOString()).toBe("2026-01-20T03:00:00.000Z");
      expect(result.isNightBefore).toBe(true);
    });

    it("falls back when first intervention is at 6 AM", () => {
      const result = calculateEmailSendTime(
        "2026-01-20T10:00:00",
        "America/New_York",
        "06:00" // Only 1h after 5 AM
      );

      // 7 PM EST on Jan 19 = 00:00 UTC on Jan 20 (EST is UTC-5)
      expect(result.sendAt.toISOString()).toBe("2026-01-20T00:00:00.000Z");
      expect(result.isNightBefore).toBe(true);
    });

    it("falls back when first intervention is at 5 AM", () => {
      const result = calculateEmailSendTime(
        "2026-01-20T09:00:00",
        "Europe/London",
        "05:00" // Same as send time (0h notice)
      );

      // 7 PM GMT on Jan 19 = 19:00 UTC
      expect(result.sendAt.toISOString()).toBe("2026-01-19T19:00:00.000Z");
      expect(result.isNightBefore).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles early morning departure (before 5 AM)", () => {
      const result = calculateEmailSendTime(
        "2026-01-20T04:00:00", // 4 AM departure
        "America/Los_Angeles"
      );

      // Still schedules 5 AM on departure day
      // 5 AM PST = 13:00 UTC
      expect(result.sendAt.toISOString()).toBe("2026-01-20T13:00:00.000Z");
      expect(result.isNightBefore).toBe(false);
    });

    it("handles midnight departure", () => {
      const result = calculateEmailSendTime(
        "2026-01-20T00:00:00", // Midnight departure
        "America/Los_Angeles"
      );

      // 5 AM PST on Jan 20 = 13:00 UTC
      expect(result.sendAt.toISOString()).toBe("2026-01-20T13:00:00.000Z");
      expect(result.isNightBefore).toBe(false);
    });

    it("handles late night departure (23:00)", () => {
      const result = calculateEmailSendTime(
        "2026-01-20T23:00:00", // 11 PM departure
        "America/Los_Angeles"
      );

      // 5 AM PST = 13:00 UTC
      expect(result.sendAt.toISOString()).toBe("2026-01-20T13:00:00.000Z");
      expect(result.isNightBefore).toBe(false);
    });

    it("handles timezone with 30-minute offset (India)", () => {
      const result = calculateEmailSendTime(
        "2026-01-20T12:00:00", // Noon departure
        "Asia/Kolkata"
      );

      // 5 AM IST = 23:30 UTC previous day (IST is UTC+5:30)
      expect(result.sendAt.toISOString()).toBe("2026-01-19T23:30:00.000Z");
      expect(result.isNightBefore).toBe(false);
    });

    it("handles timezone with 45-minute offset (Nepal)", () => {
      const result = calculateEmailSendTime(
        "2026-01-20T10:00:00",
        "Asia/Kathmandu"
      );

      // 5 AM NPT = 23:15 UTC previous day (NPT is UTC+5:45)
      expect(result.sendAt.toISOString()).toBe("2026-01-19T23:15:00.000Z");
      expect(result.isNightBefore).toBe(false);
    });
  });

  describe("DST transitions", () => {
    it("handles departure during US summer time", () => {
      // July 20, 2026 - PDT (UTC-7)
      const result = calculateEmailSendTime(
        "2026-07-20T10:00:00",
        "America/Los_Angeles"
      );

      // 5 AM PDT = 12:00 UTC (PDT is UTC-7)
      expect(result.sendAt.toISOString()).toBe("2026-07-20T12:00:00.000Z");
      expect(result.isNightBefore).toBe(false);
    });

    it("handles departure during UK summer time", () => {
      // July 20, 2026 - BST (UTC+1)
      const result = calculateEmailSendTime(
        "2026-07-20T14:00:00",
        "Europe/London"
      );

      // 5 AM BST = 04:00 UTC (BST is UTC+1)
      expect(result.sendAt.toISOString()).toBe("2026-07-20T04:00:00.000Z");
      expect(result.isNightBefore).toBe(false);
    });

    it("handles night-before fallback during summer time", () => {
      // July 20, 2026 - PDT
      const result = calculateEmailSendTime(
        "2026-07-20T08:00:00",
        "America/Los_Angeles",
        "06:30" // 1.5h after 5 AM
      );

      // 7 PM PDT on July 19 = 02:00 UTC on July 20 (PDT is UTC-7)
      expect(result.sendAt.toISOString()).toBe("2026-07-20T02:00:00.000Z");
      expect(result.isNightBefore).toBe(true);
    });
  });

  describe("international date line scenarios", () => {
    it("handles Auckland timezone (UTC+13 in summer)", () => {
      // January is summer in New Zealand (NZDT = UTC+13)
      const result = calculateEmailSendTime(
        "2026-01-20T10:00:00",
        "Pacific/Auckland"
      );

      // 5 AM NZDT = 16:00 UTC previous day (NZDT is UTC+13)
      expect(result.sendAt.toISOString()).toBe("2026-01-19T16:00:00.000Z");
      expect(result.isNightBefore).toBe(false);
    });

    it("handles Honolulu timezone (UTC-10)", () => {
      const result = calculateEmailSendTime(
        "2026-01-20T09:00:00",
        "Pacific/Honolulu"
      );

      // 5 AM HST = 15:00 UTC (HST is UTC-10)
      expect(result.sendAt.toISOString()).toBe("2026-01-20T15:00:00.000Z");
      expect(result.isNightBefore).toBe(false);
    });
  });
});
