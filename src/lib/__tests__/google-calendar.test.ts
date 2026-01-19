import { describe, it, expect } from "vitest";
import {
  getReminderMinutes,
  isActionableIntervention,
  buildEventTitle,
  buildEventDescription,
  groupInterventionsByTime,
  buildCalendarEvent,
} from "@/lib/google-calendar";
import type { Intervention, InterventionType } from "@/types/schedule";

// Helper to create test interventions
function makeIntervention(
  type: InterventionType,
  time: string = "07:00",
  overrides: Partial<Intervention> = {}
): Intervention {
  return {
    type,
    title: `Test ${type}`,
    description: `Description for ${type}`,
    origin_time: time,
    dest_time: time,
    origin_date: "2026-01-15",
    dest_date: "2026-01-15",
    origin_tz: "America/Los_Angeles",
    dest_tz: "Europe/London",
    phase_type: "post_arrival",
    show_dual_timezone: false,
    ...overrides,
  };
}

describe("getReminderMinutes", () => {
  it("returns 30 minutes for schedule anchors", () => {
    expect(getReminderMinutes("wake_target")).toBe(30);
    expect(getReminderMinutes("sleep_target")).toBe(30);
    expect(getReminderMinutes("exercise")).toBe(30);
  });

  it("returns 15 minutes for light and activity interventions", () => {
    expect(getReminderMinutes("light_seek")).toBe(15);
    expect(getReminderMinutes("light_avoid")).toBe(15);
    expect(getReminderMinutes("nap_window")).toBe(15);
    expect(getReminderMinutes("melatonin")).toBe(15);
  });

  it("returns 5 minutes for caffeine cutoff", () => {
    expect(getReminderMinutes("caffeine_cutoff")).toBe(5);
  });

  it("returns 15 minutes for caffeine_ok (default)", () => {
    expect(getReminderMinutes("caffeine_ok")).toBe(15);
  });
});

describe("isActionableIntervention", () => {
  it("returns true for actionable intervention types", () => {
    const actionableTypes: InterventionType[] = [
      "wake_target",
      "sleep_target",
      "melatonin",
      "light_seek",
      "light_avoid",
      "caffeine_cutoff",
      "exercise",
      "nap_window",
    ];

    for (const type of actionableTypes) {
      expect(isActionableIntervention(type)).toBe(true);
    }
  });

  it("returns false for caffeine_ok (informational only)", () => {
    expect(isActionableIntervention("caffeine_ok")).toBe(false);
  });
});

describe("groupInterventionsByTime", () => {
  it("groups interventions by their time", () => {
    const interventions = [
      makeIntervention("wake_target", "07:00"),
      makeIntervention("light_seek", "07:00"),
      makeIntervention("melatonin", "21:00"),
    ];

    const groups = groupInterventionsByTime(interventions);

    expect(groups.size).toBe(2);
    expect(groups.get("07:00")).toHaveLength(2);
    expect(groups.get("21:00")).toHaveLength(1);
  });

  it("filters out non-actionable interventions (caffeine_ok)", () => {
    const interventions = [
      makeIntervention("wake_target", "07:00"),
      makeIntervention("caffeine_ok", "07:00"),
    ];

    const groups = groupInterventionsByTime(interventions);

    expect(groups.get("07:00")).toHaveLength(1);
    expect(groups.get("07:00")![0].type).toBe("wake_target");
  });

  it("returns empty map for empty input", () => {
    const groups = groupInterventionsByTime([]);
    expect(groups.size).toBe(0);
  });

  it("returns empty map when all interventions are non-actionable", () => {
    const interventions = [
      makeIntervention("caffeine_ok", "07:00"),
      makeIntervention("caffeine_ok", "14:00"),
    ];

    const groups = groupInterventionsByTime(interventions);
    expect(groups.size).toBe(0);
  });
});

