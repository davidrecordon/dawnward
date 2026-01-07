/**
 * Schedule manipulation utilities
 */

import type { DaySchedule, Intervention, PhaseType } from "@/types/schedule";

/**
 * Convert time string to sortable minutes.
 * Only treats sleep_target at 00:00-05:59 as "late night" for sorting.
 * Wake times in early morning should still sort first.
 */
function toSortableMinutes(time: string, type?: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes;
  // Only treat sleep_target at 00:00-05:59 as late night
  if (type === "sleep_target" && hours < 6) {
    return totalMinutes + 24 * 60;
  }
  return totalMinutes;
}

/**
 * Phase order for chronological sorting.
 * Earlier phases come before later phases in the day.
 */
const PHASE_ORDER: Record<PhaseType, number> = {
  preparation: 0,
  pre_departure: 1,
  in_transit: 2,
  in_transit_ulr: 2,
  post_arrival: 3,
  adaptation: 4,
};

/**
 * Merge phases that share the same date into single day entries.
 *
 * The V2 scheduler can return multiple phases per day (e.g., pre_departure
 * and in_transit on the same date). This function combines their interventions
 * into a single DaySchedule per date for cleaner UI rendering.
 *
 * Key behaviors:
 * - Tags each intervention with its source phase's timezone
 * - Sorts by phase order (preparation → pre_departure → in_transit → post_arrival)
 * - Within same timezone, sorts by time
 *
 * @param interventions - Array of DaySchedule from the API (may have duplicate dates)
 * @returns Array of DaySchedule with one entry per unique date
 */
export function mergePhasesByDate(interventions: DaySchedule[]): DaySchedule[] {
  const byDate = new Map<string, DaySchedule>();

  // Sort phases by type order first (preparation < pre_departure < in_transit < post_arrival)
  const sortedPhases = [...interventions].sort((a, b) => {
    const orderA = a.phase_type ? (PHASE_ORDER[a.phase_type] ?? 99) : 99;
    const orderB = b.phase_type ? (PHASE_ORDER[b.phase_type] ?? 99) : 99;
    return orderA - orderB;
  });

  for (const phase of sortedPhases) {
    const existing = byDate.get(phase.date);

    // Tag items with their source timezone
    const taggedItems: Intervention[] = phase.items.map((item) => ({
      ...item,
      timezone: phase.timezone,
    }));

    if (existing) {
      // Append items (already in phase order)
      existing.items.push(...taggedItems);
      // Use the lower day number for labeling
      if (phase.day < existing.day) {
        existing.day = phase.day;
      }
    } else {
      // First phase for this date - clone it
      byDate.set(phase.date, {
        ...phase,
        items: taggedItems,
      });
    }
  }

  // Sort items within each day: maintain phase order, sort by time within same timezone
  for (const day of byDate.values()) {
    day.items.sort((a, b) => {
      // If different timezones, keep the phase order (items were added in phase order)
      if (a.timezone !== b.timezone) {
        return 0;
      }
      // In-transit items: sort by flight position
      if (
        a.flight_offset_hours !== undefined &&
        b.flight_offset_hours !== undefined
      ) {
        return a.flight_offset_hours - b.flight_offset_hours;
      }
      // Regular items: chronological with late-night awareness
      return toSortableMinutes(a.time, a.type) - toSortableMinutes(b.time, b.type);
    });
  }

  // Return sorted by date
  return Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}
