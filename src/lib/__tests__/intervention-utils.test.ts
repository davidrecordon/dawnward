import { describe, it, expect } from "vitest";
import {
  getInterventionStyle,
  formatTime,
  getDayLabel,
  formatShortDate,
  formatFlightOffset,
  formatFlightPhase,
  isEditableIntervention,
  formatDualTimezones,
} from "../intervention-utils";
import type { Intervention } from "@/types/schedule";

describe("getInterventionStyle", () => {
  it("returns correct style for light_seek", () => {
    const style = getInterventionStyle("light_seek");
    expect(style.bgColor).toBe("bg-amber-100");
    expect(style.textColor).toBe("text-amber-600");
    expect(style.label).toBe("Seek Light");
  });

  it("returns correct style for light_avoid", () => {
    const style = getInterventionStyle("light_avoid");
    expect(style.bgColor).toBe("bg-indigo-100");
    expect(style.textColor).toBe("text-indigo-600");
    expect(style.label).toBe("Avoid Light");
  });

  it("returns correct style for melatonin", () => {
    const style = getInterventionStyle("melatonin");
    expect(style.bgColor).toBe("bg-emerald-100");
    expect(style.textColor).toBe("text-emerald-600");
    expect(style.label).toBe("Melatonin");
  });

  it("returns correct style for caffeine_ok", () => {
    const style = getInterventionStyle("caffeine_ok");
    expect(style.bgColor).toBe("bg-orange-100");
    expect(style.textColor).toBe("text-orange-600");
    expect(style.label).toBe("Caffeine OK");
  });

  it("returns correct style for caffeine_cutoff", () => {
    const style = getInterventionStyle("caffeine_cutoff");
    expect(style.bgColor).toBe("bg-slate-100");
    expect(style.textColor).toBe("text-slate-500");
    expect(style.label).toBe("Caffeine Cutoff");
  });

  it("returns correct style for exercise", () => {
    const style = getInterventionStyle("exercise");
    expect(style.bgColor).toBe("bg-sky-100");
    expect(style.textColor).toBe("text-sky-600");
    expect(style.label).toBe("Exercise");
  });

  it("returns correct style for sleep_target", () => {
    const style = getInterventionStyle("sleep_target");
    expect(style.bgColor).toBe("bg-purple-100");
    expect(style.textColor).toBe("text-purple-600");
    expect(style.label).toBe("Sleep Target");
  });

  it("returns correct style for wake_target", () => {
    const style = getInterventionStyle("wake_target");
    expect(style.bgColor).toBe("bg-amber-100");
    expect(style.textColor).toBe("text-amber-600");
    expect(style.label).toBe("Wake Target");
  });

  it("returns default style for unknown type", () => {
    // @ts-expect-error - Testing unknown type handling
    const style = getInterventionStyle("unknown_type");
    expect(style.bgColor).toBe("bg-slate-100");
    expect(style.textColor).toBe("text-slate-600");
    expect(style.label).toBe("Unknown");
  });

  it("returns icon component for each type", () => {
    const types = [
      "light_seek",
      "light_avoid",
      "melatonin",
      "caffeine_ok",
      "caffeine_cutoff",
      "exercise",
      "sleep_target",
      "wake_target",
    ] as const;

    for (const type of types) {
      const style = getInterventionStyle(type);
      expect(style.icon).toBeDefined();
      // Lucide icons are React forwardRef components (objects with $$typeof)
      expect(style.icon).toHaveProperty("$$typeof");
    }
  });
});

