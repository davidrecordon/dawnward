import { describe, it, expect } from "vitest";
import {
  getInterventionStyle,
  formatTime,
  getDayLabel,
  formatShortDate,
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
