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
  groupWakeTargetInterventions,
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
          [makeIntervention("wake_target", "07:00")],
          { phase_type: "pre_departure", timezone: "America/Los_Angeles" }
        ),
        makeDaySchedule(
          "2025-01-15",
          0,
          [makeIntervention("nap_window", "22:00")],
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

  describe("same-day arrival detection", () => {
    it("should set hasSameDayArrival when pre_departure and post_arrival share a date", () => {
      // Westbound flight (e.g., CDG→SFO) where departure and arrival are on same calendar day
      const phases: DaySchedule[] = [
        makeDaySchedule(
          "2025-01-15",
          0,
          [makeIntervention("wake_target", "07:00")],
          { phase_type: "pre_departure", timezone: "Europe/Paris" }
        ),
        makeDaySchedule(
          "2025-01-15",
          1,
          [makeIntervention("sleep_target", "22:00")],
          { phase_type: "post_arrival", timezone: "America/Los_Angeles" }
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
          [makeIntervention("melatonin", "22:00")],
          { phase_type: "preparation", timezone: "Europe/Paris" }
        ),
        makeDaySchedule(
          "2025-01-15",
          0,
          [makeIntervention("wake_target", "09:00")],
          { phase_type: "pre_departure", timezone: "Europe/Paris" }
        ),
        makeDaySchedule(
          "2025-01-15",
          1,
          [makeIntervention("sleep_target", "17:00")],
          { phase_type: "post_arrival", timezone: "America/Los_Angeles" }
        ),
        makeDaySchedule(
          "2025-01-16",
          2,
          [makeIntervention("wake_target", "04:00")],
          { phase_type: "adaptation", timezone: "America/Los_Angeles" }
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
          [makeIntervention("wake_target", "07:00")],
          { phase_type: "pre_departure", timezone: "America/Los_Angeles" }
        ),
        makeDaySchedule(
          "2025-01-16",
          1,
          [makeIntervention("sleep_target", "22:00")],
          { phase_type: "post_arrival", timezone: "Europe/London" }
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
          [makeIntervention("wake_target", "07:00")],
          { phase_type: "pre_departure", timezone: "America/Los_Angeles" }
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
          [makeIntervention("sleep_target", "22:00")],
          { phase_type: "post_arrival", timezone: "Europe/London" }
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
            makeIntervention("melatonin", "08:00"),
            makeIntervention("wake_target", "09:00"),
          ],
          { phase_type: "pre_departure", timezone: "Europe/Paris" }
        ),
        makeDaySchedule(
          "2025-01-15",
          1,
          [
            makeIntervention("wake_target", "02:00"),
            makeIntervention("sleep_target", "17:00"),
          ],
          { phase_type: "post_arrival", timezone: "America/Los_Angeles" }
        ),
      ];

      const merged = mergePhasesByDate(phases);

      // Should have single day entry with all items
      expect(merged.length).toBe(1);
      expect(merged[0].items.length).toBe(4);
      expect(merged[0].hasSameDayArrival).toBe(true);

      // Items should have their source timezones
      const parisItems = merged[0].items.filter(
        (i) => i.timezone === "Europe/Paris"
      );
      const laItems = merged[0].items.filter(
        (i) => i.timezone === "America/Los_Angeles"
      );
      expect(parisItems.length).toBe(2);
      expect(laItems.length).toBe(2);
    });
  });
});