describe("formatTime", () => {
  describe("12-hour format (default)", () => {
    it("converts true format to false AM format", () => {
      expect(formatTime("00:00")).toBe("12:00 AM");
      expect(formatTime("01:30")).toBe("1:30 AM");
      expect(formatTime("09:15")).toBe("9:15 AM");
      expect(formatTime("11:59")).toBe("11:59 AM");
    });

    it("converts true format to false PM format", () => {
      expect(formatTime("12:00")).toBe("12:00 PM");
      expect(formatTime("13:30")).toBe("1:30 PM");
      expect(formatTime("18:45")).toBe("6:45 PM");
      expect(formatTime("23:59")).toBe("11:59 PM");
    });

    it("handles edge cases", () => {
      expect(formatTime("00:01")).toBe("12:01 AM");
      expect(formatTime("12:01")).toBe("12:01 PM");
    });

    it("pads minutes correctly", () => {
      expect(formatTime("09:05")).toBe("9:05 AM");
      expect(formatTime("14:00")).toBe("2:00 PM");
    });

    it("uses 12-hour format when explicitly specified", () => {
      expect(formatTime("14:30", false)).toBe("2:30 PM");
      expect(formatTime("09:00", false)).toBe("9:00 AM");
    });
  });

  describe("24-hour format", () => {
    it("preserves morning hours with leading zero", () => {
      expect(formatTime("00:00", true)).toBe("00:00");
      expect(formatTime("01:30", true)).toBe("01:30");
      expect(formatTime("09:15", true)).toBe("09:15");
      expect(formatTime("11:59", true)).toBe("11:59");
    });

    it("preserves afternoon/evening hours", () => {
      expect(formatTime("12:00", true)).toBe("12:00");
      expect(formatTime("13:30", true)).toBe("13:30");
      expect(formatTime("18:45", true)).toBe("18:45");
      expect(formatTime("23:59", true)).toBe("23:59");
    });

    it("handles edge cases at midnight and noon", () => {
      expect(formatTime("00:01", true)).toBe("00:01");
      expect(formatTime("12:01", true)).toBe("12:01");
    });

    it("pads single-digit hours with leading zero", () => {
      expect(formatTime("09:05", true)).toBe("09:05");
      expect(formatTime("05:00", true)).toBe("05:00");
    });

    it("does not include AM/PM", () => {
      const morning = formatTime("09:00", true);
      const afternoon = formatTime("15:00", true);
      expect(morning).not.toContain("AM");
      expect(morning).not.toContain("PM");
      expect(afternoon).not.toContain("AM");
      expect(afternoon).not.toContain("PM");
    });
  });
});

describe("getDayLabel", () => {
  describe("standard flights (no same-day arrival)", () => {
    it("returns 'Day -X' for negative days", () => {
      expect(getDayLabel(-1)).toBe("Day -1");
      expect(getDayLabel(-2)).toBe("Day -2");
      expect(getDayLabel(-5)).toBe("Day -5");
    });

    it("returns 'Flight Day' for day 0", () => {
      expect(getDayLabel(0)).toBe("Flight Day");
    });

    it("returns 'Arrival' for day 1", () => {
      expect(getDayLabel(1)).toBe("Arrival");
    });

    it("returns 'Day +X' for days after arrival", () => {
      expect(getDayLabel(2)).toBe("Day +2");
      expect(getDayLabel(3)).toBe("Day +3");
      expect(getDayLabel(10)).toBe("Day +10");
    });
  });

  describe("same-day arrival (westbound flights)", () => {
    it("returns 'Flight & Arrival Day' for day 0 with hasSameDayArrival", () => {
      expect(getDayLabel(0, true)).toBe("Flight & Arrival Day");
    });

    it("returns 'Day -X' for negative days (unaffected by hasSameDayArrival)", () => {
      expect(getDayLabel(-1, true)).toBe("Day -1");
      expect(getDayLabel(-2, true)).toBe("Day -2");
    });

    it("returns 'Arrival' for day 1 (but day 1 usually doesn't exist for same-day)", () => {
      // Note: For same-day arrivals, day 1 typically doesn't exist in the schedule
      // because the arrival is merged into day 0. This test documents behavior if it did.
      expect(getDayLabel(1, true)).toBe("Arrival");
    });

    it("shifts day numbers down by 1 for days after arrival", () => {
      // For same-day arrivals: day 2 → Day +1, day 3 → Day +2, etc.
      expect(getDayLabel(2, true)).toBe("Day +1");
      expect(getDayLabel(3, true)).toBe("Day +2");
      expect(getDayLabel(4, true)).toBe("Day +3");
    });

    it("handles hasSameDayArrival=false same as undefined", () => {
      expect(getDayLabel(0, false)).toBe("Flight Day");
      expect(getDayLabel(2, false)).toBe("Day +2");
    });
  });
});

describe("formatShortDate", () => {
  it("formats date to short format (Mon DD)", () => {
    const result = formatShortDate("2026-01-28");
    expect(result).toBe("Jan 28");
  });

  it("handles different months", () => {
    expect(formatShortDate("2026-06-15")).toBe("Jun 15");
    expect(formatShortDate("2026-12-01")).toBe("Dec 1");
  });

  it("handles single digit days without padding", () => {
    const result = formatShortDate("2026-03-05");
    expect(result).toBe("Mar 5");
  });
});