describe("buildEventTitle", () => {
  it("returns emoji + title for single intervention", () => {
    const interventions = [
      makeIntervention("melatonin", "21:00", { title: "Take melatonin" }),
    ];

    expect(buildEventTitle(interventions)).toBe("💊 Take melatonin");
  });

  it("uses wake_target as anchor with children listed", () => {
    const interventions = [
      makeIntervention("wake_target", "07:00", { title: "Target wake time" }),
      makeIntervention("light_seek", "07:00", { title: "Seek bright light" }),
    ];

    expect(buildEventTitle(interventions)).toBe("⏰ Wake up: Light");
  });

  it("uses sleep_target as anchor with melatonin", () => {
    const interventions = [
      makeIntervention("sleep_target", "22:00", { title: "Target bedtime" }),
      makeIntervention("melatonin", "22:00", { title: "Take melatonin" }),
    ];

    expect(buildEventTitle(interventions)).toBe("😴 Bedtime: Melatonin");
  });

  it("combines multiple children with + separator", () => {
    const interventions = [
      makeIntervention("wake_target", "07:00"),
      makeIntervention("light_seek", "07:00"),
      makeIntervention("caffeine_cutoff", "07:00"),
    ];

    expect(buildEventTitle(interventions)).toBe(
      "⏰ Wake up: Light + No caffeine"
    );
  });

  it("prioritizes wake_target over other types as anchor", () => {
    const interventions = [
      makeIntervention("light_seek", "07:00"),
      makeIntervention("wake_target", "07:00"),
      makeIntervention("exercise", "07:00"),
    ];

    const title = buildEventTitle(interventions);
    expect(title.startsWith("⏰")).toBe(true);
  });

  it("prioritizes sleep_target when no wake_target", () => {
    const interventions = [
      makeIntervention("melatonin", "22:00"),
      makeIntervention("sleep_target", "22:00"),
    ];

    const title = buildEventTitle(interventions);
    expect(title.startsWith("😴")).toBe(true);
  });

  it("prioritizes melatonin when no wake/sleep target", () => {
    const interventions = [
      makeIntervention("light_avoid", "21:00"),
      makeIntervention("melatonin", "21:00"),
    ];

    const title = buildEventTitle(interventions);
    expect(title.startsWith("💊")).toBe(true);
  });

  it("returns empty string for empty interventions", () => {
    expect(buildEventTitle([])).toBe("");
  });
});

describe("buildEventDescription", () => {
  it("creates bullet list of descriptions", () => {
    const interventions = [
      makeIntervention("wake_target", "07:00", {
        description: "Wake up at target time",
      }),
      makeIntervention("light_seek", "07:00", {
        description: "Get 30 minutes of bright light",
      }),
    ];

    const description = buildEventDescription(interventions);

    expect(description).toBe(
      "• Wake up at target time\n• Get 30 minutes of bright light"
    );
  });

  it("handles single intervention", () => {
    const interventions = [
      makeIntervention("melatonin", "21:00", {
        description: "Take 0.5mg melatonin",
      }),
    ];

    expect(buildEventDescription(interventions)).toBe("• Take 0.5mg melatonin");
  });
});

