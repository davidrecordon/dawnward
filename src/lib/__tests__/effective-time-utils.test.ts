import { describe, it, expect } from "vitest";
import {
  getEffectiveTime,
  getEffectiveTimeForGroupable,
  shouldChildStayNested,
} from "../effective-time-utils";
import type { Intervention, InterventionActual } from "@/types/schedule";

// Helper to create a minimal intervention
function createIntervention(
  type: Intervention["type"],
  time: string
): Intervention {
  return {
    type,
    title: `Test ${type}`,
    description: "Test description",
    origin_time: time,
    dest_time: time,
    origin_date: "2026-01-15",
    dest_date: "2026-01-15",
    origin_tz: "America/Los_Angeles",
    dest_tz: "Europe/London",
    phase_type: "post_arrival",
    show_dual_timezone: false,
  };
}

// Helper to create an actual
function createActual(
  status: InterventionActual["status"],
  actualTime: string | null,
  plannedTime = "08:00"
): InterventionActual {
  return {
    dayOffset: 0,
    interventionType: "wake_target",
    plannedTime,
    actualTime,
    status,
  };
}

describe("getEffectiveTime", () => {
  const intervention = createIntervention("wake_target", "08:00");

  describe("when no actual recorded", () => {
    it("returns planned time", () => {
      expect(getEffectiveTime(intervention, undefined)).toBe("08:00");
    });
  });

  describe("when actual status is as_planned", () => {
    it("returns planned time", () => {
      const actual = createActual("as_planned", null);
      expect(getEffectiveTime(intervention, actual)).toBe("08:00");
    });
  });

  describe("when actual status is skipped", () => {
    it("returns planned time", () => {
      const actual = createActual("skipped", null);
      expect(getEffectiveTime(intervention, actual)).toBe("08:00");
    });
  });

  describe("when actual status is modified", () => {
    it("returns actual time when actualTime exists", () => {
      const actual = createActual("modified", "09:30");
      expect(getEffectiveTime(intervention, actual)).toBe("09:30");
    });

    it("returns planned time when actualTime is null", () => {
      const actual = createActual("modified", null);
      expect(getEffectiveTime(intervention, actual)).toBe("08:00");
    });

    it("returns planned time when actualTime is empty string", () => {
      const actual = createActual("modified", "");
      expect(getEffectiveTime(intervention, actual)).toBe("08:00");
    });
  });
});

describe("getEffectiveTimeForGroupable", () => {
  describe("non-intervention items", () => {
    it("returns time for departure", () => {
      const item = { kind: "departure" as const, time: "10:00" };
      expect(getEffectiveTimeForGroupable(item)).toBe("10:00");
    });

    it("returns time for arrival", () => {
      const item = { kind: "arrival" as const, time: "14:00" };
      expect(getEffectiveTimeForGroupable(item)).toBe("14:00");
    });

    it("returns time for now marker", () => {
      const item = { kind: "now" as const, time: "12:00" };
      expect(getEffectiveTimeForGroupable(item)).toBe("12:00");
    });
  });

  describe("editable interventions", () => {
    it("returns planned time when no actuals provided", () => {
      const item = {
        kind: "intervention" as const,
        time: "08:00",
        data: createIntervention("wake_target", "08:00"),
      };
      expect(getEffectiveTimeForGroupable(item)).toBe("08:00");
    });

    it("returns planned time when dayOffset not provided", () => {
      const actuals = new Map([
        ["0:wake_target", createActual("modified", "09:00")],
      ]);
      const item = {
        kind: "intervention" as const,
        time: "08:00",
        data: createIntervention("wake_target", "08:00"),
      };
      expect(getEffectiveTimeForGroupable(item, actuals)).toBe("08:00");
    });

    it("returns actual time when modified", () => {
      const actuals = new Map([
        ["0:wake_target", createActual("modified", "09:00")],
      ]);
      const item = {
        kind: "intervention" as const,
        time: "08:00",
        data: createIntervention("wake_target", "08:00"),
      };
      expect(getEffectiveTimeForGroupable(item, actuals, 0)).toBe("09:00");
    });

    it("returns planned time when as_planned", () => {
      const actuals = new Map([
        ["0:melatonin", createActual("as_planned", null)],
      ]);
      const item = {
        kind: "intervention" as const,
        time: "08:00",
        data: createIntervention("melatonin", "08:00"),
      };
      expect(getEffectiveTimeForGroupable(item, actuals, 0)).toBe("08:00");
    });
  });

  describe("non-editable interventions", () => {
    it("always returns planned time for light_seek", () => {
      const actuals = new Map([
        ["0:light_seek", createActual("modified", "09:00")],
      ]);
      const item = {
        kind: "intervention" as const,
        time: "08:00",
        data: createIntervention("light_seek", "08:00"),
      };
      // Non-editable types always return planned time
      expect(getEffectiveTimeForGroupable(item, actuals, 0)).toBe("08:00");
    });

    it("always returns planned time for caffeine_ok", () => {
      const item = {
        kind: "intervention" as const,
        time: "08:00",
        data: createIntervention("caffeine_ok", "08:00"),
      };
      expect(getEffectiveTimeForGroupable(item)).toBe("08:00");
    });

    it("always returns planned time for light_avoid", () => {
      const item = {
        kind: "intervention" as const,
        time: "08:00",
        data: createIntervention("light_avoid", "08:00"),
      };
      expect(getEffectiveTimeForGroupable(item)).toBe("08:00");
    });
  });
});

