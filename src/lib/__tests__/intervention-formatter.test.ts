import { describe, it, expect } from "vitest";
import {
  INTERVENTION_EMOJI,
  CONDENSED_DESCRIPTIONS,
  getInterventionEmoji,
  getCondensedDescription,
  formatTimeForText,
  formatInterventionForText,
  formatFlightOffset,
  groupByFlightPhase,
  formatFlightDayForEmail,
  formatDayForText,
} from "../intervention-formatter";
import type {
  Intervention,
  InterventionType,
  DaySchedule,
} from "@/types/schedule";

// All intervention types from the schema
const ALL_INTERVENTION_TYPES: InterventionType[] = [
  "wake_target",
  "light_seek",
  "light_avoid",
  "caffeine_ok",
  "caffeine_cutoff",
  "melatonin",
  "sleep_target",
  "nap_window",
  "exercise",
];

function makeIntervention(
  type: InterventionType,
  time: string,
  overrides: Partial<Intervention> = {}
): Intervention {
  return {
    type,
    title: `Test ${type}`,
    description: `Description for ${type}`,
    origin_time: time,
    dest_time: time,
    origin_date: "2026-01-20",
    dest_date: "2026-01-20",
    origin_tz: "America/Los_Angeles",
    dest_tz: "Europe/London",
    phase_type: "preparation",
    show_dual_timezone: false,
    ...overrides,
  };
}

describe("INTERVENTION_EMOJI", () => {
  it("has an emoji for every intervention type", () => {
    for (const type of ALL_INTERVENTION_TYPES) {
      expect(INTERVENTION_EMOJI[type]).toBeDefined();
      expect(typeof INTERVENTION_EMOJI[type]).toBe("string");
      expect(INTERVENTION_EMOJI[type].length).toBeGreaterThan(0);
    }
  });

  it("has unique emojis for key types", () => {
    // These types should be visually distinct
    const keyTypes: InterventionType[] = [
      "wake_target",
      "sleep_target",
      "melatonin",
      "caffeine_cutoff",
    ];
    const emojis = keyTypes.map((t) => INTERVENTION_EMOJI[t]);
    const uniqueEmojis = new Set(emojis);
    expect(uniqueEmojis.size).toBe(keyTypes.length);
  });
});

describe("CONDENSED_DESCRIPTIONS", () => {
  it("has a description for every intervention type", () => {
    for (const type of ALL_INTERVENTION_TYPES) {
      expect(CONDENSED_DESCRIPTIONS[type]).toBeDefined();
      expect(typeof CONDENSED_DESCRIPTIONS[type]).toBe("string");
      expect(CONDENSED_DESCRIPTIONS[type].length).toBeGreaterThan(0);
    }
  });

  it("descriptions are action-oriented", () => {
    // Descriptions should start with a verb or action word
    expect(CONDENSED_DESCRIPTIONS.wake_target).toMatch(/^Wake/);
    expect(CONDENSED_DESCRIPTIONS.light_seek).toMatch(/^Get/);
    expect(CONDENSED_DESCRIPTIONS.light_avoid).toMatch(/^Avoid/);
    expect(CONDENSED_DESCRIPTIONS.melatonin).toMatch(/^Take/);
    expect(CONDENSED_DESCRIPTIONS.sleep_target).toMatch(/^Aim/);
  });
});

describe("getInterventionEmoji", () => {
  it("returns the correct emoji for each type", () => {
    expect(getInterventionEmoji("wake_target")).toBe("☀️");
    expect(getInterventionEmoji("sleep_target")).toBe("😴");
    expect(getInterventionEmoji("melatonin")).toBe("💊");
    expect(getInterventionEmoji("caffeine_cutoff")).toBe("🚫");
  });

  it("returns default emoji for unknown type", () => {
    // @ts-expect-error - testing invalid type
    expect(getInterventionEmoji("unknown_type")).toBe("📋");
  });
});

