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
    time,
    title: `Test ${type}`,
    description: `Description for ${type}`,
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

    const event = buildCalendarEvent(interventions, "2026-01-15", "America/New_York");

    expect(event.summary).toBe("💊 Take melatonin");
    expect(event.description).toBe("• Take 0.5mg");
    expect(event.start?.timeZone).toBe("America/New_York");
    expect(event.end?.timeZone).toBe("America/New_York");
    expect(event.reminders?.useDefault).toBe(false);
    expect(event.reminders?.overrides?.[0]?.minutes).toBe(15); // melatonin = 15 min
  });

  it("uses anchor intervention for reminder timing", () => {
    const interventions = [
      makeIntervention("wake_target", "07:00"),
      makeIntervention("light_seek", "07:00"),
    ];

    const event = buildCalendarEvent(interventions, "2026-01-15", "America/New_York");

    // wake_target = 30 min reminder
    expect(event.reminders?.overrides?.[0]?.minutes).toBe(30);
  });

  it("uses intervention duration_min when provided", () => {
    const interventions = [
      makeIntervention("light_seek", "07:00", { duration_min: 45 }),
    ];

    const event = buildCalendarEvent(interventions, "2026-01-15", "America/New_York");

    // Start at 07:00, end 45 min later at 07:45
    expect(event.start?.dateTime).toContain("07:00");
    expect(event.end?.dateTime).toContain("07:45");
  });

  it("defaults to 15 minute duration when not specified", () => {
    const interventions = [makeIntervention("melatonin", "21:00")];

    const event = buildCalendarEvent(interventions, "2026-01-15", "America/New_York");

    // Start at 21:00, end 15 min later at 21:15
    expect(event.start?.dateTime).toContain("21:00");
    expect(event.end?.dateTime).toContain("21:15");
  });

  it("throws error for empty interventions", () => {
    expect(() => buildCalendarEvent([], "2026-01-15", "America/New_York")).toThrow(
      "Cannot build event from empty interventions"
    );
  });
});
