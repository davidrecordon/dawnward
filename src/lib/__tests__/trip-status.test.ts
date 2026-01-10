import { describe, it, expect } from "vitest";
import { getTripStatus } from "../trip-status";

describe("getTripStatus", () => {
  // Use a fixed "now" date for deterministic tests
  const now = new Date("2025-01-10T12:00:00");

  describe("future trips", () => {
    it('returns "in X days" for trips more than 1 day away', () => {
      const departure = "2025-01-15T10:00:00";
      const status = getTripStatus(departure, now);

      expect(status.label).toBe("in 5 days");
      expect(status.isUpcoming).toBe(true);
      expect(status.isPast).toBe(false);
    });

    it('returns "in 2 days" for trip 2 days away', () => {
      const departure = "2025-01-12T10:00:00";
      const status = getTripStatus(departure, now);

      expect(status.label).toBe("in 2 days");
      expect(status.isUpcoming).toBe(true);
      expect(status.isPast).toBe(false);
    });

    it('returns "tomorrow" for trip 1 day away', () => {
      const departure = "2025-01-11T10:00:00";
      const status = getTripStatus(departure, now);

      expect(status.label).toBe("tomorrow");
      expect(status.isUpcoming).toBe(true);
      expect(status.isPast).toBe(false);
    });

    it('returns "today" for trip on same day', () => {
      const departure = "2025-01-10T18:00:00";
      const status = getTripStatus(departure, now);

      expect(status.label).toBe("today");
      expect(status.isUpcoming).toBe(true);
      expect(status.isPast).toBe(false);
    });
  });

  describe("past trips", () => {
    it('returns "yesterday" for trip 1 day ago', () => {
      const departure = "2025-01-09T10:00:00";
      const status = getTripStatus(departure, now);

      expect(status.label).toBe("yesterday");
      expect(status.isUpcoming).toBe(false);
      expect(status.isPast).toBe(true);
    });

    it('returns "X days ago" for trips more than 1 day ago', () => {
      const departure = "2025-01-05T10:00:00";
      const status = getTripStatus(departure, now);

      expect(status.label).toBe("5 days ago");
      expect(status.isUpcoming).toBe(false);
      expect(status.isPast).toBe(true);
    });

    it('returns "30 days ago" for trip a month ago', () => {
      const departure = "2024-12-11T10:00:00";
      const status = getTripStatus(departure, now);

      expect(status.label).toBe("30 days ago");
      expect(status.isUpcoming).toBe(false);
      expect(status.isPast).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles trip just under 24 hours away as today", () => {
      // 11 hours from now
      const departure = "2025-01-10T23:00:00";
      const status = getTripStatus(departure, now);

      expect(status.label).toBe("today");
      expect(status.isUpcoming).toBe(true);
    });

    it("handles trip just over 24 hours away as tomorrow", () => {
      // 25 hours from now
      const departure = "2025-01-11T13:00:00";
      const status = getTripStatus(departure, now);

      expect(status.label).toBe("tomorrow");
      expect(status.isUpcoming).toBe(true);
    });

    it("uses current time when no now parameter provided", () => {
      // Trip far in the future should always be upcoming
      const departure = "2030-01-01T10:00:00";
      const status = getTripStatus(departure);

      expect(status.isUpcoming).toBe(true);
      expect(status.isPast).toBe(false);
    });
  });
});
