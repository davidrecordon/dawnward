import { describe, it, expect } from "vitest";
import {
  mapSharedScheduleToTripData,
  buildRouteLabel,
  calculateLayoverDuration,
  calculateTotalFlightTime,
  isValidLeg2Timing,
  isLegComplete,
} from "../trip-utils";
import type { TripLeg } from "@/types/trip-form";

describe("mapSharedScheduleToTripData", () => {
  const mockRecord = {
    originTz: "America/Los_Angeles",
    destTz: "Europe/London",
    departureDatetime: "2025-01-15T10:00",
    arrivalDatetime: "2025-01-16T06:00",
    leg2OriginTz: null,
    leg2DestTz: null,
    leg2DepartureDatetime: null,
    leg2ArrivalDatetime: null,
    prepDays: 3,
    wakeTime: "07:00",
    sleepTime: "23:00",
    usesMelatonin: true,
    usesCaffeine: true,
    usesExercise: false,
    napPreference: "flight_only",
    scheduleIntensity: "balanced",
    routeLabel: "SFO → LHR",
    code: "abc123",
    initialScheduleJson: null,
    currentScheduleJson: null,
  };

  it("maps all fields correctly", () => {
    const result = mapSharedScheduleToTripData(mockRecord);

    expect(result.originTz).toBe("America/Los_Angeles");
    expect(result.destTz).toBe("Europe/London");
    expect(result.departureDatetime).toBe("2025-01-15T10:00");
    expect(result.arrivalDatetime).toBe("2025-01-16T06:00");
    expect(result.leg2).toBeNull();
    expect(result.prepDays).toBe(3);
    expect(result.wakeTime).toBe("07:00");
    expect(result.sleepTime).toBe("23:00");
    expect(result.usesMelatonin).toBe(true);
    expect(result.usesCaffeine).toBe(true);
    expect(result.usesExercise).toBe(false);
    expect(result.napPreference).toBe("flight_only");
    expect(result.scheduleIntensity).toBe("balanced");
    expect(result.routeLabel).toBe("SFO → LHR");
    expect(result.code).toBe("abc123");
  });

  it("maps leg2 correctly when present", () => {
    const multiLegRecord = {
      ...mockRecord,
      leg2OriginTz: "Europe/London",
      leg2DestTz: "Asia/Tokyo",
      leg2DepartureDatetime: "2025-01-16T10:00",
      leg2ArrivalDatetime: "2025-01-17T05:00",
      routeLabel: "SFO → LHR → NRT",
    };
    const result = mapSharedScheduleToTripData(multiLegRecord);

    expect(result.leg2).not.toBeNull();
    expect(result.leg2!.originTz).toBe("Europe/London");
    expect(result.leg2!.destTz).toBe("Asia/Tokyo");
    expect(result.leg2!.departureDatetime).toBe("2025-01-16T10:00");
    expect(result.leg2!.arrivalDatetime).toBe("2025-01-17T05:00");
  });

  it("returns null leg2 when partial leg2 fields present", () => {
    const partialLeg2 = {
      ...mockRecord,
      leg2OriginTz: "Europe/London",
      leg2DestTz: null, // Missing
      leg2DepartureDatetime: "2025-01-16T10:00",
      leg2ArrivalDatetime: "2025-01-17T05:00",
    };
    const result = mapSharedScheduleToTripData(partialLeg2);

    expect(result.leg2).toBeNull();
  });

  it("handles null routeLabel", () => {
    const record = { ...mockRecord, routeLabel: null };
    const result = mapSharedScheduleToTripData(record);

    expect(result.routeLabel).toBeNull();
  });

  it("handles null code (unshared trip)", () => {
    const record = { ...mockRecord, code: null };
    const result = mapSharedScheduleToTripData(record);

    expect(result.code).toBeNull();
  });

  it("preserves boolean values correctly", () => {
    const record = {
      ...mockRecord,
      usesMelatonin: false,
      usesCaffeine: false,
      usesExercise: true,
    };
    const result = mapSharedScheduleToTripData(record);

    expect(result.usesMelatonin).toBe(false);
    expect(result.usesCaffeine).toBe(false);
    expect(result.usesExercise).toBe(true);
  });

  it("handles different schedule intensities", () => {
    const gentleRecord = { ...mockRecord, scheduleIntensity: "gentle" };
    const aggressiveRecord = { ...mockRecord, scheduleIntensity: "aggressive" };

    expect(mapSharedScheduleToTripData(gentleRecord).scheduleIntensity).toBe(
      "gentle"
    );
    expect(
      mapSharedScheduleToTripData(aggressiveRecord).scheduleIntensity
    ).toBe("aggressive");
  });

  it("handles different nap preferences", () => {
    const noNaps = { ...mockRecord, napPreference: "no" };
    const allDays = { ...mockRecord, napPreference: "all_days" };

    expect(mapSharedScheduleToTripData(noNaps).napPreference).toBe("no");
    expect(mapSharedScheduleToTripData(allDays).napPreference).toBe("all_days");
  });
});

describe("buildRouteLabel", () => {
  it("returns undefined when origin is missing", () => {
    expect(buildRouteLabel(undefined, "LHR")).toBeUndefined();
  });

  it("returns undefined when destination is missing", () => {
    expect(buildRouteLabel("SFO", undefined)).toBeUndefined();
  });

  it("returns undefined when both are missing", () => {
    expect(buildRouteLabel(undefined, undefined)).toBeUndefined();
  });

  it("builds single-leg route label", () => {
    expect(buildRouteLabel("SFO", "LHR")).toBe("SFO → LHR");
  });

  it("builds multi-leg route label", () => {
    expect(buildRouteLabel("SFO", "LAX", "JFK")).toBe("SFO → LAX → JFK");
  });

  it("ignores undefined leg2 destination", () => {
    expect(buildRouteLabel("SFO", "LHR", undefined)).toBe("SFO → LHR");
  });
});

