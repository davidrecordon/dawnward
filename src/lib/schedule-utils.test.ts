/**
 * Tests for schedule-utils sorting logic.
 *
 * Verifies that:
 * 1. sleep_target at early AM (00:00-05:59) sorts as "late night" (end of day)
 * 2. wake_target at early AM sorts as early morning (start of day)
 * 3. mergePhasesByDate correctly combines and sorts items
 */

import { describe, it, expect } from "vitest";
import {
  mergePhasesByDate,
  dayHasMultipleTimezones,
  toSortableMinutes,
} from "./schedule-utils";
import type {
  DaySchedule,
  Intervention,
  InterventionType,
} from "@/types/schedule";

function makeIntervention(
  type: InterventionType,
  time: string,
  extras: Partial<Intervention> = {}
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
    phase_type: "preparation",
    show_dual_timezone: false,
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
    ...extras,
  };
}

describe("toSortableMinutes", () => {
  describe("basic time conversion", () => {
    it("should convert 00:00 to 0 minutes", () => {
      expect(toSortableMinutes("00:00")).toBe(0);
    });

    it("should convert 12:00 to 720 minutes", () => {
      expect(toSortableMinutes("12:00")).toBe(720);
    });

    it("should convert 23:59 to 1439 minutes", () => {
      expect(toSortableMinutes("23:59")).toBe(1439);
    });

    it("should handle times with leading zeros", () => {
      expect(toSortableMinutes("07:30")).toBe(450);
    });
  });

  describe("late night sleep_target handling", () => {
    it("should add 24h offset to sleep_target at 00:00", () => {
      // 00:00 sleep_target should sort after 23:59
      expect(toSortableMinutes("00:00", "sleep_target")).toBe(24 * 60);
    });

    it("should add 24h offset to sleep_target at 01:30", () => {
      expect(toSortableMinutes("01:30", "sleep_target")).toBe(90 + 24 * 60);
    });

    it("should add 24h offset to sleep_target at 05:59", () => {
      // 05:59 is still "late night"
      expect(toSortableMinutes("05:59", "sleep_target")).toBe(359 + 24 * 60);
    });

    it("should NOT add offset to sleep_target at 06:00", () => {
      // 06:00 is morning, not late night
      expect(toSortableMinutes("06:00", "sleep_target")).toBe(360);
    });

    it("should NOT add offset to sleep_target at 22:00", () => {
      // Regular evening sleep time
      expect(toSortableMinutes("22:00", "sleep_target")).toBe(1320);
    });
  });

  describe("other intervention types at early AM", () => {
    it("should NOT add offset to wake_target at 04:00", () => {
      // Wake times in early AM are still morning, not late night
      expect(toSortableMinutes("04:00", "wake_target")).toBe(240);
    });

    it("should NOT add offset to light_seek at 05:00", () => {
      expect(toSortableMinutes("05:00", "light_seek")).toBe(300);
    });

    it("should NOT add offset to melatonin at 02:00", () => {
      expect(toSortableMinutes("02:00", "melatonin")).toBe(120);
    });

    it("should NOT add offset when type is undefined", () => {
      expect(toSortableMinutes("03:00")).toBe(180);
    });
  });

  describe("sorting comparison scenarios", () => {
    it("should make 02:00 sleep_target sort after 23:00 melatonin", () => {
      const sleepMinutes = toSortableMinutes("02:00", "sleep_target");
      const melatoninMinutes = toSortableMinutes("23:00", "melatonin");
      expect(sleepMinutes).toBeGreaterThan(melatoninMinutes);
    });

    it("should make 04:00 wake_target sort before 10:00 caffeine_cutoff", () => {
      const wakeMinutes = toSortableMinutes("04:00", "wake_target");
      const caffeineMinutes = toSortableMinutes("10:00", "caffeine_cutoff");
      expect(wakeMinutes).toBeLessThan(caffeineMinutes);
    });

    it("should make 01:00 sleep_target sort after 22:00 sleep_target", () => {
      const lateNightSleep = toSortableMinutes("01:00", "sleep_target");
      const eveningSleep = toSortableMinutes("22:00", "sleep_target");
      expect(lateNightSleep).toBeGreaterThan(eveningSleep);
    });
  });
});

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
      expect(items[0].dest_time).toBe("04:00");
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
      expect(items[0].dest_time).toBe("05:00");
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
      const times = merged[0].items.map((i) => i.dest_time);

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
            makeIntervention("nap_window", "09:15", {
              flight_offset_hours: 4.5,
            }),
            makeIntervention("nap_window", "22:45", {
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
          [
            makeIntervention("wake_target", "07:00", {
              phase_type: "pre_departure",
            }),
          ],
          { phase_type: "pre_departure" }
        ),
        makeDaySchedule(
          "2025-01-15",
          0,
          [
            makeIntervention("nap_window", "22:00", {
              phase_type: "in_transit",
            }),
          ],
          { phase_type: "in_transit" }
        ),
      ];

      const merged = mergePhasesByDate(phases);

      // Should have one day entry with items from both phases
      expect(merged.length).toBe(1);
      expect(merged[0].items.length).toBe(2);
    });

    it("should preserve phase_type on interventions when merging", () => {
      const phases: DaySchedule[] = [
        makeDaySchedule(
          "2025-01-15",
          0,
          [
            makeIntervention("wake_target", "07:00", {
              phase_type: "pre_departure",
              origin_tz: "America/Los_Angeles",
              dest_tz: "Europe/London",
            }),
          ],
          { phase_type: "pre_departure" }
        ),
        makeDaySchedule(
          "2025-01-15",
          1,
          [
            makeIntervention("light_seek", "10:00", {
              phase_type: "post_arrival",
              origin_tz: "America/Los_Angeles",
              dest_tz: "Europe/London",
            }),
          ],
          { phase_type: "post_arrival" }
        ),
      ];

      const merged = mergePhasesByDate(phases);

      // Items should preserve their phase_type
      const wakeItem = merged[0].items.find((i) => i.type === "wake_target");
      const lightItem = merged[0].items.find((i) => i.type === "light_seek");

      expect(wakeItem?.phase_type).toBe("pre_departure");
      expect(lightItem?.phase_type).toBe("post_arrival");
    });
  });

  describe("same-day arrival detection", () => {
    it("should set hasSameDayArrival when pre_departure and post_arrival share a date", () => {
      // Westbound flight (e.g., CDG→SFO) where departure and arrival are on same calendar day
      const phases: DaySchedule[] = [
        makeDaySchedule(
          "2025-01-15",
          0,
          [
            makeIntervention("wake_target", "07:00", {
              phase_type: "pre_departure",
            }),
          ],
          { phase_type: "pre_departure" }
        ),
        makeDaySchedule(
          "2025-01-15",
          1,
          [
            makeIntervention("sleep_target", "22:00", {
              phase_type: "post_arrival",
            }),
          ],
          { phase_type: "post_arrival" }
        ),
      ];

      const merged = mergePhasesByDate(phases);

      // Should detect same-day arrival
      expect(merged[0].hasSameDayArrival).toBe(true);
    });

    it("should set hasSameDayArrival on ALL days when detected", () => {
      // Full westbound schedule with preparation + flight day + adaptation
      const phases: DaySchedule[] = [
        makeDaySchedule(
          "2025-01-14",
          -1,
          [
            makeIntervention("melatonin", "22:00", {
              phase_type: "preparation",
            }),
          ],
          { phase_type: "preparation" }
        ),
        makeDaySchedule(
          "2025-01-15",
          0,
          [
            makeIntervention("wake_target", "09:00", {
              phase_type: "pre_departure",
            }),
          ],
          { phase_type: "pre_departure" }
        ),
        makeDaySchedule(
          "2025-01-15",
          1,
          [
            makeIntervention("sleep_target", "17:00", {
              phase_type: "post_arrival",
            }),
          ],
          { phase_type: "post_arrival" }
        ),
        makeDaySchedule(
          "2025-01-16",
          2,
          [
            makeIntervention("wake_target", "04:00", {
              phase_type: "adaptation",
            }),
          ],
          { phase_type: "adaptation" }
        ),
      ];

      const merged = mergePhasesByDate(phases);

      // All days should have hasSameDayArrival flag
      expect(merged.length).toBe(3); // Jan 14, 15, 16
      expect(merged[0].hasSameDayArrival).toBe(true); // Day -1
      expect(merged[1].hasSameDayArrival).toBe(true); // Flight & Arrival Day
      expect(merged[2].hasSameDayArrival).toBe(true); // Day +1
    });

    it("should NOT set hasSameDayArrival for eastbound flights", () => {
      // Eastbound flight (e.g., SFO→LHR) where arrival is next day
      const phases: DaySchedule[] = [
        makeDaySchedule(
          "2025-01-15",
          0,
          [
            makeIntervention("wake_target", "07:00", {
              phase_type: "pre_departure",
            }),
          ],
          { phase_type: "pre_departure" }
        ),
        makeDaySchedule(
          "2025-01-16",
          1,
          [
            makeIntervention("sleep_target", "22:00", {
              phase_type: "post_arrival",
            }),
          ],
          { phase_type: "post_arrival" }
        ),
      ];

      const merged = mergePhasesByDate(phases);

      // Should NOT detect same-day arrival (different dates)
      expect(merged[0].hasSameDayArrival).toBeUndefined();
      expect(merged[1].hasSameDayArrival).toBeUndefined();
    });

    it("should NOT set hasSameDayArrival when only pre_departure exists", () => {
      const phases: DaySchedule[] = [
        makeDaySchedule(
          "2025-01-15",
          0,
          [
            makeIntervention("wake_target", "07:00", {
              phase_type: "pre_departure",
            }),
          ],
          { phase_type: "pre_departure" }
        ),
      ];

      const merged = mergePhasesByDate(phases);
      expect(merged[0].hasSameDayArrival).toBeUndefined();
    });

    it("should NOT set hasSameDayArrival when only post_arrival exists", () => {
      const phases: DaySchedule[] = [
        makeDaySchedule(
          "2025-01-15",
          1,
          [
            makeIntervention("sleep_target", "22:00", {
              phase_type: "post_arrival",
            }),
          ],
          { phase_type: "post_arrival" }
        ),
      ];

      const merged = mergePhasesByDate(phases);
      expect(merged[0].hasSameDayArrival).toBeUndefined();
    });

    it("should merge pre_departure and post_arrival into single day entry", () => {
      const phases: DaySchedule[] = [
        makeDaySchedule(
          "2025-01-15",
          0,
          [
            makeIntervention("melatonin", "08:00", {
              phase_type: "pre_departure",
              origin_tz: "Europe/Paris",
              dest_tz: "America/Los_Angeles",
            }),
            makeIntervention("wake_target", "09:00", {
              phase_type: "pre_departure",
              origin_tz: "Europe/Paris",
              dest_tz: "America/Los_Angeles",
            }),
          ],
          { phase_type: "pre_departure" }
        ),
        makeDaySchedule(
          "2025-01-15",
          1,
          [
            makeIntervention("wake_target", "02:00", {
              phase_type: "post_arrival",
              origin_tz: "Europe/Paris",
              dest_tz: "America/Los_Angeles",
            }),
            makeIntervention("sleep_target", "17:00", {
              phase_type: "post_arrival",
              origin_tz: "Europe/Paris",
              dest_tz: "America/Los_Angeles",
            }),
          ],
          { phase_type: "post_arrival" }
        ),
      ];

      const merged = mergePhasesByDate(phases);

      // Should have single day entry with all items
      expect(merged.length).toBe(1);
      expect(merged[0].items.length).toBe(4);
      expect(merged[0].hasSameDayArrival).toBe(true);

      // Items should have their source phase_types
      const preDepartureItems = merged[0].items.filter(
        (i) => i.phase_type === "pre_departure"
      );
      const postArrivalItems = merged[0].items.filter(
        (i) => i.phase_type === "post_arrival"
      );
      expect(preDepartureItems.length).toBe(2);
      expect(postArrivalItems.length).toBe(2);
    });

    it("should sort phases correctly for HKG→SFO same-day cross-dateline flight (CX 870)", () => {
      // CX 870 HKG→SFO: depart 1:30 PM HKG (Feb 15), arrive 9:45 AM SFO (Feb 15)
      // Pre-departure and post-arrival share the same calendar date.
      // Pre-departure dest_times (SFO) can be numerically larger than post-arrival dest_times,
      // but phases must maintain correct order: pre_departure before post_arrival.
      const phases: DaySchedule[] = [
        makeDaySchedule(
          "2026-02-15",
          0,
          [
            makeIntervention("wake_target", "07:00", {
              phase_type: "pre_departure",
              origin_time: "07:00",
              dest_time: "15:00", // Previous day in SFO timezone
              origin_tz: "Asia/Hong_Kong",
              dest_tz: "America/Los_Angeles",
            }),
            makeIntervention("light_seek", "08:00", {
              phase_type: "pre_departure",
              origin_time: "08:00",
              dest_time: "16:00",
              origin_tz: "Asia/Hong_Kong",
              dest_tz: "America/Los_Angeles",
              duration_min: 30,
            }),
            makeIntervention("caffeine_ok", "07:00", {
              phase_type: "pre_departure",
              origin_time: "07:00",
              dest_time: "15:00",
              origin_tz: "Asia/Hong_Kong",
              dest_tz: "America/Los_Angeles",
            }),
          ],
          { phase_type: "pre_departure" }
        ),
        makeDaySchedule(
          "2026-02-15",
          0,
          [
            makeIntervention("nap_window", "21:30", {
              phase_type: "in_transit",
              origin_time: "13:30",
              dest_time: "21:30",
              origin_tz: "Asia/Hong_Kong",
              dest_tz: "America/Los_Angeles",
              flight_offset_hours: 0,
            }),
            makeIntervention("nap_window", "02:00", {
              phase_type: "in_transit",
              origin_time: "18:00",
              dest_time: "02:00",
              origin_tz: "Asia/Hong_Kong",
              dest_tz: "America/Los_Angeles",
              flight_offset_hours: 4.5,
            }),
          ],
          { phase_type: "in_transit" }
        ),
        makeDaySchedule(
          "2026-02-15",
          1,
          [
            makeIntervention("wake_target", "09:30", {
              phase_type: "post_arrival",
              origin_time: "01:30",
              dest_time: "09:30",
              origin_tz: "Asia/Hong_Kong",
              dest_tz: "America/Los_Angeles",
            }),
            makeIntervention("light_seek", "10:00", {
              phase_type: "post_arrival",
              origin_time: "02:00",
              dest_time: "10:00",
              origin_tz: "Asia/Hong_Kong",
              dest_tz: "America/Los_Angeles",
              duration_min: 60,
            }),
            makeIntervention("caffeine_cutoff", "14:00", {
              phase_type: "post_arrival",
              origin_time: "06:00",
              dest_time: "14:00",
              origin_tz: "Asia/Hong_Kong",
              dest_tz: "America/Los_Angeles",
            }),
            makeIntervention("sleep_target", "22:00", {
              phase_type: "post_arrival",
              origin_time: "14:00",
              dest_time: "22:00",
              origin_tz: "Asia/Hong_Kong",
              dest_tz: "America/Los_Angeles",
            }),
          ],
          { phase_type: "post_arrival" }
        ),
      ];

      const merged = mergePhasesByDate(phases);

      // All phases merge into single day
      expect(merged.length).toBe(1);
      expect(merged[0].items.length).toBe(9);
      expect(merged[0].hasSameDayArrival).toBe(true);

      // Verify phase ordering: pre_departure → in_transit → post_arrival
      const phaseOrder = merged[0].items.map((i) => i.phase_type);
      const preDepIndices = phaseOrder
        .map((p, i) => (p === "pre_departure" ? i : -1))
        .filter((i) => i >= 0);
      const inTransitIndices = phaseOrder
        .map((p, i) => (p === "in_transit" ? i : -1))
        .filter((i) => i >= 0);
      const postArrIndices = phaseOrder
        .map((p, i) => (p === "post_arrival" ? i : -1))
        .filter((i) => i >= 0);

      // All pre_departure items should come before in_transit
      expect(Math.max(...preDepIndices)).toBeLessThan(
        Math.min(...inTransitIndices)
      );
      // All in_transit items should come before post_arrival
      expect(Math.max(...inTransitIndices)).toBeLessThan(
        Math.min(...postArrIndices)
      );

      // Within post_arrival, items should be sorted by dest_time
      const postArrItems = merged[0].items.filter(
        (i) => i.phase_type === "post_arrival"
      );
      const postArrTimes = postArrItems.map((i) => i.dest_time);
      expect(postArrTimes).toEqual(["09:30", "10:00", "14:00", "22:00"]);

      // In-transit items sorted by flight_offset_hours
      const transitItems = merged[0].items.filter(
        (i) => i.phase_type === "in_transit"
      );
      expect(transitItems[0].flight_offset_hours).toBe(0);
      expect(transitItems[1].flight_offset_hours).toBe(4.5);
    });

    it("should sort pre_departure items by origin_time, not dest_time", () => {
      // When timezone offset is large, origin_time and dest_time ordering can differ.
      // Pre-departure items should sort by origin_time (what the user sees).
      const phases: DaySchedule[] = [
        makeDaySchedule(
          "2026-02-15",
          0,
          [
            makeIntervention("caffeine_ok", "07:00", {
              phase_type: "pre_departure",
              origin_time: "07:00",
              dest_time: "15:00",
              origin_tz: "Asia/Hong_Kong",
              dest_tz: "America/Los_Angeles",
            }),
            makeIntervention("light_seek", "09:00", {
              phase_type: "pre_departure",
              origin_time: "09:00",
              dest_time: "17:00",
              origin_tz: "Asia/Hong_Kong",
              dest_tz: "America/Los_Angeles",
            }),
          ],
          { phase_type: "pre_departure" }
        ),
      ];

      const merged = mergePhasesByDate(phases);
      const times = merged[0].items.map((i) => i.origin_time);
      expect(times).toEqual(["07:00", "09:00"]);
    });

    it("should sort preparation items by origin_time, not dest_time", () => {
      // Going west (e.g., London → NYC, -5h): origin_time ordering differs from dest_time
      // when late-night handling is involved.
      // sleep_target at 23:00 origin = 18:00 dest. If sorting by dest_time,
      // sleep would appear at 18:00 (afternoon) — wrong! Should be end of day.
      const phases: DaySchedule[] = [
        makeDaySchedule(
          "2026-02-15",
          -1,
          [
            makeIntervention("wake_target", "07:00", {
              phase_type: "preparation",
              origin_time: "07:00",
              dest_time: "02:00",
              origin_tz: "Europe/London",
              dest_tz: "America/New_York",
            }),
            makeIntervention("light_seek", "08:00", {
              phase_type: "preparation",
              origin_time: "08:00",
              dest_time: "03:00",
              origin_tz: "Europe/London",
              dest_tz: "America/New_York",
              duration_min: 60,
            }),
            makeIntervention("melatonin", "22:00", {
              phase_type: "preparation",
              origin_time: "22:00",
              dest_time: "17:00",
              origin_tz: "Europe/London",
              dest_tz: "America/New_York",
            }),
            makeIntervention("sleep_target", "23:00", {
              phase_type: "preparation",
              origin_time: "23:00",
              dest_time: "18:00",
              origin_tz: "Europe/London",
              dest_tz: "America/New_York",
            }),
          ],
          { phase_type: "preparation" }
        ),
      ];

      const merged = mergePhasesByDate(phases);
      const types = merged[0].items.map((i) => i.type);
      // Sorted by origin_time: wake(07), light(08), melatonin(22), sleep(23)
      // If sorted by dest_time: wake(02), light(03), melatonin(17), sleep(18) — same order
      // but with WRONG late-night handling:
      // dest_time "02:00" for wake would be 120min, dest_time "03:00" for light = 180min
      // So the relative order matches here, but the KEY check is that origin times are used:
      expect(types).toEqual([
        "wake_target",
        "light_seek",
        "melatonin",
        "sleep_target",
      ]);
      // Verify origin times are in ascending order
      const originTimes = merged[0].items.map((i) => i.origin_time);
      expect(originTimes).toEqual(["07:00", "08:00", "22:00", "23:00"]);
    });

    it("should sort adaptation items by dest_time, not origin_time", () => {
      // Going east (e.g., NYC → London, +5h): user is at destination.
      // origin_time 02:00 for wake_target = dest_time 07:00.
      // Must sort by dest_time (what user sees at destination).
      const phases: DaySchedule[] = [
        makeDaySchedule(
          "2026-02-18",
          3,
          [
            makeIntervention("sleep_target", "23:00", {
              phase_type: "adaptation",
              origin_time: "18:00",
              dest_time: "23:00",
              origin_tz: "America/New_York",
              dest_tz: "Europe/London",
            }),
            makeIntervention("wake_target", "07:00", {
              phase_type: "adaptation",
              origin_time: "02:00",
              dest_time: "07:00",
              origin_tz: "America/New_York",
              dest_tz: "Europe/London",
            }),
            makeIntervention("light_seek", "08:00", {
              phase_type: "adaptation",
              origin_time: "03:00",
              dest_time: "08:00",
              origin_tz: "America/New_York",
              dest_tz: "Europe/London",
            }),
          ],
          { phase_type: "adaptation" }
        ),
      ];

      const merged = mergePhasesByDate(phases);
      const destTimes = merged[0].items.map((i) => i.dest_time);
      // Sorted by dest_time: wake(07), light(08), sleep(23)
      expect(destTimes).toEqual(["07:00", "08:00", "23:00"]);
    });

    it("should handle late-night sleep_target correctly with origin_time on preparation day", () => {
      // Going east with large shift (e.g., SFO → HKG, +16h):
      // sleep_target origin_time "01:00" should sort as late night (end of day)
      // If code incorrectly uses dest_time "17:00", sleep sorts in afternoon — wrong!
      const phases: DaySchedule[] = [
        makeDaySchedule(
          "2026-02-14",
          -2,
          [
            makeIntervention("sleep_target", "01:00", {
              phase_type: "preparation",
              origin_time: "01:00",
              dest_time: "17:00",
              origin_tz: "America/Los_Angeles",
              dest_tz: "Asia/Hong_Kong",
            }),
            makeIntervention("wake_target", "06:00", {
              phase_type: "preparation",
              origin_time: "06:00",
              dest_time: "22:00",
              origin_tz: "America/Los_Angeles",
              dest_tz: "Asia/Hong_Kong",
            }),
            makeIntervention("melatonin", "23:30", {
              phase_type: "preparation",
              origin_time: "23:30",
              dest_time: "15:30",
              origin_tz: "America/Los_Angeles",
              dest_tz: "Asia/Hong_Kong",
            }),
          ],
          { phase_type: "preparation" }
        ),
      ];

      const merged = mergePhasesByDate(phases);
      const types = merged[0].items.map((i) => i.type);
      // By origin_time: wake(06:00=360), melatonin(23:30=1410), sleep(01:00=1440+60=1500 late night)
      // sleep_target at 01:00 origin should sort LAST (late night)
      expect(types).toEqual(["wake_target", "melatonin", "sleep_target"]);

      // If code used dest_time: wake(22:00=1320), melatonin(15:30=930), sleep(17:00=1020)
      // Order would be: melatonin, sleep, wake — COMPLETELY WRONG
    });

    it("should not mutate input arrays (idempotent on repeated calls)", () => {
      // This test catches the bug where items were pushed to the original
      // phase.items array, causing duplicates on React re-renders
      const phases: DaySchedule[] = [
        makeDaySchedule(
          "2025-01-15",
          0,
          [
            makeIntervention("wake_target", "04:00", {
              phase_type: "pre_departure",
            }),
          ],
          { phase_type: "pre_departure" }
        ),
        makeDaySchedule(
          "2025-01-15",
          0,
          [
            makeIntervention("nap_window", "06:45", {
              phase_type: "in_transit",
              flight_offset_hours: 2,
            }),
          ],
          { phase_type: "in_transit" }
        ),
      ];

      // Record original item counts
      const originalCounts = phases.map((p) => p.items.length);

      // Call mergePhasesByDate multiple times (simulating React re-renders)
      const result1 = mergePhasesByDate(phases);
      const result2 = mergePhasesByDate(phases);
      const result3 = mergePhasesByDate(phases);

      // All results should be identical
      expect(result1[0].items.length).toBe(2);
      expect(result2[0].items.length).toBe(2);
      expect(result3[0].items.length).toBe(2);

      // Original input arrays should not be mutated
      phases.forEach((phase, i) => {
        expect(phase.items.length).toBe(originalCounts[i]);
      });
    });
  });
});

