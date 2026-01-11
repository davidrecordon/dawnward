import { describe, it, expect } from "vitest";
import {
  getInterventionStyle,
  formatTime,
  getDayLabel,
  formatShortDate,
  formatFlightOffset,
  formatFlightPhase,
  isEditableIntervention,
} from "../intervention-utils";

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
  it("converts 24h format to 12h AM format", () => {
    expect(formatTime("00:00")).toBe("12:00 AM");
    expect(formatTime("01:30")).toBe("1:30 AM");
    expect(formatTime("09:15")).toBe("9:15 AM");
    expect(formatTime("11:59")).toBe("11:59 AM");
  });

  it("converts 24h format to 12h PM format", () => {
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

  it("formats fractional hours >= 1", () => {
    expect(formatFlightOffset(4.5)).toBe("~4.5 hours into flight");
    expect(formatFlightOffset(2.25)).toBe("~2.25 hours into flight");
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
