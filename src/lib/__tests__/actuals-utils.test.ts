import { describe, it, expect } from "vitest";
import { getActualKey, buildActualsMap } from "../actuals-utils";
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
