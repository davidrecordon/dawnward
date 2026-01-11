import { describe, it, expect } from "vitest";
import {
  detectTripDuplicates,
  TripWithPreferences,
} from "../trip-duplicate-detection";

function createTrip(
  overrides: Partial<TripWithPreferences> = {}
): TripWithPreferences {
  return {
    id: "trip-1",
    originTz: "America/Los_Angeles",
    destTz: "Europe/London",
    departureDatetime: "2025-01-15T10:00",
    arrivalDatetime: "2025-01-15T22:00",
    prepDays: 3,
    wakeTime: "07:00",
    sleepTime: "23:00",
    usesMelatonin: true,
    usesCaffeine: true,
    usesExercise: false,
    napPreference: "flight_only",
    scheduleIntensity: "balanced",
    ...overrides,
  };
}

describe("detectTripDuplicates", () => {
  describe("no duplicates", () => {
    it("returns empty map for empty input", () => {
      const result = detectTripDuplicates([]);
      expect(result.size).toBe(0);
    });

    it("returns empty array for single trip", () => {
      const trip = createTrip();
      const result = detectTripDuplicates([trip]);
      expect(result.get(trip.id)).toEqual([]);
    });

    it("returns empty arrays for trips with different routes", () => {
      const trip1 = createTrip({
        id: "trip-1",
        originTz: "America/Los_Angeles",
      });
      const trip2 = createTrip({ id: "trip-2", originTz: "America/New_York" });
      const result = detectTripDuplicates([trip1, trip2]);
      expect(result.get("trip-1")).toEqual([]);
      expect(result.get("trip-2")).toEqual([]);
    });

    it("returns empty arrays for trips with different departure dates", () => {
      const trip1 = createTrip({
        id: "trip-1",
        departureDatetime: "2025-01-15T10:00",
      });
      const trip2 = createTrip({
        id: "trip-2",
        departureDatetime: "2025-01-16T10:00",
      });
      const result = detectTripDuplicates([trip1, trip2]);
      expect(result.get("trip-1")).toEqual([]);
      expect(result.get("trip-2")).toEqual([]);
    });

    it("returns empty arrays for trips with different departure times", () => {
      const trip1 = createTrip({
        id: "trip-1",
        departureDatetime: "2025-01-15T10:00",
      });
      const trip2 = createTrip({
        id: "trip-2",
        departureDatetime: "2025-01-15T14:00",
      });
      const result = detectTripDuplicates([trip1, trip2]);
      expect(result.get("trip-1")).toEqual([]);
      expect(result.get("trip-2")).toEqual([]);
    });

    it("returns empty arrays for trips with different arrival times", () => {
      const trip1 = createTrip({
        id: "trip-1",
        arrivalDatetime: "2025-01-15T22:00",
      });
      const trip2 = createTrip({
        id: "trip-2",
        arrivalDatetime: "2025-01-16T02:00",
      });
      const result = detectTripDuplicates([trip1, trip2]);
      expect(result.get("trip-1")).toEqual([]);
      expect(result.get("trip-2")).toEqual([]);
    });
  });

  describe("exact duplicates", () => {
    it("returns empty arrays when all preferences match", () => {
      const trip1 = createTrip({ id: "trip-1" });
      const trip2 = createTrip({ id: "trip-2" });
      const result = detectTripDuplicates([trip1, trip2]);
      expect(result.get("trip-1")).toEqual([]);
      expect(result.get("trip-2")).toEqual([]);
    });
  });

  describe("single field differences", () => {
    it("detects prepDays differences", () => {
      const trip1 = createTrip({ id: "trip-1", prepDays: 3 });
      const trip2 = createTrip({ id: "trip-2", prepDays: 5 });
      const result = detectTripDuplicates([trip1, trip2]);
      expect(result.get("trip-1")).toEqual(["3 days prep"]);
      expect(result.get("trip-2")).toEqual(["5 days prep"]);
    });

    it("detects wakeTime differences", () => {
      const trip1 = createTrip({ id: "trip-1", wakeTime: "06:00" });
      const trip2 = createTrip({ id: "trip-2", wakeTime: "08:00" });
      const result = detectTripDuplicates([trip1, trip2]);
      expect(result.get("trip-1")).toEqual(["wake 06:00"]);
      expect(result.get("trip-2")).toEqual(["wake 08:00"]);
    });

    it("detects sleepTime differences", () => {
      const trip1 = createTrip({ id: "trip-1", sleepTime: "22:00" });
      const trip2 = createTrip({ id: "trip-2", sleepTime: "23:30" });
      const result = detectTripDuplicates([trip1, trip2]);
      expect(result.get("trip-1")).toEqual(["sleep 22:00"]);
      expect(result.get("trip-2")).toEqual(["sleep 23:30"]);
    });

    it("detects usesMelatonin differences", () => {
      const trip1 = createTrip({ id: "trip-1", usesMelatonin: true });
      const trip2 = createTrip({ id: "trip-2", usesMelatonin: false });
      const result = detectTripDuplicates([trip1, trip2]);
      expect(result.get("trip-1")).toEqual(["melatonin"]);
      expect(result.get("trip-2")).toEqual(["no melatonin"]);
    });

    it("detects usesCaffeine differences", () => {
      const trip1 = createTrip({ id: "trip-1", usesCaffeine: true });
      const trip2 = createTrip({ id: "trip-2", usesCaffeine: false });
      const result = detectTripDuplicates([trip1, trip2]);
      expect(result.get("trip-1")).toEqual(["caffeine"]);
      expect(result.get("trip-2")).toEqual(["no caffeine"]);
    });

    it("detects usesExercise differences", () => {
      const trip1 = createTrip({ id: "trip-1", usesExercise: true });
      const trip2 = createTrip({ id: "trip-2", usesExercise: false });
      const result = detectTripDuplicates([trip1, trip2]);
      expect(result.get("trip-1")).toEqual(["exercise"]);
      expect(result.get("trip-2")).toEqual(["no exercise"]);
    });

    it("detects napPreference differences", () => {
      const trip1 = createTrip({ id: "trip-1", napPreference: "no" });
      const trip2 = createTrip({ id: "trip-2", napPreference: "all_days" });
      const result = detectTripDuplicates([trip1, trip2]);
      expect(result.get("trip-1")).toEqual(["no naps"]);
      expect(result.get("trip-2")).toEqual(["all naps"]);
    });

    it("detects scheduleIntensity differences", () => {
      const trip1 = createTrip({ id: "trip-1", scheduleIntensity: "gentle" });
      const trip2 = createTrip({
        id: "trip-2",
        scheduleIntensity: "aggressive",
      });
      const result = detectTripDuplicates([trip1, trip2]);
      expect(result.get("trip-1")).toEqual(["gentle"]);
      expect(result.get("trip-2")).toEqual(["aggressive"]);
    });
  });

  describe("multiple field differences", () => {
    it("shows all varying fields", () => {
      const trip1 = createTrip({
        id: "trip-1",
        prepDays: 3,
        usesMelatonin: true,
        scheduleIntensity: "gentle",
      });
      const trip2 = createTrip({
        id: "trip-2",
        prepDays: 5,
        usesMelatonin: false,
        scheduleIntensity: "aggressive",
      });
      const result = detectTripDuplicates([trip1, trip2]);
      expect(result.get("trip-1")).toEqual([
        "3 days prep",
        "melatonin",
        "gentle",
      ]);
      expect(result.get("trip-2")).toEqual([
        "5 days prep",
        "no melatonin",
        "aggressive",
      ]);
    });

    it("orders fields consistently", () => {
      const trip1 = createTrip({
        id: "trip-1",
        scheduleIntensity: "gentle",
        prepDays: 3,
        usesCaffeine: true,
      });
      const trip2 = createTrip({
        id: "trip-2",
        scheduleIntensity: "aggressive",
        prepDays: 5,
        usesCaffeine: false,
      });
      const result = detectTripDuplicates([trip1, trip2]);
      // Order should be: prepDays, usesCaffeine, scheduleIntensity
      expect(result.get("trip-1")).toEqual([
        "3 days prep",
        "caffeine",
        "gentle",
      ]);
      expect(result.get("trip-2")).toEqual([
        "5 days prep",
        "no caffeine",
        "aggressive",
      ]);
    });
  });

  describe("three or more duplicates", () => {
    it("shows correct labels for each trip in group of 3", () => {
      const trip1 = createTrip({ id: "trip-1", prepDays: 1 });
      const trip2 = createTrip({ id: "trip-2", prepDays: 3 });
      const trip3 = createTrip({ id: "trip-3", prepDays: 5 });
      const result = detectTripDuplicates([trip1, trip2, trip3]);
      expect(result.get("trip-1")).toEqual(["1 day prep"]);
      expect(result.get("trip-2")).toEqual(["3 days prep"]);
      expect(result.get("trip-3")).toEqual(["5 days prep"]);
    });

    it("handles mixed values (some same, some different)", () => {
      const trip1 = createTrip({
        id: "trip-1",
        prepDays: 3,
        usesMelatonin: true,
      });
      const trip2 = createTrip({
        id: "trip-2",
        prepDays: 3,
        usesMelatonin: false,
      });
      const trip3 = createTrip({
        id: "trip-3",
        prepDays: 5,
        usesMelatonin: true,
      });
      const result = detectTripDuplicates([trip1, trip2, trip3]);
      // Both prepDays and usesMelatonin vary across the group
      expect(result.get("trip-1")).toEqual(["3 days prep", "melatonin"]);
      expect(result.get("trip-2")).toEqual(["3 days prep", "no melatonin"]);
      expect(result.get("trip-3")).toEqual(["5 days prep", "melatonin"]);
    });
  });

  describe("multiple groups", () => {
    it("handles multiple duplicate groups independently", () => {
      // Group 1: LAX -> LHR
      const trip1 = createTrip({
        id: "trip-1",
        originTz: "America/Los_Angeles",
        destTz: "Europe/London",
        prepDays: 3,
      });
      const trip2 = createTrip({
        id: "trip-2",
        originTz: "America/Los_Angeles",
        destTz: "Europe/London",
        prepDays: 5,
      });
      // Group 2: SFO -> NRT
      const trip3 = createTrip({
        id: "trip-3",
        originTz: "America/Los_Angeles",
        destTz: "Asia/Tokyo",
        usesMelatonin: true,
      });
      const trip4 = createTrip({
        id: "trip-4",
        originTz: "America/Los_Angeles",
        destTz: "Asia/Tokyo",
        usesMelatonin: false,
      });

      const result = detectTripDuplicates([trip1, trip2, trip3, trip4]);

      // Group 1 shows prepDays differences
      expect(result.get("trip-1")).toEqual(["3 days prep"]);
      expect(result.get("trip-2")).toEqual(["5 days prep"]);
      // Group 2 shows melatonin differences
      expect(result.get("trip-3")).toEqual(["melatonin"]);
      expect(result.get("trip-4")).toEqual(["no melatonin"]);
    });
  });

  describe("label generation edge cases", () => {
    it("formats prepDays with correct pluralization for 1 day", () => {
      const trip1 = createTrip({ id: "trip-1", prepDays: 1 });
      const trip2 = createTrip({ id: "trip-2", prepDays: 2 });
      const result = detectTripDuplicates([trip1, trip2]);
      expect(result.get("trip-1")).toEqual(["1 day prep"]);
      expect(result.get("trip-2")).toEqual(["2 days prep"]);
    });

    it("maps all napPreference enum values", () => {
      const trip1 = createTrip({ id: "trip-1", napPreference: "no" });
      const trip2 = createTrip({ id: "trip-2", napPreference: "flight_only" });
      const trip3 = createTrip({ id: "trip-3", napPreference: "all_days" });
      const result = detectTripDuplicates([trip1, trip2, trip3]);
      expect(result.get("trip-1")).toEqual(["no naps"]);
      expect(result.get("trip-2")).toEqual(["flight naps"]);
      expect(result.get("trip-3")).toEqual(["all naps"]);
    });

    it("handles unknown napPreference gracefully", () => {
      const trip1 = createTrip({ id: "trip-1", napPreference: "custom_value" });
      const trip2 = createTrip({ id: "trip-2", napPreference: "no" });
      const result = detectTripDuplicates([trip1, trip2]);
      expect(result.get("trip-1")).toEqual(["custom_value"]);
      expect(result.get("trip-2")).toEqual(["no naps"]);
    });
  });
});