describe("formatFlightOffset", () => {
  it("formats zero as 'As soon as you can'", () => {
    expect(formatFlightOffset(0)).toBe("As soon as you can");
  });

  it("formats fractional hours under 1 as minutes", () => {
    expect(formatFlightOffset(0.5)).toBe("~30 minutes into flight");
    expect(formatFlightOffset(0.25)).toBe("~15 minutes into flight");
    expect(formatFlightOffset(0.75)).toBe("~45 minutes into flight");
  });

  it("formats whole hours", () => {
    expect(formatFlightOffset(1)).toBe("~1 hours into flight");
    expect(formatFlightOffset(4)).toBe("~4 hours into flight");
    expect(formatFlightOffset(12)).toBe("~12 hours into flight");
  });

  it("rounds fractional hours >= 1 to nearest 0.5", () => {
    expect(formatFlightOffset(4.5)).toBe("~4.5 hours into flight");
    expect(formatFlightOffset(2.25)).toBe("~2.5 hours into flight");
    expect(formatFlightOffset(2.1)).toBe("~2 hours into flight");
    expect(formatFlightOffset(2.8)).toBe("~3 hours into flight");
    expect(formatFlightOffset(5.7)).toBe("~5.5 hours into flight");
  });

  it("rounds minutes to nearest whole number", () => {
    // 0.1 hours = 6 minutes
    expect(formatFlightOffset(0.1)).toBe("~6 minutes into flight");
    // 0.167 hours ≈ 10 minutes
    expect(formatFlightOffset(0.167)).toBe("~10 minutes into flight");
  });
});

describe("formatFlightPhase", () => {
  it("returns 'Early in flight' for first third", () => {
    expect(formatFlightPhase(2, 17)).toBe("Early in flight");
    expect(formatFlightPhase(5, 17)).toBe("Early in flight");
    expect(formatFlightPhase(0, 15)).toBe("Early in flight");
  });

  it("returns 'Mid-flight' for middle third", () => {
    expect(formatFlightPhase(8, 17)).toBe("Mid-flight");
    expect(formatFlightPhase(6, 15)).toBe("Mid-flight");
    expect(formatFlightPhase(7, 15)).toBe("Mid-flight");
  });

  it("returns 'Later in flight' for final third", () => {
    expect(formatFlightPhase(13, 17)).toBe("Later in flight");
    expect(formatFlightPhase(15, 17)).toBe("Later in flight");
    expect(formatFlightPhase(12, 15)).toBe("Later in flight");
  });

  it("handles boundary cases at 33% and 66%", () => {
    // At exactly 33%, should still be "Early in flight" (progress < 0.33)
    // 5.5/17 = 0.3235 which is < 0.33
    expect(formatFlightPhase(5.5, 17)).toBe("Early in flight");
    // Just past 33%, should be "Mid-flight"
    // 5.7/17 = 0.335 which is >= 0.33
    expect(formatFlightPhase(5.7, 17)).toBe("Mid-flight");
    // Just below 66%, should still be "Mid-flight"
    // 11.1/17 = 0.6529 which is < 0.66
    expect(formatFlightPhase(11.1, 17)).toBe("Mid-flight");
    // At 66% and above, should be "Later in flight"
    // 11.22/17 = 0.66 which is >= 0.66
    expect(formatFlightPhase(11.22, 17)).toBe("Later in flight");
  });
});

describe("isEditableIntervention", () => {
  describe("editable types (discrete timed events)", () => {
    it("returns true for wake_target", () => {
      expect(isEditableIntervention("wake_target")).toBe(true);
    });

    it("returns true for sleep_target", () => {
      expect(isEditableIntervention("sleep_target")).toBe(true);
    });

    it("returns true for melatonin", () => {
      expect(isEditableIntervention("melatonin")).toBe(true);
    });

    it("returns true for exercise", () => {
      expect(isEditableIntervention("exercise")).toBe(true);
    });

    it("returns true for nap_window", () => {
      expect(isEditableIntervention("nap_window")).toBe(true);
    });
  });

  describe("non-editable types (advisory)", () => {
    it("returns false for light_seek", () => {
      expect(isEditableIntervention("light_seek")).toBe(false);
    });

    it("returns false for light_avoid", () => {
      expect(isEditableIntervention("light_avoid")).toBe(false);
    });

    it("returns false for caffeine_ok", () => {
      expect(isEditableIntervention("caffeine_ok")).toBe(false);
    });

    it("returns false for caffeine_cutoff", () => {
      expect(isEditableIntervention("caffeine_cutoff")).toBe(false);
    });
  });
});

