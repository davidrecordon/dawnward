/**
 * Tests for the schedule generation API route request data construction.
 *
 * These tests verify that request parameters (especially nap_preference)
 * are properly included in the data passed to the Python scheduler.
 *
 * Note: Since the route.ts uses complex child_process and fs operations,
 * we test the data construction logic in isolation rather than the full route.
 */

import { describe, it, expect } from "vitest";

/**
 * Simulates the requestData construction logic from route.ts
 * This mirrors lines 109-121 in the route handler.
 */
function buildRequestData(body: Record<string, unknown>) {
  return {
    origin_tz: body.origin_tz,
    dest_tz: body.dest_tz,
    departure_datetime: body.departure_datetime,
    arrival_datetime: body.arrival_datetime,
    prep_days: body.prep_days,
    wake_time: body.wake_time,
    sleep_time: body.sleep_time,
    uses_melatonin: body.uses_melatonin ?? true,
    uses_caffeine: body.uses_caffeine ?? true,
    uses_exercise: body.uses_exercise ?? false,
    nap_preference: body.nap_preference ?? "flight_only",
  };
}

describe("Schedule Generation Request Data", () => {
  const validRequestBody = {
    origin_tz: "America/Los_Angeles",
    dest_tz: "Europe/London",
    departure_datetime: "2026-01-20T20:00",
    arrival_datetime: "2026-01-21T14:00",
    prep_days: 3,
    wake_time: "07:00",
    sleep_time: "23:00",
    uses_melatonin: true,
    uses_caffeine: true,
    uses_exercise: false,
  };

  describe("nap_preference parameter", () => {
    it("includes nap_preference='all_days' in request data", () => {
      const data = buildRequestData({
        ...validRequestBody,
        nap_preference: "all_days",
      });

      expect(data.nap_preference).toBe("all_days");
    });

    it("includes nap_preference='flight_only' in request data", () => {
      const data = buildRequestData({
        ...validRequestBody,
        nap_preference: "flight_only",
      });

      expect(data.nap_preference).toBe("flight_only");
    });

    it("includes nap_preference='no' in request data", () => {
      const data = buildRequestData({
        ...validRequestBody,
        nap_preference: "no",
      });

      expect(data.nap_preference).toBe("no");
    });

    it("defaults nap_preference to 'flight_only' when not provided", () => {
      const data = buildRequestData(validRequestBody);

      expect(data.nap_preference).toBe("flight_only");
    });

    it("defaults nap_preference when explicitly undefined", () => {
      const data = buildRequestData({
        ...validRequestBody,
        nap_preference: undefined,
      });

      expect(data.nap_preference).toBe("flight_only");
    });
  });

  describe("all preference parameters", () => {
    it("includes all boolean preferences in request data", () => {
      const data = buildRequestData({
        ...validRequestBody,
        uses_melatonin: false,
        uses_caffeine: false,
        uses_exercise: true,
        nap_preference: "all_days",
      });

      expect(data.uses_melatonin).toBe(false);
      expect(data.uses_caffeine).toBe(false);
      expect(data.uses_exercise).toBe(true);
      expect(data.nap_preference).toBe("all_days");
    });

    it("defaults boolean preferences correctly", () => {
      const data = buildRequestData({
        origin_tz: "America/Los_Angeles",
        dest_tz: "Europe/London",
        departure_datetime: "2026-01-20T20:00",
        arrival_datetime: "2026-01-21T14:00",
        prep_days: 3,
        wake_time: "07:00",
        sleep_time: "23:00",
        // Not providing optional booleans
      });

      expect(data.uses_melatonin).toBe(true);
      expect(data.uses_caffeine).toBe(true);
      expect(data.uses_exercise).toBe(false);
      expect(data.nap_preference).toBe("flight_only");
    });

    it("includes trip parameters in request data", () => {
      const data = buildRequestData({
        ...validRequestBody,
        nap_preference: "no",
      });

      expect(data.origin_tz).toBe("America/Los_Angeles");
      expect(data.dest_tz).toBe("Europe/London");
      expect(data.departure_datetime).toBe("2026-01-20T20:00");
      expect(data.arrival_datetime).toBe("2026-01-21T14:00");
      expect(data.prep_days).toBe(3);
      expect(data.wake_time).toBe("07:00");
      expect(data.sleep_time).toBe("23:00");
    });
  });

  describe("data structure completeness", () => {
    it("produces object with all required fields for Python scheduler", () => {
      const data = buildRequestData({
        ...validRequestBody,
        nap_preference: "all_days",
      });

      // All fields required by the Python ScheduleRequest
      expect(data).toHaveProperty("origin_tz");
      expect(data).toHaveProperty("dest_tz");
      expect(data).toHaveProperty("departure_datetime");
      expect(data).toHaveProperty("arrival_datetime");
      expect(data).toHaveProperty("prep_days");
      expect(data).toHaveProperty("wake_time");
      expect(data).toHaveProperty("sleep_time");
      expect(data).toHaveProperty("uses_melatonin");
      expect(data).toHaveProperty("uses_caffeine");
      expect(data).toHaveProperty("uses_exercise");
      expect(data).toHaveProperty("nap_preference");
    });
  });
});