describe("buildCalendarEvent", () => {
  it("creates event with correct structure", () => {
    const interventions = [
      makeIntervention("melatonin", "21:30", {
        title: "Take melatonin",
        description: "Take 0.5mg",
      }),
    ];

    const event = buildCalendarEvent(interventions);

    expect(event.summary).toBe("💊 Take melatonin");
    expect(event.description).toBe("• Take 0.5mg");
    // Uses dest_tz from intervention (post_arrival phase)
    expect(event.start?.timeZone).toBe("Europe/London");
    expect(event.end?.timeZone).toBe("Europe/London");
    expect(event.reminders?.useDefault).toBe(false);
    expect(event.reminders?.overrides?.[0]?.minutes).toBe(15); // melatonin = 15 min
  });

  it("uses anchor intervention for reminder timing", () => {
    const interventions = [
      makeIntervention("wake_target", "07:00"),
      makeIntervention("light_seek", "07:00"),
    ];

    const event = buildCalendarEvent(interventions);

    // wake_target = 30 min reminder
    expect(event.reminders?.overrides?.[0]?.minutes).toBe(30);
  });

  it("uses intervention duration_min when provided", () => {
    const interventions = [
      makeIntervention("light_seek", "07:00", { duration_min: 45 }),
    ];

    const event = buildCalendarEvent(interventions);

    // Start at 07:00, end 45 min later at 07:45
    expect(event.start?.dateTime).toContain("07:00");
    expect(event.end?.dateTime).toContain("07:45");
  });

  it("defaults to 15 minute duration when not specified", () => {
    const interventions = [makeIntervention("melatonin", "21:00")];

    const event = buildCalendarEvent(interventions);

    // Start at 21:00, end 15 min later at 21:15
    expect(event.start?.dateTime).toContain("21:00");
    expect(event.end?.dateTime).toContain("21:15");
  });

  it("throws error for empty interventions", () => {
    expect(() => buildCalendarEvent([])).toThrow(
      "Cannot build event from empty interventions"
    );
  });

  describe("timezone extraction from intervention", () => {
    it("uses dest_tz for post-arrival phase interventions", () => {
      const interventions = [
        makeIntervention("wake_target", "07:00", {
          phase_type: "post_arrival",
          origin_time: "23:00", // 11 PM previous night in origin
          dest_time: "07:00", // 7 AM in destination
          dest_tz: "Europe/London",
        }),
      ];

      const event = buildCalendarEvent(interventions);

      // Should use dest_time (07:00) and dest_tz
      expect(event.start?.dateTime).toContain("07:00");
      expect(event.start?.timeZone).toBe("Europe/London");
    });

    it("uses origin_tz for preparation phase interventions", () => {
      const interventions = [
        makeIntervention("wake_target", "07:00", {
          phase_type: "preparation",
          origin_time: "07:00",
          dest_time: "15:00", // 3 PM in destination
          origin_tz: "America/Los_Angeles",
        }),
      ];

      const event = buildCalendarEvent(interventions);

      // For preparation phase, event should use origin time and origin_tz
      expect(event.start?.dateTime).toContain("07:00");
      expect(event.start?.timeZone).toBe("America/Los_Angeles");
    });

    it("uses origin_tz for pre_departure phase interventions", () => {
      const interventions = [
        makeIntervention("caffeine_cutoff", "10:00", {
          phase_type: "pre_departure",
          origin_time: "10:00",
          dest_time: "18:00",
          origin_tz: "America/New_York",
        }),
      ];

      const event = buildCalendarEvent(interventions);

      expect(event.start?.dateTime).toContain("10:00");
      expect(event.start?.timeZone).toBe("America/New_York");
    });

    it("uses dest_tz for adaptation phase interventions", () => {
      const interventions = [
        makeIntervention("sleep_target", "23:00", {
          phase_type: "adaptation",
          dest_tz: "Asia/Tokyo",
        }),
      ];

      const event = buildCalendarEvent(interventions);

      expect(event.start?.timeZone).toBe("Asia/Tokyo");
    });

    it("handles in-transit interventions with dest_tz", () => {
      const interventions = [
        makeIntervention("nap_window", "14:00", {
          phase_type: "in_transit",
          origin_time: "14:00",
          dest_time: "22:00",
          dest_tz: "Europe/London",
          flight_offset_hours: 4.5,
        }),
      ];

      const event = buildCalendarEvent(interventions);

      // In-transit events should use dest_time and dest_tz
      expect(event.start?.dateTime).toContain("22:00");
      expect(event.start?.timeZone).toBe("Europe/London");
    });

    it("preserves intervention metadata in event", () => {
      const interventions = [
        makeIntervention("light_seek", "08:00", {
          description: "Get 30 minutes of morning light",
          duration_min: 30,
        }),
      ];

      const event = buildCalendarEvent(interventions);

      expect(event.description).toContain("Get 30 minutes of morning light");
      // Duration should be reflected in end time
      expect(event.end?.dateTime).toContain("08:30");
    });

    it("throws error when intervention missing timezone", () => {
      const interventions = [
        makeIntervention("melatonin", "21:00", {
          phase_type: "post_arrival",
          dest_tz: "", // Empty timezone
        }),
      ];

      expect(() => buildCalendarEvent(interventions)).toThrow(
        /missing timezone context/
      );
    });

    it("uses correct timezone for multi-leg trips", () => {
      // Simulate leg 1: LA -> London (use London timezone)
      const leg1Intervention = makeIntervention("wake_target", "07:00", {
        phase_type: "post_arrival",
        dest_tz: "Europe/London",
        dest_date: "2026-01-16",
      });

      // Simulate leg 2: London -> Tokyo (use Tokyo timezone)
      const leg2Intervention = makeIntervention("wake_target", "07:00", {
        phase_type: "post_arrival",
        dest_tz: "Asia/Tokyo",
        dest_date: "2026-01-19",
      });

      const event1 = buildCalendarEvent([leg1Intervention]);
      const event2 = buildCalendarEvent([leg2Intervention]);

      // Each event should use its own intervention's timezone and date
      expect(event1.start?.timeZone).toBe("Europe/London");
      expect(event1.start?.dateTime).toContain("2026-01-16");
      expect(event2.start?.timeZone).toBe("Asia/Tokyo");
      expect(event2.start?.dateTime).toContain("2026-01-19");
    });
  });

  describe("date extraction from intervention", () => {
    it("uses origin_date for preparation phase", () => {
      const interventions = [
        makeIntervention("wake_target", "07:00", {
          phase_type: "preparation",
          origin_date: "2026-01-19",
          dest_date: "2026-01-20", // Different date (ahead)
          origin_tz: "America/Los_Angeles",
        }),
      ];

      const event = buildCalendarEvent(interventions);

      // Should use origin_date for preparation phase
      expect(event.start?.dateTime).toContain("2026-01-19");
      expect(event.start?.timeZone).toBe("America/Los_Angeles");
    });

    it("uses dest_date for in_transit phase (cross-dateline)", () => {
      // SFO -> Singapore: Departs Jan 22 LA time, nap at 03:45 Singapore time = Jan 23
      const interventions = [
        makeIntervention("nap_window", "03:45", {
          phase_type: "in_transit",
          origin_date: "2026-01-22", // LA calendar date
          dest_date: "2026-01-23", // Singapore calendar date (next day!)
          origin_time: "11:45", // LA time
          dest_time: "03:45", // Singapore time
          dest_tz: "Asia/Singapore",
        }),
      ];

      const event = buildCalendarEvent(interventions);

      // Should use dest_date (Jan 23) with dest_time (03:45) and dest_tz
      expect(event.start?.dateTime).toContain("2026-01-23");
      expect(event.start?.dateTime).toContain("03:45");
      expect(event.start?.timeZone).toBe("Asia/Singapore");
    });

    it("uses dest_date for post_arrival phase", () => {
      const interventions = [
        makeIntervention("wake_target", "06:30", {
          phase_type: "post_arrival",
          origin_date: "2026-01-23",
          dest_date: "2026-01-24", // Morning after arrival
          dest_tz: "Asia/Singapore",
        }),
      ];

      const event = buildCalendarEvent(interventions);

      // Should use dest_date for post_arrival
      expect(event.start?.dateTime).toContain("2026-01-24");
      expect(event.start?.timeZone).toBe("Asia/Singapore");
    });

    it("throws error when intervention missing date", () => {
      const interventions = [
        makeIntervention("melatonin", "21:00", {
          phase_type: "post_arrival",
          dest_date: "", // Empty date
        }),
      ];

      expect(() => buildCalendarEvent(interventions)).toThrow(
        /missing date context/
      );
    });
  });
});