describe("getCondensedDescription", () => {
  it("returns the correct description for each type", () => {
    expect(
      getCondensedDescription(makeIntervention("wake_target", "07:00"))
    ).toBe("Wake up to help shift your clock");
    expect(
      getCondensedDescription(makeIntervention("light_seek", "07:00"))
    ).toBe("Get 30+ min bright light");
  });

  it("returns default description for unknown type", () => {
    expect(
      getCondensedDescription(
        makeIntervention("unknown_type" as InterventionType, "07:00")
      )
    ).toBe("Follow this intervention");
  });

  it("prefers scheduler-generated summary over static description", () => {
    const intervention = makeIntervention("wake_target", "07:00", {
      summary: "Wake at 6:30 AM — shifting 1h earlier",
    });
    expect(getCondensedDescription(intervention)).toBe(
      "Wake at 6:30 AM — shifting 1h earlier"
    );
  });

  it("falls back to title for nap_window without summary", () => {
    const intervention = makeIntervention("nap_window", "10:00", {
      title: "Sleep opportunity (~5h)",
    });
    expect(getCondensedDescription(intervention)).toBe(
      "Sleep opportunity (~5h)"
    );
  });

  it("falls back to static description when no summary", () => {
    const intervention = makeIntervention("melatonin", "21:00");
    expect(getCondensedDescription(intervention)).toBe(
      "Take melatonin to shift rhythm"
    );
  });
});

describe("formatTimeForText", () => {
  it("formats time in 12-hour format by default", () => {
    expect(formatTimeForText("07:00", false)).toBe("7:00 AM");
    expect(formatTimeForText("13:30", false)).toBe("1:30 PM");
    expect(formatTimeForText("00:00", false)).toBe("12:00 AM");
    expect(formatTimeForText("12:00", false)).toBe("12:00 PM");
    expect(formatTimeForText("23:59", false)).toBe("11:59 PM");
  });

  it("formats time in 24-hour format when specified", () => {
    expect(formatTimeForText("07:00", true)).toBe("07:00");
    expect(formatTimeForText("13:30", true)).toBe("13:30");
    expect(formatTimeForText("00:00", true)).toBe("00:00");
    expect(formatTimeForText("23:59", true)).toBe("23:59");
  });

  it("pads minutes correctly", () => {
    expect(formatTimeForText("09:05", false)).toBe("9:05 AM");
    expect(formatTimeForText("14:00", false)).toBe("2:00 PM");
  });
});

describe("formatInterventionForText", () => {
  it("formats intervention with emoji, time, and description", () => {
    const intervention = makeIntervention("wake_target", "07:00");
    const result = formatInterventionForText(intervention, false);
    expect(result).toBe("☀️  7:00 AM   Wake up to help shift your clock");
  });

  it("respects 24-hour format", () => {
    const intervention = makeIntervention("wake_target", "07:00");
    const result = formatInterventionForText(intervention, true);
    expect(result).toBe("☀️  07:00   Wake up to help shift your clock");
  });

  it("uses dest_time for post-arrival phases", () => {
    const intervention = makeIntervention("wake_target", "07:00", {
      origin_time: "23:00",
      dest_time: "07:00",
      phase_type: "adaptation",
    });
    const result = formatInterventionForText(intervention, false);
    expect(result).toContain("7:00 AM");
  });
});

describe("formatFlightOffset", () => {
  it("formats whole hours", () => {
    expect(formatFlightOffset(4)).toBe("~4h into flight");
    expect(formatFlightOffset(1)).toBe("~1h into flight");
  });

  it("formats half hours", () => {
    expect(formatFlightOffset(4.5)).toBe("~4.5h into flight");
    expect(formatFlightOffset(2.3)).toBe("~2.5h into flight");
  });

  it("handles edge cases", () => {
    expect(formatFlightOffset(0)).toBe("~0h into flight");
    expect(formatFlightOffset(0.1)).toBe("~0h into flight");
    expect(formatFlightOffset(0.5)).toBe("~0.5h into flight");
  });
});