describe("dayHasMultipleTimezones", () => {
  // Note: dayHasMultipleTimezones now determines display timezone based on phase_type:
  // - preparation/pre_departure → uses origin_tz
  // - post_arrival/adaptation → uses dest_tz

  it("returns false for empty interventions", () => {
    expect(dayHasMultipleTimezones([])).toBe(false);
  });

  it("returns false when all interventions have same display timezone", () => {
    // All preparation phase items display in origin_tz
    const interventions: Intervention[] = [
      makeIntervention("wake_target", "07:00", {
        phase_type: "preparation",
        origin_tz: "America/Los_Angeles",
        dest_tz: "Europe/London",
      }),
      makeIntervention("light_seek", "08:00", {
        phase_type: "preparation",
        origin_tz: "America/Los_Angeles",
        dest_tz: "Europe/London",
      }),
      makeIntervention("sleep_target", "22:00", {
        phase_type: "preparation",
        origin_tz: "America/Los_Angeles",
        dest_tz: "Europe/London",
      }),
    ];

    expect(dayHasMultipleTimezones(interventions)).toBe(false);
  });

  it("returns true when interventions display in different timezones", () => {
    // pre_departure items display in origin_tz, post_arrival in dest_tz
    const interventions: Intervention[] = [
      makeIntervention("wake_target", "09:00", {
        phase_type: "pre_departure",
        origin_tz: "Europe/Paris",
        dest_tz: "America/Los_Angeles",
      }),
      makeIntervention("melatonin", "08:00", {
        phase_type: "pre_departure",
        origin_tz: "Europe/Paris",
        dest_tz: "America/Los_Angeles",
      }),
      makeIntervention("sleep_target", "17:00", {
        phase_type: "post_arrival",
        origin_tz: "Europe/Paris",
        dest_tz: "America/Los_Angeles",
      }),
    ];

    // pre_departure shows Europe/Paris, post_arrival shows America/Los_Angeles
    expect(dayHasMultipleTimezones(interventions)).toBe(true);
  });

  it("returns true for Flight & Arrival Day with pre-departure and post-arrival items", () => {
    // Simulates CDG→SFO same-day arrival
    const interventions: Intervention[] = [
      makeIntervention("melatonin", "08:00", {
        phase_type: "pre_departure",
        origin_tz: "Europe/Paris",
        dest_tz: "America/Los_Angeles",
      }),
      makeIntervention("wake_target", "09:00", {
        phase_type: "pre_departure",
        origin_tz: "Europe/Paris",
        dest_tz: "America/Los_Angeles",
      }),
      makeIntervention("wake_target", "02:00", {
        phase_type: "post_arrival",
        origin_tz: "Europe/Paris",
        dest_tz: "America/Los_Angeles",
      }),
      makeIntervention("sleep_target", "17:00", {
        phase_type: "post_arrival",
        origin_tz: "Europe/Paris",
        dest_tz: "America/Los_Angeles",
      }),
    ];

    expect(dayHasMultipleTimezones(interventions)).toBe(true);
  });

  it("returns false for single-timezone adaptation day", () => {
    // Day +1 after arrival - all in destination timezone (all adaptation phase)
    const interventions: Intervention[] = [
      makeIntervention("wake_target", "04:00", {
        phase_type: "adaptation",
        origin_tz: "Europe/Paris",
        dest_tz: "America/Los_Angeles",
      }),
      makeIntervention("light_avoid", "04:00", {
        phase_type: "adaptation",
        origin_tz: "Europe/Paris",
        dest_tz: "America/Los_Angeles",
      }),
      makeIntervention("light_seek", "15:00", {
        phase_type: "adaptation",
        origin_tz: "Europe/Paris",
        dest_tz: "America/Los_Angeles",
      }),
      makeIntervention("sleep_target", "19:00", {
        phase_type: "adaptation",
        origin_tz: "Europe/Paris",
        dest_tz: "America/Los_Angeles",
      }),
    ];

    // All adaptation phase items display in dest_tz (America/Los_Angeles)
    expect(dayHasMultipleTimezones(interventions)).toBe(false);
  });

  it("returns false when all phases use same timezone", () => {
    // Same timezone trip (e.g., LA → LA layover)
    const interventions: Intervention[] = [
      makeIntervention("wake_target", "07:00", {
        phase_type: "preparation",
        origin_tz: "America/Los_Angeles",
        dest_tz: "America/Los_Angeles",
      }),
      makeIntervention("light_seek", "08:00", {
        phase_type: "post_arrival",
        origin_tz: "America/Los_Angeles",
        dest_tz: "America/Los_Angeles",
      }),
    ];

    // Even though phases differ, both timezones are the same
    expect(dayHasMultipleTimezones(interventions)).toBe(false);
  });
});