describe("calculateLayoverDuration", () => {
  it("calculates layover duration correctly", () => {
    const result = calculateLayoverDuration(
      "2025-01-15T14:00",
      "2025-01-15T18:30"
    );
    expect(result).toEqual({ hours: 4, minutes: 30 });
  });

  it("handles overnight layover", () => {
    const result = calculateLayoverDuration(
      "2025-01-15T22:00",
      "2025-01-16T08:00"
    );
    expect(result).toEqual({ hours: 10, minutes: 0 });
  });

  it("returns null when leg2 departs before leg1 arrives", () => {
    const result = calculateLayoverDuration(
      "2025-01-15T18:00",
      "2025-01-15T14:00"
    );
    expect(result).toBeNull();
  });

  it("returns null when times are equal", () => {
    const result = calculateLayoverDuration(
      "2025-01-15T14:00",
      "2025-01-15T14:00"
    );
    expect(result).toBeNull();
  });

  it("handles long layover (18+ hours)", () => {
    const result = calculateLayoverDuration(
      "2025-01-15T10:00",
      "2025-01-16T12:00"
    );
    expect(result).toEqual({ hours: 26, minutes: 0 });
  });
});

describe("calculateTotalFlightTime", () => {
  it("returns null when leg1 is null", () => {
    expect(calculateTotalFlightTime(null, { hours: 5, minutes: 0 })).toBeNull();
  });

  it("returns leg1 duration when leg2 is null (single-leg trip)", () => {
    const leg1 = { hours: 10, minutes: 30 };
    expect(calculateTotalFlightTime(leg1, null)).toEqual({ hours: 10, minutes: 30 });
  });

  it("sums durations correctly", () => {
    const leg1 = { hours: 5, minutes: 30 };
    const leg2 = { hours: 3, minutes: 45 };
    expect(calculateTotalFlightTime(leg1, leg2)).toEqual({ hours: 9, minutes: 15 });
  });

  it("handles minutes overflow into hours", () => {
    const leg1 = { hours: 2, minutes: 45 };
    const leg2 = { hours: 1, minutes: 30 };
    expect(calculateTotalFlightTime(leg1, leg2)).toEqual({ hours: 4, minutes: 15 });
  });

  it("handles zero minutes", () => {
    const leg1 = { hours: 6, minutes: 0 };
    const leg2 = { hours: 4, minutes: 0 };
    expect(calculateTotalFlightTime(leg1, leg2)).toEqual({ hours: 10, minutes: 0 });
  });
});

describe("isValidLeg2Timing", () => {
  it("returns true when leg2 departs after leg1 arrives", () => {
    expect(isValidLeg2Timing("2025-01-15T14:00", "2025-01-15T18:00")).toBe(true);
  });

  it("returns false when leg2 departs before leg1 arrives", () => {
    expect(isValidLeg2Timing("2025-01-15T18:00", "2025-01-15T14:00")).toBe(false);
  });

  it("returns false when times are equal", () => {
    expect(isValidLeg2Timing("2025-01-15T14:00", "2025-01-15T14:00")).toBe(false);
  });

  it("handles different dates correctly", () => {
    expect(isValidLeg2Timing("2025-01-15T23:00", "2025-01-16T08:00")).toBe(true);
  });
});

describe("isLegComplete", () => {
  const mockAirport = {
    code: "SFO",
    name: "San Francisco International",
    city: "San Francisco",
    country: "US",
    tz: "America/Los_Angeles",
  };

  it("returns false for null leg", () => {
    expect(isLegComplete(null)).toBe(false);
  });

  it("returns false when origin is missing", () => {
    const leg: TripLeg = {
      origin: null,
      destination: mockAirport,
      departureDateTime: "2025-01-15T10:00",
      arrivalDateTime: "2025-01-15T18:00",
    };
    expect(isLegComplete(leg)).toBe(false);
  });

  it("returns false when destination is missing", () => {
    const leg: TripLeg = {
      origin: mockAirport,
      destination: null,
      departureDateTime: "2025-01-15T10:00",
      arrivalDateTime: "2025-01-15T18:00",
    };
    expect(isLegComplete(leg)).toBe(false);
  });

  it("returns false when departureDateTime is empty", () => {
    const leg: TripLeg = {
      origin: mockAirport,
      destination: mockAirport,
      departureDateTime: "",
      arrivalDateTime: "2025-01-15T18:00",
    };
    expect(isLegComplete(leg)).toBe(false);
  });

  it("returns false when arrivalDateTime is empty", () => {
    const leg: TripLeg = {
      origin: mockAirport,
      destination: mockAirport,
      departureDateTime: "2025-01-15T10:00",
      arrivalDateTime: "",
    };
    expect(isLegComplete(leg)).toBe(false);
  });

  it("returns true when all fields are present", () => {
    const leg: TripLeg = {
      origin: mockAirport,
      destination: { ...mockAirport, code: "LHR", tz: "Europe/London" },
      departureDateTime: "2025-01-15T10:00",
      arrivalDateTime: "2025-01-15T18:00",
    };
    expect(isLegComplete(leg)).toBe(true);
  });
});
