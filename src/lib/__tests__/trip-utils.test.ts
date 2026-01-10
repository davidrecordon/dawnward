import { describe, it, expect } from "vitest";
import { mapSharedScheduleToTripData } from "../trip-utils";

describe("mapSharedScheduleToTripData", () => {
  const mockRecord = {
    originTz: "America/Los_Angeles",
    destTz: "Europe/London",
    departureDatetime: "2025-01-15T10:00",
    arrivalDatetime: "2025-01-16T06:00",
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
  };

  it("maps all fields correctly", () => {
    const result = mapSharedScheduleToTripData(mockRecord);

    expect(result.originTz).toBe("America/Los_Angeles");
    expect(result.destTz).toBe("Europe/London");
    expect(result.departureDatetime).toBe("2025-01-15T10:00");
    expect(result.arrivalDatetime).toBe("2025-01-16T06:00");
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