describe("shouldChildStayNested", () => {
  const parentEffectiveTime = "08:00";

  describe("non-editable children", () => {
    it("always stays nested for light_seek", () => {
      const child = createIntervention("light_seek", "08:00");
      expect(shouldChildStayNested(child, undefined, parentEffectiveTime)).toBe(
        true
      );
    });

    it("does NOT nest for caffeine_ok with different time", () => {
      const child = createIntervention("caffeine_ok", "10:00");
      expect(shouldChildStayNested(child, undefined, parentEffectiveTime)).toBe(
        false
      );
    });

    it("always stays nested for light_avoid", () => {
      const child = createIntervention("light_avoid", "08:00");
      expect(shouldChildStayNested(child, undefined, parentEffectiveTime)).toBe(
        true
      );
    });
  });

  describe("skipped children", () => {
    it("stays nested when skipped", () => {
      const child = createIntervention("melatonin", "08:00");
      const actual = createActual("skipped", null);
      expect(shouldChildStayNested(child, actual, parentEffectiveTime)).toBe(
        true
      );
    });

    it("does NOT nest if planned time differs from parent", () => {
      const child = createIntervention("melatonin", "09:00");
      const actual = createActual("skipped", null, "09:00");
      expect(shouldChildStayNested(child, actual, parentEffectiveTime)).toBe(
        false
      );
    });
  });

  describe("editable children with matching effective time", () => {
    it("stays nested when no actual", () => {
      const child = createIntervention("melatonin", "08:00");
      expect(shouldChildStayNested(child, undefined, parentEffectiveTime)).toBe(
        true
      );
    });

    it("stays nested when as_planned", () => {
      const child = createIntervention("melatonin", "08:00");
      const actual = createActual("as_planned", null);
      expect(shouldChildStayNested(child, actual, parentEffectiveTime)).toBe(
        true
      );
    });

    it("stays nested when modified to same time as parent", () => {
      const child = createIntervention("melatonin", "07:00");
      const actual = createActual("modified", "08:00", "07:00");
      expect(shouldChildStayNested(child, actual, parentEffectiveTime)).toBe(
        true
      );
    });
  });

  describe("editable children with different effective time", () => {
    it("unnests when modified to different time", () => {
      const child = createIntervention("melatonin", "08:00");
      const actual = createActual("modified", "09:30");
      expect(shouldChildStayNested(child, actual, parentEffectiveTime)).toBe(
        false
      );
    });

    it("unnests when planned time differs and no actual", () => {
      const child = createIntervention("sleep_target", "22:00");
      expect(shouldChildStayNested(child, undefined, parentEffectiveTime)).toBe(
        false
      );
    });
  });

  describe("editable intervention types", () => {
    it("applies logic to wake_target", () => {
      const child = createIntervention("wake_target", "09:00");
      expect(shouldChildStayNested(child, undefined, parentEffectiveTime)).toBe(
        false
      );
    });

    it("applies logic to sleep_target", () => {
      const child = createIntervention("sleep_target", "08:00");
      expect(shouldChildStayNested(child, undefined, parentEffectiveTime)).toBe(
        true
      );
    });

    it("applies logic to melatonin", () => {
      const child = createIntervention("melatonin", "08:00");
      expect(shouldChildStayNested(child, undefined, parentEffectiveTime)).toBe(
        true
      );
    });

    it("applies logic to exercise", () => {
      const child = createIntervention("exercise", "08:00");
      expect(shouldChildStayNested(child, undefined, parentEffectiveTime)).toBe(
        true
      );
    });

    it("applies logic to nap_window", () => {
      const child = createIntervention("nap_window", "08:00");
      expect(shouldChildStayNested(child, undefined, parentEffectiveTime)).toBe(
        true
      );
    });
  });
});