describe("dayHasMultipleTimezones", () => {
  it("returns false for empty interventions", () => {
    expect(dayHasMultipleTimezones([])).toBe(false);
  });

  it("returns false when all interventions have the same timezone", () => {
    const interventions: Intervention[] = [
      makeIntervention("wake_target", "07:00", {
        timezone: "America/Los_Angeles",
      }),
      makeIntervention("light_seek", "08:00", {
        timezone: "America/Los_Angeles",
      }),
      makeIntervention("sleep_target", "22:00", {
        timezone: "America/Los_Angeles",
      }),
    ];

    expect(dayHasMultipleTimezones(interventions)).toBe(false);
  });

  it("returns false when interventions have no timezone", () => {
    const interventions: Intervention[] = [
      makeIntervention("wake_target", "07:00"),
      makeIntervention("light_seek", "08:00"),
    ];

    expect(dayHasMultipleTimezones(interventions)).toBe(false);
  });

  it("returns true when interventions have different timezones", () => {
    const interventions: Intervention[] = [
      makeIntervention("wake_target", "09:00", { timezone: "Europe/Paris" }),
      makeIntervention("melatonin", "08:00", { timezone: "Europe/Paris" }),
      makeIntervention("sleep_target", "17:00", {
        timezone: "America/Los_Angeles",
      }),
    ];

    expect(dayHasMultipleTimezones(interventions)).toBe(true);
  });

  it("returns true for Flight & Arrival Day with pre-departure and post-arrival items", () => {
    // Simulates CDG→SFO same-day arrival
    const interventions: Intervention[] = [
      makeIntervention("melatonin", "08:00", { timezone: "Europe/Paris" }),
      makeIntervention("wake_target", "09:00", { timezone: "Europe/Paris" }),
      makeIntervention("wake_target", "02:00", {
        timezone: "America/Los_Angeles",
      }),
      makeIntervention("sleep_target", "17:00", {
        timezone: "America/Los_Angeles",
      }),
    ];

    expect(dayHasMultipleTimezones(interventions)).toBe(true);
  });

  it("returns false for single-timezone adaptation day", () => {
    // Day +1 after arrival - all in destination timezone
    const interventions: Intervention[] = [
      makeIntervention("wake_target", "04:00", {
        timezone: "America/Los_Angeles",
      }),
      makeIntervention("light_avoid", "04:00", {
        timezone: "America/Los_Angeles",
      }),
      makeIntervention("light_seek", "15:00", {
        timezone: "America/Los_Angeles",
      }),
      makeIntervention("sleep_target", "19:00", {
        timezone: "America/Los_Angeles",
      }),
    ];

    expect(dayHasMultipleTimezones(interventions)).toBe(false);
  });

  it("ignores undefined timezone when counting", () => {
    const interventions: Intervention[] = [
      makeIntervention("wake_target", "07:00", {
        timezone: "America/Los_Angeles",
      }),
      makeIntervention("light_seek", "08:00"), // No timezone
      makeIntervention("sleep_target", "22:00", {
        timezone: "America/Los_Angeles",
      }),
    ];

    expect(dayHasMultipleTimezones(interventions)).toBe(false);
  });
});

