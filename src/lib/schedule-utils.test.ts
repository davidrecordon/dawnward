/**
 * Tests for schedule-utils sorting logic.
 *
 * Verifies that:
 * 1. sleep_target at early AM (00:00-05:59) sorts as "late night" (end of day)
 * 2. wake_target at early AM sorts as early morning (start of day)
 * 3. mergePhasesByDate correctly combines and sorts items
 */

import { describe, it, expect } from "vitest";
import { mergePhasesByDate } from "./schedule-utils";
import type { DaySchedule, Intervention } from "@/types/schedule";

function makeIntervention(
  type: string,
  time: string,
  extras: Partial<Intervention> = {}
): Intervention {
  return {
    type,
    time,
    title: `Test ${type}`,
    description: "Test description",
    ...extras,
  };
}

function makeDaySchedule(
  date: string,
  day: number,
  items: Intervention[],
  extras: Partial<DaySchedule> = {}
): DaySchedule {
  return {
    date,
    day,
    items,
    timezone: "America/Los_Angeles",
    ...extras,
  };
}

describe("mergePhasesByDate", () => {
  describe("late night sorting", () => {
    it("should sort sleep_target at 2:00 AM as last item", () => {
      const phases: DaySchedule[] = [
        makeDaySchedule("2025-01-15", 1, [
          makeIntervention("sleep_target", "02:00"),
          makeIntervention("wake_target", "10:00"),
          makeIntervention("caffeine_cutoff", "16:00"),
        ]),
      ];

      const merged = mergePhasesByDate(phases);
      const items = merged[0].items;

      // wake_target should be first
      expect(items[0].type).toBe("wake_target");
      // sleep_target at 2am should be last (late night)
      expect(items[items.length - 1].type).toBe("sleep_target");
    });

    it("should NOT treat wake_target at 4:00 AM as late night", () => {
      const phases: DaySchedule[] = [
        makeDaySchedule("2025-01-15", 0, [
          makeIntervention("caffeine_cutoff", "09:00"),
          makeIntervention("wake_target", "04:00"),
          makeIntervention("sleep_target", "19:00"),
        ]),
      ];

      const merged = mergePhasesByDate(phases);
      const items = merged[0].items;

      // wake_target at 4am should be FIRST (not treated as late night)
      expect(items[0].type).toBe("wake_target");
      expect(items[0].time).toBe("04:00");
    });

    it("should NOT treat light_seek at 5:00 AM as late night", () => {
      const phases: DaySchedule[] = [
        makeDaySchedule("2025-01-15", 1, [
          makeIntervention("caffeine_cutoff", "14:00"),
          makeIntervention("light_seek", "05:00"),
          makeIntervention("sleep_target", "22:00"),
        ]),
      ];

      const merged = mergePhasesByDate(phases);
      const items = merged[0].items;

      // light_seek at 5am should be first
      expect(items[0].type).toBe("light_seek");
      expect(items[0].time).toBe("05:00");
    });

    it("should sort sleep_target at 1:00 AM after 11:00 PM items", () => {
      const phases: DaySchedule[] = [
        makeDaySchedule("2025-01-15", 1, [
          makeIntervention("sleep_target", "01:00"),
          makeIntervention("melatonin", "23:00"),
          makeIntervention("wake_target", "10:00"),
        ]),
      ];

      const merged = mergePhasesByDate(phases);
      const items = merged[0].items;

      // Order: wake (10:00), melatonin (23:00), sleep (01:00 as late night)
      expect(items[0].type).toBe("wake_target");
      expect(items[1].type).toBe("melatonin");
      expect(items[2].type).toBe("sleep_target");
    });
  });

  describe("chronological sorting", () => {
    it("should sort daytime activities chronologically", () => {
      const phases: DaySchedule[] = [
        makeDaySchedule("2025-01-15", 1, [
          makeIntervention("melatonin", "18:00"),
          makeIntervention("light_seek", "08:00"),
          makeIntervention("caffeine_cutoff", "15:00"),
        ]),
      ];

      const merged = mergePhasesByDate(phases);
      const times = merged[0].items.map((i) => i.time);

      expect(times).toEqual(["08:00", "15:00", "18:00"]);
    });
  });

  describe("flight_offset_hours sorting", () => {
    it("should sort in-transit items by flight_offset_hours", () => {
      const phases: DaySchedule[] = [
        makeDaySchedule(
          "2025-01-15",
          0,
          [
            makeIntervention("sleep_window", "09:15", {
              flight_offset_hours: 4.5,
            }),
            makeIntervention("sleep_window", "22:45", {
              flight_offset_hours: 0,
            }),
          ],
          { phase_type: "in_transit" }
        ),
      ];

      const merged = mergePhasesByDate(phases);
      const items = merged[0].items;

      // Should be sorted by flight_offset_hours: 0 before 4.5
      expect(items[0].flight_offset_hours).toBe(0);
      expect(items[1].flight_offset_hours).toBe(4.5);
    });
  });

  describe("phase merging", () => {
    it("should merge multiple phases on the same date", () => {
      const phases: DaySchedule[] = [
        makeDaySchedule(
          "2025-01-15",
          0,
          [makeIntervention("wake_target", "07:00")],
          { phase_type: "pre_departure", timezone: "America/Los_Angeles" }
        ),
        makeDaySchedule(
          "2025-01-15",
          0,
          [makeIntervention("sleep_window", "22:00")],
          { phase_type: "in_transit", timezone: "in_transit" }
        ),
      ];

      const merged = mergePhasesByDate(phases);

      // Should have one day entry with items from both phases
      expect(merged.length).toBe(1);
      expect(merged[0].items.length).toBe(2);
    });

    it("should preserve timezone tags when merging", () => {
      const phases: DaySchedule[] = [
        makeDaySchedule(
          "2025-01-15",
          0,
          [makeIntervention("wake_target", "07:00")],
          { phase_type: "pre_departure", timezone: "America/Los_Angeles" }
        ),
        makeDaySchedule(
          "2025-01-15",
          1,
          [makeIntervention("light_seek", "10:00")],
          { phase_type: "post_arrival", timezone: "Europe/London" }
        ),
      ];

      const merged = mergePhasesByDate(phases);

      // Items should have their source timezone tagged
      const wakeItem = merged[0].items.find((i) => i.type === "wake_target");
      const lightItem = merged[0].items.find((i) => i.type === "light_seek");

      expect(wakeItem?.timezone).toBe("America/Los_Angeles");
      expect(lightItem?.timezone).toBe("Europe/London");
    });
  });
});
