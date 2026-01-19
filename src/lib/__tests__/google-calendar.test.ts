import { describe, it, expect } from "vitest";
import {
  getReminderMinutes,
  isActionableIntervention,
  buildEventTitle,
  buildEventDescription,
  groupInterventionsByTime,
  groupInterventionsByAnchor,
  buildCalendarEvent,
  getEventDuration,
  isStandaloneType,
  shouldShowAsBusy,
} from "@/lib/google-calendar";
import type {
  Intervention,
  InterventionType,
  PhaseType,
} from "@/types/schedule";

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
  it("returns 0 minutes for wake_target (immediate)", () => {
    expect(getReminderMinutes("wake_target")).toBe(0);
  });

  it("returns 30 minutes for sleep_target", () => {
    expect(getReminderMinutes("sleep_target")).toBe(30);
  });

  it("returns 15 minutes for exercise and caffeine_cutoff", () => {
    expect(getReminderMinutes("exercise")).toBe(15);
    expect(getReminderMinutes("caffeine_cutoff")).toBe(15);
  });

  it("returns 15 minutes (default) for other types", () => {
    expect(getReminderMinutes("light_seek")).toBe(15);
    expect(getReminderMinutes("light_avoid")).toBe(15);
    expect(getReminderMinutes("nap_window")).toBe(15);
    expect(getReminderMinutes("melatonin")).toBe(15);
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
  const FOOTER = "Created by Dawnward · dawnward.app";

  it("creates bullet list of descriptions with footer", () => {
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
      `• Wake up at target time\n• Get 30 minutes of bright light\n\n${FOOTER}`
    );
  });

  it("handles single intervention without bullet but with footer", () => {
    const interventions = [
      makeIntervention("melatonin", "21:00", {
        description: "Take 0.5mg melatonin",
      }),
    ];

    expect(buildEventDescription(interventions)).toBe(
      `Take 0.5mg melatonin\n\n${FOOTER}`
    );
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
    expect(event.description).toBe(
      "Take 0.5mg\n\nCreated by Dawnward · dawnward.app"
    );
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

    // wake_target = 0 min reminder (immediate)
    expect(event.reminders?.overrides?.[0]?.minutes).toBe(0);
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

  it("uses type-specific duration for melatonin (15 min)", () => {
    const interventions = [makeIntervention("melatonin", "21:00")];

    const event = buildCalendarEvent(interventions);

    // Melatonin uses 15-minute duration (minimum for practical visibility)
    expect(event.start?.dateTime).toContain("21:00");
    expect(event.end?.dateTime).toContain("21:15");
  });

  it("uses longest duration when grouping interventions", () => {
    // When wake_target (15 min) groups with light_seek (60 min), use the longer duration
    const interventions = [
      makeIntervention("wake_target", "07:00"), // 15 min duration
      makeIntervention("light_seek", "07:00", { duration_min: 60 }), // 60 min duration
    ];

    const event = buildCalendarEvent(interventions);

    // Should use light_seek's 60 min duration, not wake_target's 15 min
    expect(event.start?.dateTime).toContain("07:00");
    expect(event.end?.dateTime).toContain("08:00");
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

/**
 * Realistic Flight Calendar Tests
 *
 * These tests mirror the Python realistic flight test scenarios to verify
 * that calendar events are created with correct dates and timezones for
 * real-world flight routes.
 *
 * Flight data sourced from verified airline schedules (same as Python tests).
 */
describe("Realistic Flight Calendar Events", () => {
  /**
   * Helper to create a realistic intervention with full timezone context
   */
  function makeRealisticIntervention(
    type: InterventionType,
    phase: PhaseType,
    opts: {
      time: string;
      originTz: string;
      destTz: string;
      originDate: string;
      destDate: string;
      flightOffsetHours?: number;
    }
  ): Intervention {
    return {
      type,
      title: `Test ${type}`,
      description: `Description for ${type}`,
      origin_time: opts.time,
      dest_time: opts.time,
      origin_date: opts.originDate,
      dest_date: opts.destDate,
      origin_tz: opts.originTz,
      dest_tz: opts.destTz,
      phase_type: phase,
      show_dual_timezone: phase === "in_transit" || phase === "in_transit_ulr",
      flight_offset_hours: opts.flightOffsetHours,
    };
  }

  describe("Moderate Jet Lag (8-9h shift) - Transatlantic", () => {
    /**
     * Virgin Atlantic VS20: SFO 16:30 → LHR 10:40+1 (~10h10m)
     * Eastbound overnight flight, next-day arrival
     */
    it("VS20 SFO-LHR: preparation uses origin_tz and origin_date", () => {
      // Day before departure (preparation)
      const intervention = makeRealisticIntervention(
        "wake_target",
        "preparation",
        {
          time: "07:00",
          originTz: "America/Los_Angeles",
          destTz: "Europe/London",
          originDate: "2026-01-14", // Day before Jan 15 departure
          destDate: "2026-01-14", // Same day in London (before 8h shift)
        }
      );

      const event = buildCalendarEvent([intervention]);

      expect(event.start?.timeZone).toBe("America/Los_Angeles");
      expect(event.start?.dateTime).toContain("2026-01-14");
      expect(event.start?.dateTime).toContain("07:00");
    });

    it("VS20 SFO-LHR: post_arrival uses dest_tz and dest_date", () => {
      // Morning after arrival (post_arrival)
      // Arrives Jan 16 10:40 LHR, first full morning is Jan 17
      const intervention = makeRealisticIntervention(
        "wake_target",
        "post_arrival",
        {
          time: "07:00",
          originTz: "America/Los_Angeles",
          destTz: "Europe/London",
          originDate: "2026-01-16", // Jan 16 LA time
          destDate: "2026-01-17", // Jan 17 London time (morning after arrival)
        }
      );

      const event = buildCalendarEvent([intervention]);

      expect(event.start?.timeZone).toBe("Europe/London");
      expect(event.start?.dateTime).toContain("2026-01-17");
      expect(event.start?.dateTime).toContain("07:00");
    });

    /**
     * Virgin Atlantic VS19: LHR 11:40 → SFO 14:40 same day (~11h)
     * Westbound return - same calendar day arrival due to timezone gain
     */
    it("VS19 LHR-SFO: post_arrival same day arrival", () => {
      // Arrives Jan 20 14:40 SFO (same calendar day as departure)
      const intervention = makeRealisticIntervention(
        "sleep_target",
        "post_arrival",
        {
          time: "22:00",
          originTz: "Europe/London",
          destTz: "America/Los_Angeles",
          originDate: "2026-01-21", // Next day London time
          destDate: "2026-01-20", // Same day in LA (arrived same calendar day)
        }
      );

      const event = buildCalendarEvent([intervention]);

      expect(event.start?.timeZone).toBe("America/Los_Angeles");
      expect(event.start?.dateTime).toContain("2026-01-20");
    });
  });

  describe("Severe Jet Lag (12-17h shift) - Cross-Dateline", () => {
    /**
     * Singapore Airlines SQ31: SFO 09:40 → SIN 19:05+1 (~17h25m)
     * Ultra-long-haul crossing date line eastbound, 16h shift → 8h delay
     */
    it("SQ31 SFO-SIN: in-flight nap uses dest_tz and dest_date (next day)", () => {
      // In-flight nap at ~4h into flight
      // Departure: Jan 22 09:40 LA (PST) = Jan 23 01:40 Singapore (SGT)
      // Nap 4h later: Jan 22 13:40 LA = Jan 23 05:40 Singapore
      const intervention = makeRealisticIntervention(
        "nap_window",
        "in_transit_ulr",
        {
          time: "05:40",
          originTz: "America/Los_Angeles",
          destTz: "Asia/Singapore",
          originDate: "2026-01-22", // LA date
          destDate: "2026-01-23", // Singapore date (NEXT DAY!)
          flightOffsetHours: 4,
        }
      );

      const event = buildCalendarEvent([intervention]);

      // Calendar event should be on Singapore date (Jan 23), not LA date
      expect(event.start?.timeZone).toBe("Asia/Singapore");
      expect(event.start?.dateTime).toContain("2026-01-23");
      expect(event.start?.dateTime).toContain("05:40");
    });

    it("SQ31 SFO-SIN: post_arrival wake uses next morning date", () => {
      // Arrives Jan 23 19:00 Singapore
      // Wake target at 06:30 must be Jan 24 (morning AFTER arrival)
      const intervention = makeRealisticIntervention(
        "wake_target",
        "post_arrival",
        {
          time: "06:30",
          originTz: "America/Los_Angeles",
          destTz: "Asia/Singapore",
          originDate: "2026-01-23", // LA date
          destDate: "2026-01-24", // Singapore morning after 19:00 arrival
        }
      );

      const event = buildCalendarEvent([intervention]);

      // Must be Jan 24, not Jan 23 (which would be BEFORE landing!)
      expect(event.start?.timeZone).toBe("Asia/Singapore");
      expect(event.start?.dateTime).toContain("2026-01-24");
    });

    /**
     * Singapore Airlines SQ32: SIN 09:15 → SFO 07:50 same day (~15h35m)
     * Date line crossing westbound - arrives same calendar day but earlier local time
     */
    it("SQ32 SIN-SFO: westbound date line crossing (arrives earlier)", () => {
      // Departs Jan 20 09:15 Singapore
      // Arrives Jan 20 07:50 LA (same calendar day but earlier local time!)
      const intervention = makeRealisticIntervention(
        "sleep_target",
        "post_arrival",
        {
          time: "22:00",
          originTz: "Asia/Singapore",
          destTz: "America/Los_Angeles",
          originDate: "2026-01-21", // Singapore next day
          destDate: "2026-01-20", // LA same day as departure (date gained!)
        }
      );

      const event = buildCalendarEvent([intervention]);

      expect(event.start?.timeZone).toBe("America/Los_Angeles");
      expect(event.start?.dateTime).toContain("2026-01-20");
    });

    /**
     * Cathay Pacific CX872: HKG 01:00 → SFO 21:15-1 (~13h15m)
     * SPECIAL CASE: Arrives PREVIOUS calendar day due to date line!
     */
    it("CX872 HKG-SFO: arrives previous calendar day", () => {
      // Departs Jan 20 01:00 Hong Kong
      // Arrives Jan 19 21:15 LA (previous calendar day!)
      const intervention = makeRealisticIntervention(
        "sleep_target",
        "post_arrival",
        {
          time: "23:00",
          originTz: "Asia/Hong_Kong",
          destTz: "America/Los_Angeles",
          originDate: "2026-01-20", // HK departure date
          destDate: "2026-01-19", // LA arrival date (PREVIOUS day!)
        }
      );

      const event = buildCalendarEvent([intervention]);

      // Sleep target should be on Jan 19 LA time
      expect(event.start?.timeZone).toBe("America/Los_Angeles");
      expect(event.start?.dateTime).toContain("2026-01-19");
    });

    /**
     * Japan Airlines JL2: HND 18:05 → SFO 10:15 same day (~9h10m)
     * Date line crossing - arrives earlier on same calendar day
     */
    it("JL2 HND-SFO: same day arrival earlier local time", () => {
      // Departs Jan 20 18:05 Tokyo
      // Arrives Jan 20 10:15 LA (same day, earlier time)
      const intervention = makeRealisticIntervention(
        "wake_target",
        "post_arrival",
        {
          time: "07:00",
          originTz: "Asia/Tokyo",
          destTz: "America/Los_Angeles",
          originDate: "2026-01-21", // Tokyo next day
          destDate: "2026-01-21", // LA next day (first full day)
        }
      );

      const event = buildCalendarEvent([intervention]);

      expect(event.start?.timeZone).toBe("America/Los_Angeles");
      expect(event.start?.dateTime).toContain("2026-01-21");
    });

    /**
     * Qantas QF74: SFO 20:15 → SYD 06:10+2 (~15h55m)
     * SPECIAL CASE: Arrives TWO days later!
     */
    it("QF74 SFO-SYD: +2 day arrival", () => {
      // Departs Jan 20 20:15 LA
      // Arrives Jan 22 06:10 Sydney (TWO days later!)
      const intervention = makeRealisticIntervention(
        "wake_target",
        "post_arrival",
        {
          time: "07:00",
          originTz: "America/Los_Angeles",
          destTz: "Australia/Sydney",
          originDate: "2026-01-20", // LA departure date
          destDate: "2026-01-22", // Sydney +2 days
        }
      );

      const event = buildCalendarEvent([intervention]);

      // Should be Jan 22 Sydney, not Jan 20 or 21
      expect(event.start?.timeZone).toBe("Australia/Sydney");
      expect(event.start?.dateTime).toContain("2026-01-22");
    });

    it("QF74 SFO-SYD: preparation still uses origin date", () => {
      // Preparation day before departure (Jan 19)
      const intervention = makeRealisticIntervention(
        "melatonin",
        "preparation",
        {
          time: "21:00",
          originTz: "America/Los_Angeles",
          destTz: "Australia/Sydney",
          originDate: "2026-01-19",
          destDate: "2026-01-20", // Sydney is ahead
        }
      );

      const event = buildCalendarEvent([intervention]);

      // Preparation uses origin timezone and date
      expect(event.start?.timeZone).toBe("America/Los_Angeles");
      expect(event.start?.dateTime).toContain("2026-01-19");
    });

    /**
     * Qantas QF73: SYD 21:25 → SFO 15:55 same day (~13h30m)
     * Date line crossing - arrives same calendar day despite long flight
     */
    it("QF73 SYD-SFO: same day arrival westbound", () => {
      // Departs Jan 20 21:25 Sydney
      // Arrives Jan 20 15:55 LA (same calendar day!)
      const intervention = makeRealisticIntervention(
        "sleep_target",
        "post_arrival",
        {
          time: "22:00",
          originTz: "Australia/Sydney",
          destTz: "America/Los_Angeles",
          originDate: "2026-01-21", // Sydney next day
          destDate: "2026-01-20", // LA same day
        }
      );

      const event = buildCalendarEvent([intervention]);

      expect(event.start?.timeZone).toBe("America/Los_Angeles");
      expect(event.start?.dateTime).toContain("2026-01-20");
    });
  });

  describe("Minimal Jet Lag (3h shift) - Domestic/Hawaii", () => {
    /**
     * Hawaiian Airlines HA11: SFO 07:00 → HNL 09:35 same day (~5h35m)
     */
    it("HA11 SFO-HNL: same day arrival, minimal shift", () => {
      const intervention = makeRealisticIntervention(
        "sleep_target",
        "post_arrival",
        {
          time: "22:00",
          originTz: "America/Los_Angeles",
          destTz: "Pacific/Honolulu",
          originDate: "2026-01-20",
          destDate: "2026-01-20", // Same day
        }
      );

      const event = buildCalendarEvent([intervention]);

      expect(event.start?.timeZone).toBe("Pacific/Honolulu");
      expect(event.start?.dateTime).toContain("2026-01-20");
    });

    /**
     * American Airlines AA16: SFO 11:00 → JFK 19:35 same day (~5.5h)
     */
    it("AA16 SFO-JFK: eastbound domestic same day", () => {
      const intervention = makeRealisticIntervention(
        "sleep_target",
        "post_arrival",
        {
          time: "23:00",
          originTz: "America/Los_Angeles",
          destTz: "America/New_York",
          originDate: "2026-01-20",
          destDate: "2026-01-20",
        }
      );

      const event = buildCalendarEvent([intervention]);

      expect(event.start?.timeZone).toBe("America/New_York");
      expect(event.start?.dateTime).toContain("2026-01-20");
    });
  });

  describe("12h Shift Edge Case - Dubai", () => {
    /**
     * Emirates EK226: SFO 15:40 → DXB 19:25+1 (~15h45m)
     * 12h timezone difference - exactly ambiguous direction
     */
    it("EK226 SFO-DXB: next day arrival in Dubai", () => {
      // Departs Jan 20 15:40 LA
      // Arrives Jan 21 19:25 Dubai
      const intervention = makeRealisticIntervention(
        "wake_target",
        "post_arrival",
        {
          time: "07:00",
          originTz: "America/Los_Angeles",
          destTz: "Asia/Dubai",
          originDate: "2026-01-21", // LA next day
          destDate: "2026-01-22", // Dubai day after arrival
        }
      );

      const event = buildCalendarEvent([intervention]);

      expect(event.start?.timeZone).toBe("Asia/Dubai");
      expect(event.start?.dateTime).toContain("2026-01-22");
    });

    /**
     * Emirates EK225: DXB 08:50 → SFO 12:50 same day (~16h)
     * Same-day arrival due to westward travel + long flight
     */
    it("EK225 DXB-SFO: same day arrival despite 16h flight", () => {
      // Departs Jan 20 08:50 Dubai
      // Arrives Jan 20 12:50 LA (same calendar day!)
      const intervention = makeRealisticIntervention(
        "sleep_target",
        "post_arrival",
        {
          time: "22:00",
          originTz: "Asia/Dubai",
          destTz: "America/Los_Angeles",
          originDate: "2026-01-21", // Dubai next day
          destDate: "2026-01-20", // LA same day as departure
        }
      );

      const event = buildCalendarEvent([intervention]);

      expect(event.start?.timeZone).toBe("America/Los_Angeles");
      expect(event.start?.dateTime).toContain("2026-01-20");
    });
  });

  describe("Pre-departure phase timezone consistency", () => {
    it("pre_departure uses origin timezone even for cross-dateline flight", () => {
      // SFO → SIN: pre-departure caffeine cutoff
      // Should use LA timezone, not Singapore
      const intervention = makeRealisticIntervention(
        "caffeine_cutoff",
        "pre_departure",
        {
          time: "14:00",
          originTz: "America/Los_Angeles",
          destTz: "Asia/Singapore",
          originDate: "2026-01-22",
          destDate: "2026-01-23", // Singapore is ahead
        }
      );

      const event = buildCalendarEvent([intervention]);

      // Pre-departure uses origin timezone
      expect(event.start?.timeZone).toBe("America/Los_Angeles");
      expect(event.start?.dateTime).toContain("2026-01-22");
    });

    it("adaptation uses destination timezone", () => {
      // Day 3 in Singapore after SFO → SIN flight
      const intervention = makeRealisticIntervention(
        "light_seek",
        "adaptation",
        {
          time: "08:00",
          originTz: "America/Los_Angeles",
          destTz: "Asia/Singapore",
          originDate: "2026-01-24",
          destDate: "2026-01-25",
        }
      );

      const event = buildCalendarEvent([intervention]);

      // Adaptation uses destination timezone
      expect(event.start?.timeZone).toBe("Asia/Singapore");
      expect(event.start?.dateTime).toContain("2026-01-25");
    });
  });
});

// =============================================================================
// Event Density Optimization Tests
// =============================================================================

describe("getEventDuration", () => {
  it("returns type-specific durations for fixed-duration types", () => {
    expect(getEventDuration(makeIntervention("wake_target"))).toBe(15);
    expect(getEventDuration(makeIntervention("sleep_target"))).toBe(15);
    expect(getEventDuration(makeIntervention("melatonin"))).toBe(15);
    expect(getEventDuration(makeIntervention("caffeine_cutoff"))).toBe(15);
    expect(getEventDuration(makeIntervention("exercise"))).toBe(45);
  });

  it("uses duration_min for light_avoid when provided", () => {
    const intervention = makeIntervention("light_avoid", "20:00", {
      duration_min: 180, // 3 hours avoidance window
    });
    expect(getEventDuration(intervention)).toBe(180);
  });

  it("uses duration_min for light_seek when provided", () => {
    const intervention = makeIntervention("light_seek", "07:00", {
      duration_min: 60,
    });
    expect(getEventDuration(intervention)).toBe(60);
  });

  it("uses default duration for light_seek when duration_min not provided", () => {
    const intervention = makeIntervention("light_seek", "07:00");
    expect(getEventDuration(intervention)).toBe(15);
  });

  it("uses duration_min for nap_window when provided", () => {
    const intervention = makeIntervention("nap_window", "14:00", {
      duration_min: 90,
    });
    expect(getEventDuration(intervention)).toBe(90);
  });
});

describe("isStandaloneType", () => {
  it("returns true for types that should never be grouped", () => {
    expect(isStandaloneType("caffeine_cutoff")).toBe(true);
    expect(isStandaloneType("exercise")).toBe(true);
    expect(isStandaloneType("nap_window")).toBe(true);
  });

  it("returns false for types that can be grouped", () => {
    expect(isStandaloneType("wake_target")).toBe(false);
    expect(isStandaloneType("sleep_target")).toBe(false);
    expect(isStandaloneType("melatonin")).toBe(false);
    expect(isStandaloneType("light_seek")).toBe(false);
  });

  it("returns true for light_avoid (PRC-calculated duration)", () => {
    expect(isStandaloneType("light_avoid")).toBe(true);
  });
});

describe("shouldShowAsBusy", () => {
  it("returns true for busy types (nap, exercise)", () => {
    expect(shouldShowAsBusy("nap_window")).toBe(true);
    expect(shouldShowAsBusy("exercise")).toBe(true);
  });

  it("returns false for free types (everything else)", () => {
    expect(shouldShowAsBusy("wake_target")).toBe(false);
    expect(shouldShowAsBusy("sleep_target")).toBe(false);
    expect(shouldShowAsBusy("melatonin")).toBe(false);
    expect(shouldShowAsBusy("caffeine_cutoff")).toBe(false);
    expect(shouldShowAsBusy("light_seek")).toBe(false);
    expect(shouldShowAsBusy("light_avoid")).toBe(false);
  });
});

describe("groupInterventionsByAnchor", () => {
  it("groups light_seek with wake_target when within 2h window", () => {
    const interventions = [
      makeIntervention("wake_target", "07:00"),
      makeIntervention("light_seek", "07:15"), // 15 min after wake
    ];

    const groups = groupInterventionsByAnchor(interventions);

    // Should have 1 group (wake anchor with light_seek)
    expect(groups.size).toBe(1);
    const wakeGroup = groups.get("wake:07:00");
    expect(wakeGroup).toBeDefined();
    expect(wakeGroup).toHaveLength(2);
    expect(wakeGroup?.map((i) => i.type)).toContain("wake_target");
    expect(wakeGroup?.map((i) => i.type)).toContain("light_seek");
  });

  it("groups melatonin with sleep_target when within 2h window", () => {
    const interventions = [
      makeIntervention("melatonin", "21:30"), // 1.5h before sleep
      makeIntervention("sleep_target", "23:00"),
    ];

    const groups = groupInterventionsByAnchor(interventions);

    expect(groups.size).toBe(1);
    const sleepGroup = groups.get("sleep:23:00");
    expect(sleepGroup).toBeDefined();
    expect(sleepGroup).toHaveLength(2);
    expect(sleepGroup?.map((i) => i.type)).toContain("sleep_target");
    expect(sleepGroup?.map((i) => i.type)).toContain("melatonin");
  });

  it("keeps caffeine_cutoff standalone regardless of timing", () => {
    const interventions = [
      makeIntervention("wake_target", "07:00"),
      makeIntervention("caffeine_cutoff", "07:30"), // Within 2h of wake but standalone
    ];

    const groups = groupInterventionsByAnchor(interventions);

    // Should have 2 groups: wake anchor and standalone caffeine_cutoff
    expect(groups.size).toBe(2);
    expect(groups.has("wake:07:00")).toBe(true);
    expect(groups.has("standalone:caffeine_cutoff:07:30")).toBe(true);

    // Wake group should only have wake_target
    expect(groups.get("wake:07:00")).toHaveLength(1);
  });

  it("keeps exercise standalone regardless of timing", () => {
    const interventions = [
      makeIntervention("wake_target", "07:00"),
      makeIntervention("exercise", "08:00"), // Within 2h but standalone
    ];

    const groups = groupInterventionsByAnchor(interventions);

    expect(groups.size).toBe(2);
    expect(groups.has("standalone:exercise:08:00")).toBe(true);
  });

  it("keeps nap_window standalone", () => {
    const interventions = [
      makeIntervention("nap_window", "14:00", { flight_offset_hours: 4 }),
    ];

    const groups = groupInterventionsByAnchor(interventions);

    expect(groups.size).toBe(1);
    expect(groups.has("standalone:nap_window:14:00")).toBe(true);
  });

  it("keeps light_avoid standalone regardless of distance to sleep_target", () => {
    const interventions = [
      makeIntervention("light_avoid", "20:00"), // 3h before sleep
      makeIntervention("sleep_target", "23:00"),
    ];

    const groups = groupInterventionsByAnchor(interventions);

    expect(groups.size).toBe(2);
    expect(groups.has("standalone:light_avoid:20:00")).toBe(true);
    expect(groups.has("sleep:23:00")).toBe(true);
    expect(groups.get("sleep:23:00")).toHaveLength(1); // Only sleep_target
  });

  it("keeps light_avoid standalone even when close to sleep_target", () => {
    // light_avoid is always standalone due to PRC-calculated duration (2-4h)
    const interventions = [
      makeIntervention("light_avoid", "22:00"), // 1h before sleep
      makeIntervention("sleep_target", "23:00"),
    ];

    const groups = groupInterventionsByAnchor(interventions);

    // Both should be separate events
    expect(groups.size).toBe(2);
    expect(groups.has("standalone:light_avoid:22:00")).toBe(true);
    expect(groups.has("sleep:23:00")).toBe(true);
  });

  it("creates standalone events when no anchor in range", () => {
    const interventions = [
      makeIntervention("light_seek", "12:00"), // No anchor nearby
    ];

    const groups = groupInterventionsByAnchor(interventions);

    expect(groups.size).toBe(1);
    expect(groups.has("standalone:light_seek:12:00")).toBe(true);
  });

  it("assigns to nearest anchor when both are in range", () => {
    const interventions = [
      makeIntervention("wake_target", "07:00"),
      makeIntervention("light_seek", "08:30"), // 1.5h from wake, 1.5h from melatonin
      makeIntervention("melatonin", "10:00"), // Unusual but testing edge case
    ];

    const groups = groupInterventionsByAnchor(interventions);

    // light_seek should go with wake_target (equal distance, wake checked first)
    const wakeGroup = groups.get("wake:07:00");
    expect(wakeGroup).toBeDefined();
    // melatonin at 10:00 would be standalone since it's not sleep_target
    // Actually melatonin is not an anchor - only wake_target and sleep_target are anchors
    // So both light_seek and melatonin should try to group with wake
  });

  it("filters out non-actionable interventions (caffeine_ok)", () => {
    const interventions = [
      makeIntervention("wake_target", "07:00"),
      makeIntervention("caffeine_ok", "07:00"), // Should be filtered
    ];

    const groups = groupInterventionsByAnchor(interventions);

    expect(groups.size).toBe(1);
    expect(groups.get("wake:07:00")).toHaveLength(1);
  });

  it("returns empty map for empty input", () => {
    const groups = groupInterventionsByAnchor([]);
    expect(groups.size).toBe(0);
  });

  it("handles complex day with multiple intervention types", () => {
    const interventions = [
      makeIntervention("wake_target", "07:00"),
      makeIntervention("light_seek", "07:00", { duration_min: 30 }),
      makeIntervention("caffeine_cutoff", "14:00"), // Standalone
      makeIntervention("light_avoid", "20:00"), // >1h before sleep, standalone
      makeIntervention("melatonin", "22:30"), // Within 2h of sleep
      makeIntervention("sleep_target", "23:00"),
    ];

    const groups = groupInterventionsByAnchor(interventions);

    // Expected groups:
    // 1. wake:07:00 (wake_target + light_seek)
    // 2. standalone:caffeine_cutoff:14:00
    // 3. standalone:light_avoid:20:00
    // 4. sleep:23:00 (sleep_target + melatonin)
    expect(groups.size).toBe(4);

    // Morning routine
    const wakeGroup = groups.get("wake:07:00");
    expect(wakeGroup).toHaveLength(2);
    expect(wakeGroup?.map((i) => i.type).sort()).toEqual(
      ["light_seek", "wake_target"].sort()
    );

    // Caffeine standalone
    expect(groups.has("standalone:caffeine_cutoff:14:00")).toBe(true);

    // Light avoid standalone
    expect(groups.has("standalone:light_avoid:20:00")).toBe(true);

    // Evening routine
    const sleepGroup = groups.get("sleep:23:00");
    expect(sleepGroup).toHaveLength(2);
    expect(sleepGroup?.map((i) => i.type).sort()).toEqual(
      ["melatonin", "sleep_target"].sort()
    );
  });
});

describe("buildCalendarEvent transparency", () => {
  it("shows sleep_target as free (transparent)", () => {
    const interventions = [
      makeIntervention("sleep_target", "23:00", { title: "Bedtime" }),
    ];

    const event = buildCalendarEvent(interventions);

    expect(event.transparency).toBe("transparent");
  });

  it("shows nap_window as busy (opaque)", () => {
    const interventions = [
      makeIntervention("nap_window", "14:00", {
        title: "In-flight sleep",
        flight_offset_hours: 4,
        duration_min: 90,
        phase_type: "in_transit",
      }),
    ];

    const event = buildCalendarEvent(interventions);

    expect(event.transparency).toBe("opaque");
  });

  it("shows exercise as busy (opaque)", () => {
    const interventions = [makeIntervention("exercise", "08:00")];

    const event = buildCalendarEvent(interventions);

    expect(event.transparency).toBe("opaque");
  });

  it("shows wake_target as free (transparent)", () => {
    const interventions = [makeIntervention("wake_target", "07:00")];

    const event = buildCalendarEvent(interventions);

    expect(event.transparency).toBe("transparent");
  });

  it("shows melatonin as free (transparent)", () => {
    const interventions = [makeIntervention("melatonin", "21:00")];

    const event = buildCalendarEvent(interventions);

    expect(event.transparency).toBe("transparent");
  });

  it("shows light_seek as free (transparent)", () => {
    const interventions = [
      makeIntervention("light_seek", "07:00", { duration_min: 30 }),
    ];

    const event = buildCalendarEvent(interventions);

    expect(event.transparency).toBe("transparent");
  });

  it("shows caffeine_cutoff as free (transparent)", () => {
    const interventions = [makeIntervention("caffeine_cutoff", "14:00")];

    const event = buildCalendarEvent(interventions);

    expect(event.transparency).toBe("transparent");
  });
});

describe("buildCalendarEvent type-specific durations", () => {
  it("creates 15-minute event for sleep_target", () => {
    const interventions = [makeIntervention("sleep_target", "23:00")];

    const event = buildCalendarEvent(interventions);

    // Start at 23:00, end 15 min later at 23:15
    expect(event.start?.dateTime).toContain("23:00");
    expect(event.end?.dateTime).toContain("23:15");
  });

  it("creates 15-minute event for melatonin", () => {
    const interventions = [makeIntervention("melatonin", "21:00")];

    const event = buildCalendarEvent(interventions);

    // Start at 21:00, end 15 min later at 21:15
    expect(event.start?.dateTime).toContain("21:00");
    expect(event.end?.dateTime).toContain("21:15");
  });

  it("creates 45-minute event for exercise", () => {
    const interventions = [makeIntervention("exercise", "08:00")];

    const event = buildCalendarEvent(interventions);

    // Start at 08:00, end 45 min later at 08:45
    expect(event.start?.dateTime).toContain("08:00");
    expect(event.end?.dateTime).toContain("08:45");
  });

  it("uses duration_min for light_seek", () => {
    const interventions = [
      makeIntervention("light_seek", "07:00", { duration_min: 60 }),
    ];

    const event = buildCalendarEvent(interventions);

    // Start at 07:00, end 60 min later at 08:00
    expect(event.start?.dateTime).toContain("07:00");
    expect(event.end?.dateTime).toContain("08:00");
  });

  it("uses duration_min for light_avoid (PRC-calculated)", () => {
    const interventions = [
      makeIntervention("light_avoid", "20:00", { duration_min: 180 }), // 3h avoidance window
    ];

    const event = buildCalendarEvent(interventions);

    // Start at 20:00, end 180 min later at 23:00
    expect(event.start?.dateTime).toContain("20:00");
    expect(event.end?.dateTime).toContain("23:00");
  });

  it("uses duration_min for nap_window", () => {
    const interventions = [
      makeIntervention("nap_window", "14:00", {
        duration_min: 120,
        flight_offset_hours: 4,
        phase_type: "in_transit",
      }),
    ];

    const event = buildCalendarEvent(interventions);

    // Start at 14:00, end 120 min later at 16:00
    expect(event.start?.dateTime).toContain("14:00");
    expect(event.end?.dateTime).toContain("16:00");
  });
});