describe("groupByFlightPhase", () => {
  it("groups interventions by phase type", () => {
    const items: Intervention[] = [
      makeIntervention("light_seek", "06:00", { phase_type: "pre_departure" }),
      makeIntervention("nap_window", "10:00", { phase_type: "in_transit" }),
      makeIntervention("light_avoid", "20:00", { phase_type: "post_arrival" }),
    ];

    const groups = groupByFlightPhase(items);

    expect(groups.beforeBoarding).toHaveLength(1);
    expect(groups.beforeBoarding[0].type).toBe("light_seek");

    expect(groups.onThePlane).toHaveLength(1);
    expect(groups.onThePlane[0].type).toBe("nap_window");

    expect(groups.afterLanding).toHaveLength(1);
    expect(groups.afterLanding[0].type).toBe("light_avoid");
  });

  it("handles preparation phase as before boarding", () => {
    const items: Intervention[] = [
      makeIntervention("caffeine_cutoff", "14:00", {
        phase_type: "preparation",
      }),
    ];

    const groups = groupByFlightPhase(items);
    expect(groups.beforeBoarding).toHaveLength(1);
  });

  it("handles adaptation phase as after landing", () => {
    const items: Intervention[] = [
      makeIntervention("wake_target", "07:00", { phase_type: "adaptation" }),
    ];

    const groups = groupByFlightPhase(items);
    expect(groups.afterLanding).toHaveLength(1);
  });

  it("handles in_transit_ulr as on the plane", () => {
    const items: Intervention[] = [
      makeIntervention("nap_window", "10:00", { phase_type: "in_transit_ulr" }),
    ];

    const groups = groupByFlightPhase(items);
    expect(groups.onThePlane).toHaveLength(1);
  });

  it("returns empty arrays when no items", () => {
    const groups = groupByFlightPhase([]);
    expect(groups.beforeBoarding).toHaveLength(0);
    expect(groups.onThePlane).toHaveLength(0);
    expect(groups.afterLanding).toHaveLength(0);
  });
});

describe("formatFlightDayForEmail", () => {
  it("formats a complete flight day with all sections", () => {
    const daySchedule: DaySchedule = {
      day: 0,
      date: "2026-01-20",
      items: [
        makeIntervention("light_seek", "06:00", {
          phase_type: "pre_departure",
        }),
        makeIntervention("nap_window", "10:00", {
          phase_type: "in_transit",
          flight_offset_hours: 4,
        }),
        makeIntervention("light_avoid", "20:00", {
          phase_type: "post_arrival",
        }),
      ],
    };

    const result = formatFlightDayForEmail(
      daySchedule,
      false,
      "09:00",
      "17:00",
      "LAX",
      "LHR"
    );

    expect(result).toContain("BEFORE BOARDING");
    expect(result).toContain("ON THE PLANE");
    expect(result).toContain("AFTER LANDING");
    expect(result).toContain("LAX → LHR departs");
    expect(result).toContain("Arrive at LHR");
  });

  it("shows flight offset for in-transit items", () => {
    const daySchedule: DaySchedule = {
      day: 0,
      date: "2026-01-20",
      items: [
        makeIntervention("nap_window", "10:00", {
          phase_type: "in_transit",
          flight_offset_hours: 4.5,
        }),
      ],
    };

    const result = formatFlightDayForEmail(daySchedule, false);
    expect(result).toContain("~4.5h into flight");
  });

  it("respects 24-hour format preference", () => {
    const daySchedule: DaySchedule = {
      day: 0,
      date: "2026-01-20",
      items: [
        makeIntervention("wake_target", "07:00", {
          phase_type: "pre_departure",
        }),
      ],
    };

    const result12h = formatFlightDayForEmail(daySchedule, false);
    const result24h = formatFlightDayForEmail(daySchedule, true);

    expect(result12h).toContain("7:00 AM");
    expect(result24h).toContain("07:00");
  });
});

describe("formatDayForText", () => {
  it("formats all interventions in a day", () => {
    const daySchedule: DaySchedule = {
      day: -1,
      date: "2026-01-19",
      items: [
        makeIntervention("wake_target", "07:00"),
        makeIntervention("light_seek", "07:30"),
        makeIntervention("sleep_target", "22:00"),
      ],
    };

    const result = formatDayForText(daySchedule, false);
    const lines = result.trim().split("\n");

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("☀️");
    expect(lines[0]).toContain("7:00 AM");
    expect(lines[1]).toContain("🌅");
    expect(lines[2]).toContain("😴");
  });

  it("returns message for empty day", () => {
    const daySchedule: DaySchedule = {
      day: -1,
      date: "2026-01-19",
      items: [],
    };

    const result = formatDayForText(daySchedule);
    expect(result).toContain("No scheduled interventions");
  });

  it("respects 24-hour format", () => {
    const daySchedule: DaySchedule = {
      day: -1,
      date: "2026-01-19",
      items: [makeIntervention("wake_target", "07:00")],
    };

    const result = formatDayForText(daySchedule, true);
    expect(result).toContain("07:00");
    expect(result).not.toContain("AM");
  });
});
