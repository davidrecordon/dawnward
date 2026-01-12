import { describe, it, expect } from "vitest";
import {
  getActualKey,
  buildActualsMap,
  calculateDeviation,
} from "../actuals-utils";
import type { InterventionActual } from "@/types/schedule";

describe("getActualKey", () => {
  it("generates key from dayOffset and interventionType", () => {
    expect(getActualKey(0, "melatonin")).toBe("0:melatonin");
    expect(getActualKey(-1, "wake_target")).toBe("-1:wake_target");
    expect(getActualKey(3, "sleep_target")).toBe("3:sleep_target");
  });
});

describe("buildActualsMap", () => {
  it("returns empty map for empty array", () => {
    const map = buildActualsMap([]);
    expect(map.size).toBe(0);
  });

  it("builds map with correct keys", () => {
    const actuals: InterventionActual[] = [
      {
        dayOffset: 0,
        interventionType: "melatonin",
        plannedTime: "22:00",
        actualTime: "22:30",
        status: "modified",
      },
      {
        dayOffset: 1,
        interventionType: "wake_target",
        plannedTime: "07:00",
        actualTime: null,
        status: "as_planned",
      },
    ];

    const map = buildActualsMap(actuals);
    expect(map.size).toBe(2);
    expect(map.get("0:melatonin")).toEqual(actuals[0]);
    expect(map.get("1:wake_target")).toEqual(actuals[1]);
  });

  it("returns InterventionActual data correctly", () => {
    const actual: InterventionActual = {
      dayOffset: 2,
      interventionType: "exercise",
      plannedTime: "18:00",
      actualTime: null,
      status: "skipped",
    };

    const map = buildActualsMap([actual]);
    const retrieved = map.get("2:exercise");

    expect(retrieved).toBeDefined();
    expect(retrieved?.status).toBe("skipped");
    expect(retrieved?.actualTime).toBeNull();
  });
});

describe("calculateDeviation", () => {
  describe("simple cases (no midnight crossing)", () => {
    it("returns 0 when times are equal", () => {
      expect(calculateDeviation("08:00", "08:00")).toBe(0);
      expect(calculateDeviation("23:30", "23:30")).toBe(0);
    });

    it("returns positive deviation when late", () => {
      // 30 minutes late
      expect(calculateDeviation("08:00", "08:30")).toBe(30);
      // 2 hours late
      expect(calculateDeviation("07:00", "09:00")).toBe(120);
    });

    it("returns negative deviation when early", () => {
      // 30 minutes early
      expect(calculateDeviation("08:00", "07:30")).toBe(-30);
      // 1.5 hours early
      expect(calculateDeviation("07:00", "05:30")).toBe(-90);
    });
  });

  describe("midnight crossing cases", () => {
    it("handles late sleep crossing midnight (actual next day)", () => {
      // Sleep target 23:00, actual 02:00 (next day) = 3 hours late
      expect(calculateDeviation("23:00", "02:00")).toBe(180);
      // Sleep target 22:00, actual 01:30 (next day) = 3.5 hours late
      expect(calculateDeviation("22:00", "01:30")).toBe(210);
    });

    it("handles early wake crossing midnight (actual previous day)", () => {
      // Wake target 02:00, actual 23:00 (previous day) = 3 hours early
      expect(calculateDeviation("02:00", "23:00")).toBe(-180);
    });

    it("handles sleep at midnight boundary", () => {
      // Target 23:30, actual 00:30 = 1 hour late
      expect(calculateDeviation("23:30", "00:30")).toBe(60);
      // Target 00:30, actual 23:30 = 1 hour early
      expect(calculateDeviation("00:30", "23:30")).toBe(-60);
    });
  });

  describe("edge cases", () => {
    it("handles deviations at exactly 12 hours", () => {
      // Exactly 12 hours should be treated as-is (not cross-midnight)
      expect(calculateDeviation("06:00", "18:00")).toBe(720);
      expect(calculateDeviation("18:00", "06:00")).toBe(-720);
    });

    it("handles deviations just over 12 hours (interpreted as crossing)", () => {
      // 12.5 hours would be wrong - interpret as -11.5 hours
      // 00:00 to 12:30 naive = +750, adjusted = 750 - 1440 = -690 (-11.5 hours)
      // But 12:30 to 00:00 naive = -750, adjusted = -750 + 1440 = 690 (+11.5 hours)
      expect(calculateDeviation("12:30", "00:00")).toBe(690);
    });
  });
});