describe("groupWakeTargetInterventions", () => {
  describe("basic grouping", () => {
    it("should group same-time interventions with wake_target", () => {
      const interventions: Intervention[] = [
        makeIntervention("wake_target", "10:00", {
          timezone: "America/Los_Angeles",
        }),
        makeIntervention("light_seek", "10:00", {
          timezone: "America/Los_Angeles",
        }),
        makeIntervention("caffeine_ok", "10:00", {
          timezone: "America/Los_Angeles",
        }),
      ];

      const result = groupWakeTargetInterventions(interventions);

      expect(result.groups.length).toBe(1);
      expect(result.groups[0].wakeTarget.type).toBe("wake_target");
      expect(result.groups[0].children.length).toBe(2);
      expect(result.groups[0].children.map((c) => c.type)).toEqual([
        "light_seek",
        "caffeine_ok",
      ]);
      expect(result.ungrouped.length).toBe(0);
    });

    it("should not create group for wake_target alone", () => {
      const interventions: Intervention[] = [
        makeIntervention("wake_target", "07:00", {
          timezone: "America/Los_Angeles",
        }),
        makeIntervention("caffeine_cutoff", "14:00", {
          timezone: "America/Los_Angeles",
        }),
      ];

      const result = groupWakeTargetInterventions(interventions);

      expect(result.groups.length).toBe(0);
      expect(result.ungrouped.length).toBe(2);
    });

    it("should not group interventions at different times", () => {
      const interventions: Intervention[] = [
        makeIntervention("wake_target", "07:00", {
          timezone: "America/Los_Angeles",
        }),
        makeIntervention("light_seek", "08:00", {
          timezone: "America/Los_Angeles",
        }),
      ];

      const result = groupWakeTargetInterventions(interventions);

      expect(result.groups.length).toBe(0);
      expect(result.ungrouped.length).toBe(2);
    });
  });

  describe("timezone boundaries", () => {
    it("should not group across timezone boundaries", () => {
      const interventions: Intervention[] = [
        makeIntervention("wake_target", "10:00", { timezone: "Europe/Paris" }),
        makeIntervention("light_seek", "10:00", {
          timezone: "America/Los_Angeles",
        }),
      ];

      const result = groupWakeTargetInterventions(interventions);

      expect(result.groups.length).toBe(0);
      expect(result.ungrouped.length).toBe(2);
    });

    it("should group when both have same timezone", () => {
      const interventions: Intervention[] = [
        makeIntervention("wake_target", "10:00", { timezone: "Europe/Paris" }),
        makeIntervention("light_seek", "10:00", { timezone: "Europe/Paris" }),
      ];

      const result = groupWakeTargetInterventions(interventions);

      expect(result.groups.length).toBe(1);
      expect(result.groups[0].timezone).toBe("Europe/Paris");
    });

    it("should group when both have undefined timezone", () => {
      const interventions: Intervention[] = [
        makeIntervention("wake_target", "10:00"),
        makeIntervention("light_seek", "10:00"),
      ];

      const result = groupWakeTargetInterventions(interventions);

      expect(result.groups.length).toBe(1);
    });
  });

  describe("in-transit handling", () => {
    it("should not group in-transit wake_target", () => {
      const interventions: Intervention[] = [
        makeIntervention("wake_target", "10:00", {
          timezone: "America/Los_Angeles",
          is_in_transit: true,
        }),
        makeIntervention("light_seek", "10:00", {
          timezone: "America/Los_Angeles",
        }),
      ];

      const result = groupWakeTargetInterventions(interventions);

      expect(result.groups.length).toBe(0);
      expect(result.ungrouped.length).toBe(2);
    });

    it("should not include in-transit items as children", () => {
      const interventions: Intervention[] = [
        makeIntervention("wake_target", "10:00", {
          timezone: "America/Los_Angeles",
        }),
        makeIntervention("nap_window", "10:00", {
          timezone: "America/Los_Angeles",
          is_in_transit: true,
          flight_offset_hours: 4.5,
        }),
        makeIntervention("light_seek", "10:00", {
          timezone: "America/Los_Angeles",
        }),
      ];

      const result = groupWakeTargetInterventions(interventions);

      expect(result.groups.length).toBe(1);
      expect(result.groups[0].children.length).toBe(1); // Only light_seek
      expect(result.groups[0].children[0].type).toBe("light_seek");
      expect(result.ungrouped.length).toBe(1); // nap_window ungrouped
      expect(result.ungrouped[0].type).toBe("nap_window");
    });

    it("should not group in-transit wake_target even with non-in-transit same-time items", () => {
      const interventions: Intervention[] = [
        makeIntervention("wake_target", "10:00", {
          timezone: "America/Los_Angeles",
          is_in_transit: true,
        }),
        makeIntervention("light_seek", "10:00", {
          timezone: "America/Los_Angeles",
          is_in_transit: false,
        }),
      ];

      const result = groupWakeTargetInterventions(interventions);

      expect(result.groups.length).toBe(0);
      expect(result.ungrouped.length).toBe(2);
    });
  });

  describe("non-wake_target same-time items", () => {
    it("should not group same-time items without wake_target", () => {
      const interventions: Intervention[] = [
        makeIntervention("light_seek", "10:00", {
          timezone: "America/Los_Angeles",
        }),
        makeIntervention("caffeine_ok", "10:00", {
          timezone: "America/Los_Angeles",
        }),
        makeIntervention("sleep_target", "22:00", {
          timezone: "America/Los_Angeles",
        }),
      ];

      const result = groupWakeTargetInterventions(interventions);

      expect(result.groups.length).toBe(0);
      expect(result.ungrouped.length).toBe(3);
    });
  });

  describe("multiple wake_targets", () => {
    it("should handle multiple wake_targets on different days", () => {
      // Simulates day with pre-departure wake and post-arrival wake
      const interventions: Intervention[] = [
        makeIntervention("wake_target", "07:00", { timezone: "Europe/Paris" }),
        makeIntervention("light_seek", "07:00", { timezone: "Europe/Paris" }),
        makeIntervention("wake_target", "14:00", {
          timezone: "America/Los_Angeles",
        }),
        makeIntervention("caffeine_ok", "14:00", {
          timezone: "America/Los_Angeles",
        }),
      ];

      const result = groupWakeTargetInterventions(interventions);

      expect(result.groups.length).toBe(2);
      expect(result.groups[0].time).toBe("07:00");
      expect(result.groups[0].timezone).toBe("Europe/Paris");
      expect(result.groups[1].time).toBe("14:00");
      expect(result.groups[1].timezone).toBe("America/Los_Angeles");
      expect(result.ungrouped.length).toBe(0);
    });
  });

  describe("order preservation", () => {
    it("should preserve order of ungrouped items", () => {
      const interventions: Intervention[] = [
        makeIntervention("light_seek", "08:00", {
          timezone: "America/Los_Angeles",
        }),
        makeIntervention("caffeine_cutoff", "14:00", {
          timezone: "America/Los_Angeles",
        }),
        makeIntervention("melatonin", "20:00", {
          timezone: "America/Los_Angeles",
        }),
        makeIntervention("sleep_target", "22:00", {
          timezone: "America/Los_Angeles",
        }),
      ];

      const result = groupWakeTargetInterventions(interventions);

      expect(result.ungrouped.map((i) => i.time)).toEqual([
        "08:00",
        "14:00",
        "20:00",
        "22:00",
      ]);
    });
  });
});
