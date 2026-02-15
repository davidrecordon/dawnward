/**
 * Schedule manipulation utilities
 */

import type {
  ActualsMap,
  DaySchedule,
  GroupableParent,
  Intervention,
  PhaseType,
  TimedItemGroup,
} from "@/types/schedule";
import { isInTransitPhase, isPreFlightPhase } from "@/types/schedule";
import {
  getEffectiveTimeForGroupable,
  shouldChildStayNested,
} from "./effective-time-utils";
import { getActualKey } from "./actuals-utils";

/**
 * Convert time string to sortable minutes.
 * Only treats sleep_target at 00:00-05:59 as "late night" for sorting.
 * Wake times in early morning should still sort first.
 *
 * @param time - Time string in "HH:MM" format
 * @param type - Optional intervention type (sleep_target gets special handling)
 * @returns Minutes from midnight, with sleep_target at 00:00-05:59 offset by 24h
 */
export function toSortableMinutes(time: string, type?: string): number {
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
export const PHASE_ORDER: Record<PhaseType, number> = {
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
  // Track which phase types exist for each date (for same-day arrival detection)
  const phaseTypesByDate = new Map<string, Set<PhaseType>>();

  // Sort phases by type order first (preparation < pre_departure < in_transit < post_arrival)
  const sortedPhases = [...interventions].sort((a, b) => {
    const orderA = a.phase_type ? (PHASE_ORDER[a.phase_type] ?? 99) : 99;
    const orderB = b.phase_type ? (PHASE_ORDER[b.phase_type] ?? 99) : 99;
    return orderA - orderB;
  });

  for (const phase of sortedPhases) {
    const existing = byDate.get(phase.date);

    // Track phase types for this date
    if (phase.phase_type) {
      if (!phaseTypesByDate.has(phase.date)) {
        phaseTypesByDate.set(phase.date, new Set());
      }
      phaseTypesByDate.get(phase.date)!.add(phase.phase_type);
    }

    if (existing) {
      // Append items (already in phase order)
      existing.items.push(...phase.items);
      // Use the lower day number for labeling
      if (phase.day < existing.day) {
        existing.day = phase.day;
      }
    } else {
      // First phase for this date - clone it (avoid mutating input)
      byDate.set(phase.date, {
        ...phase,
        items: [...phase.items],
      });
    }
  }

  // Check if any date has both pre_departure and post_arrival (same-day arrival)
  let hasSameDayArrival = false;
  for (const phaseTypes of phaseTypesByDate.values()) {
    if (phaseTypes.has("pre_departure") && phaseTypes.has("post_arrival")) {
      hasSameDayArrival = true;
      break;
    }
  }

  // Set hasSameDayArrival flag on ALL days so they can adjust their labels
  if (hasSameDayArrival) {
    for (const day of byDate.values()) {
      day.hasSameDayArrival = true;
    }
  }

  // Sort items within each day by phase order, then by time within same phase
  for (const day of byDate.values()) {
    day.items.sort((a, b) => {
      // Different phases: sort by phase order (preparation → pre_departure → in_transit → post_arrival → adaptation)
      if (a.phase_type !== b.phase_type) {
        const orderA = a.phase_type ? (PHASE_ORDER[a.phase_type] ?? 99) : 99;
        const orderB = b.phase_type ? (PHASE_ORDER[b.phase_type] ?? 99) : 99;
        return orderA - orderB;
      }
      // In-transit items: sort by flight position
      if (
        a.flight_offset_hours !== undefined &&
        b.flight_offset_hours !== undefined
      ) {
        return a.flight_offset_hours - b.flight_offset_hours;
      }
      // Regular items: sort by display time (origin for pre-flight, dest for post-flight)
      const aTime = isPreFlightPhase(a.phase_type)
        ? a.origin_time
        : a.dest_time;
      const bTime = isPreFlightPhase(b.phase_type)
        ? b.origin_time
        : b.dest_time;
      return (
        toSortableMinutes(aTime, a.type) - toSortableMinutes(bTime, b.type)
      );
    });
  }

  // Return sorted by date
  return Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

/**
 * Check if a day's interventions span multiple display timezones.
 *
 * Used to decide whether to show timezone labels on UI elements like
 * the "You are here" marker - only needed when there's ambiguity.
 *
 * With the new model, check if there are interventions from different phase types
 * that would display in different timezones (preparation/pre_departure show origin,
 * post_arrival/adaptation show destination).
 *
 * @param interventions - Array of interventions for a single day
 * @returns true if interventions would display in 2+ distinct timezones
 */
export function dayHasMultipleTimezones(
  interventions: Intervention[]
): boolean {
  const displayTimezones = new Set<string>();

  for (const item of interventions) {
    // Determine which timezone would be displayed based on phase
    if (isPreFlightPhase(item.phase_type)) {
      displayTimezones.add(item.origin_tz);
    } else {
      displayTimezones.add(item.dest_tz);
    }
  }

  return displayTimezones.size > 1;
}

/**
 * Input item for groupTimedItems - matches the TimedItem union from day-section.tsx.
 * Defined here to avoid circular dependencies.
 *
 * Note: Interventions now carry their own timezone context (origin_tz, dest_tz).
 * Markers (arrival, departure, now) still need explicit timezone.
 */
export type GroupableItem =
  | {
      kind: "intervention";
      time: string;
      data: Intervention;
    }
  | { kind: "arrival"; time: string; dest_tz: string }
  | { kind: "departure"; time: string; origin_tz: string }
  | { kind: "now"; time: string; timezone: string };

/**
 * Result of groupTimedItems.
 */
export interface GroupedTimedItems {
  /** Groups with parent (wake_target or arrival) and children */
  groups: TimedItemGroup[];
  /** Items that weren't grouped */
  ungrouped: GroupableItem[];
}

/**
 * Check if an intervention is in-transit based on its phase_type.
 */
function isInTransit(intervention: Intervention): boolean {
  return isInTransitPhase(intervention.phase_type);
}

/**
 * Determine if an item can be a parent in nested card groups.
 *
 * Groupable parents:
 * - wake_target interventions (not in-transit)
 * - arrival markers
 */
function canBeParent(item: GroupableItem): boolean {
  // Arrival markers are always parents
  if (item.kind === "arrival") {
    return true;
  }

  // wake_target interventions (except in-transit ones with unique flight context)
  return (
    item.kind === "intervention" &&
    item.data.type === "wake_target" &&
    !isInTransit(item.data)
  );
}

/**
 * Group timed items that share the same effective time as a groupable parent.
 *
 * Creates "parent + nested children" groups for UI rendering.
 * Groupable parents: wake_target interventions, arrival markers.
 * Children: interventions whose effective time matches the parent's effective time.
 *
 * Effective time logic:
 * - Editable interventions with modified actuals use actualTime
 * - Non-editable interventions always use planned time (cascade with parent)
 * - Skipped interventions stay nested (show "Skipped" label)
 *
 * @param items - Array of timed items for a single day (before sorting)
 * @param actuals - Optional map of recorded actuals for dynamic grouping
 * @param dayOffset - Day offset for looking up actuals (required if actuals provided)
 * @returns Groups (parent with children) and ungrouped items
 */
export function groupTimedItems(
  items: GroupableItem[],
  actuals?: ActualsMap,
  dayOffset?: number
): GroupedTimedItems {
  const groups: TimedItemGroup[] = [];
  const groupedIndices = new Set<number>();

  /**
   * Check if an item can be a child in a nested group.
   *
   * Requirements:
   * - Must be an intervention (not departure/arrival/now markers)
   * - Cannot be in-transit (they have unique flight context)
   * - Cannot also be a parent (prevents double-nesting of wake_target)
   */
  const canBeChild = (
    item: GroupableItem
  ): item is GroupableItem & { kind: "intervention" } =>
    item.kind === "intervention" &&
    !isInTransit(item.data) &&
    !canBeParent(item);

  // Find all parent items and group same-effective-time items with them
  for (let parentIdx = 0; parentIdx < items.length; parentIdx++) {
    const parentItem = items[parentIdx];
    if (!canBeParent(parentItem)) continue;

    // Calculate parent's effective time for child nesting decisions
    const parentEffectiveTime = getEffectiveTimeForGroupable(
      parentItem,
      actuals,
      dayOffset
    );
    const children: Intervention[] = [];

    // Find children whose effective time matches parent's effective time
    for (let childIdx = 0; childIdx < items.length; childIdx++) {
      if (childIdx === parentIdx) continue;

      const childItem = items[childIdx];
      if (!canBeChild(childItem)) continue;

      // Get the child's actual (if any) to check nesting
      const childActual =
        actuals && dayOffset !== undefined
          ? actuals.get(getActualKey(dayOffset, childItem.data.type))
          : undefined;

      // Use shouldChildStayNested for the nesting decision
      // This handles: non-editable always nest, skipped stay nested, effective time comparison
      if (
        shouldChildStayNested(childItem.data, childActual, parentEffectiveTime)
      ) {
        children.push(childItem.data);
        groupedIndices.add(childIdx);
      }
    }

    // Only create a group if there are children
    if (children.length > 0) {
      let parent: GroupableParent;
      if (parentItem.kind === "intervention") {
        parent = { kind: "intervention", data: parentItem.data };
      } else if (parentItem.kind === "arrival") {
        parent = { kind: "arrival", dest_tz: parentItem.dest_tz };
      } else {
        // This shouldn't happen - canBeParent only returns true for intervention and arrival
        continue;
      }

      groups.push({
        parent,
        children,
        time: parentItem.time,
      });
      groupedIndices.add(parentIdx);
    }
  }

  // Collect ungrouped items (preserving order)
  const ungrouped = items.filter((_, index) => !groupedIndices.has(index));

  return { groups, ungrouped };
}