describe("formatDualTimezones", () => {
  /** Create a mock intervention with timezone context for testing */
  function createMockIntervention(
    overrides: Partial<Intervention> = {}
  ): Intervention {
    return {
      type: "wake_target",
      title: "Wake Target",
      description: "Time to wake up",
      origin_time: "08:00",
      dest_time: "16:00",
      origin_date: "2026-01-15",
      dest_date: "2026-01-15",
      origin_tz: "America/Los_Angeles",
      dest_tz: "Europe/London",
      phase_type: "in_transit",
      show_dual_timezone: true,
      ...overrides,
    };
  }

  it("returns formatted times when show_dual_timezone is true", () => {
    const intervention = createMockIntervention({
      origin_time: "08:45",
      dest_time: "16:45",
      show_dual_timezone: true,
    });
    const result = formatDualTimezones(intervention);

    expect(result).not.toBeNull();
    expect(result!.originTime).toContain("8:45 AM");
    expect(result!.originTime).toContain("PST");
    expect(result!.destTime).toContain("4:45 PM");
    expect(result!.destTime).toContain("GMT");
  });

  it("returns null when show_dual_timezone is false", () => {
    const intervention = createMockIntervention({
      show_dual_timezone: false,
    });
    const result = formatDualTimezones(intervention);
    expect(result).toBeNull();
  });

  it("handles different timezone pairs", () => {
    const intervention = createMockIntervention({
      origin_time: "21:00",
      dest_time: "14:00",
      origin_tz: "America/Los_Angeles",
      dest_tz: "Asia/Tokyo",
      origin_date: "2026-01-15",
      dest_date: "2026-01-16",
      show_dual_timezone: true,
    });
    const result = formatDualTimezones(intervention);

    expect(result).not.toBeNull();
    expect(result!.originTime).toContain("9:00 PM");
    expect(result!.originTime).toContain("PST");
    expect(result!.destTime).toContain("2:00 PM");
  });

  describe("DST handling", () => {
    it("shows PDT for summer dates in Los Angeles", () => {
      const intervention = createMockIntervention({
        origin_time: "08:00",
        dest_time: "16:00",
        origin_date: "2026-07-15", // Summer - PDT
        dest_date: "2026-07-15",
        origin_tz: "America/Los_Angeles",
        dest_tz: "Europe/London",
        show_dual_timezone: true,
      });
      const result = formatDualTimezones(intervention);

      expect(result).not.toBeNull();
      expect(result!.originTime).toContain("PDT");
    });

    it("shows PST for winter dates in Los Angeles", () => {
      const intervention = createMockIntervention({
        origin_time: "08:00",
        dest_time: "16:00",
        origin_date: "2026-01-15", // Winter - PST
        dest_date: "2026-01-15",
        origin_tz: "America/Los_Angeles",
        dest_tz: "Europe/London",
        show_dual_timezone: true,
      });
      const result = formatDualTimezones(intervention);

      expect(result).not.toBeNull();
      expect(result!.originTime).toContain("PST");
    });

    it("shows British Summer Time abbreviation for summer dates in London", () => {
      const intervention = createMockIntervention({
        origin_time: "08:00",
        dest_time: "16:00",
        origin_date: "2026-07-15", // Summer
        dest_date: "2026-07-15",
        origin_tz: "America/Los_Angeles",
        dest_tz: "Europe/London",
        show_dual_timezone: true,
      });
      const result = formatDualTimezones(intervention);

      expect(result).not.toBeNull();
      // Node.js/V8 may return "GMT+1" instead of "BST" depending on runtime
      expect(result!.destTime).toMatch(/BST|GMT\+1/);
    });

    it("shows GMT for winter dates in London", () => {
      const intervention = createMockIntervention({
        origin_time: "08:00",
        dest_time: "16:00",
        origin_date: "2026-01-15", // Winter - GMT
        dest_date: "2026-01-15",
        origin_tz: "America/Los_Angeles",
        dest_tz: "Europe/London",
        show_dual_timezone: true,
      });
      const result = formatDualTimezones(intervention);

      expect(result).not.toBeNull();
      expect(result!.destTime).toContain("GMT");
    });
  });

  describe("zero timezone shift", () => {
    it("returns null when origin_tz equals dest_tz", () => {
      const intervention = createMockIntervention({
        origin_time: "08:00",
        dest_time: "08:00",
        origin_tz: "America/Los_Angeles",
        dest_tz: "America/Los_Angeles", // Same timezone
        show_dual_timezone: true,
      });
      const result = formatDualTimezones(intervention);

      // No need for dual display when timezones are the same
      expect(result).toBeNull();
    });

    it("returns null for same timezone even with user preference enabled", () => {
      const intervention = createMockIntervention({
        origin_time: "10:00",
        dest_time: "10:00",
        origin_tz: "America/Los_Angeles",
        dest_tz: "America/Los_Angeles", // Same timezone
        show_dual_timezone: false,
      });
      // User preference enabled, but same timezone means no dual display needed
      const result = formatDualTimezones(intervention, true);

      // Same timezone should always return null, regardless of preferences
      expect(result).toBeNull();
    });
  });

  describe("legacy schedule compatibility", () => {
    it("returns null when origin_time is missing", () => {
      const intervention = createMockIntervention({
        origin_time: undefined as unknown as string,
        show_dual_timezone: true,
      });
      const result = formatDualTimezones(intervention);
      expect(result).toBeNull();
    });

    it("returns null when dest_time is missing", () => {
      const intervention = createMockIntervention({
        dest_time: undefined as unknown as string,
        show_dual_timezone: true,
      });
      const result = formatDualTimezones(intervention);
      expect(result).toBeNull();
    });

    it("returns null when origin_tz is missing", () => {
      const intervention = createMockIntervention({
        origin_tz: undefined as unknown as string,
        show_dual_timezone: true,
      });
      const result = formatDualTimezones(intervention);
      expect(result).toBeNull();
    });

    it("returns null when dest_tz is missing", () => {
      const intervention = createMockIntervention({
        dest_tz: undefined as unknown as string,
        show_dual_timezone: true,
      });
      const result = formatDualTimezones(intervention);
      expect(result).toBeNull();
    });

    it("returns null when origin_date is missing", () => {
      const intervention = createMockIntervention({
        origin_date: undefined as unknown as string,
        show_dual_timezone: true,
      });
      const result = formatDualTimezones(intervention);
      expect(result).toBeNull();
    });

    it("returns null when dest_date is missing", () => {
      const intervention = createMockIntervention({
        dest_date: undefined as unknown as string,
        show_dual_timezone: true,
      });
      const result = formatDualTimezones(intervention);
      expect(result).toBeNull();
    });
  });

  describe("24-hour format", () => {
    it("formats times in true format when specified", () => {
      const intervention = createMockIntervention({
        origin_time: "08:45",
        dest_time: "16:45",
        show_dual_timezone: true,
      });
      const result = formatDualTimezones(intervention, false, true);

      expect(result).not.toBeNull();
      expect(result!.originTime).toContain("08:45");
      expect(result!.originTime).toContain("PST");
      expect(result!.destTime).toContain("16:45");
      expect(result!.destTime).toContain("GMT");
    });

    it("formats afternoon times without AM/PM in true format", () => {
      const intervention = createMockIntervention({
        origin_time: "14:30",
        dest_time: "22:30",
        show_dual_timezone: true,
      });
      const result = formatDualTimezones(intervention, false, true);

      expect(result).not.toBeNull();
      expect(result!.originTime).not.toContain("PM");
      expect(result!.destTime).not.toContain("PM");
      expect(result!.originTime).toContain("14:30");
      expect(result!.destTime).toContain("22:30");
    });

    it("formats midnight correctly in true format", () => {
      const intervention = createMockIntervention({
        origin_time: "00:00",
        dest_time: "08:00",
        show_dual_timezone: true,
      });
      const result = formatDualTimezones(intervention, false, true);

      expect(result).not.toBeNull();
      expect(result!.originTime).toContain("00:00");
      expect(result!.destTime).toContain("08:00");
    });

    it("defaults to false format when not specified", () => {
      const intervention = createMockIntervention({
        origin_time: "14:30",
        dest_time: "22:30",
        show_dual_timezone: true,
      });
      const result = formatDualTimezones(intervention);

      expect(result).not.toBeNull();
      expect(result!.originTime).toContain("2:30 PM");
      expect(result!.destTime).toContain("10:30 PM");
    });
  });
});
