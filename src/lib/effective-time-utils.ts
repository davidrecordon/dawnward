/**
 * Utilities for calculating effective times (considering actuals)
 *
 * The "effective time" is what time an intervention actually happened:
 * - If status is "modified", use actualTime
 * - Otherwise, use the planned time
 *
 * This is used for dynamic grouping: cards should nest based on
 * effective times, not just planned times.
 */

import type {
  Intervention,
  InterventionActual,
  ActualsMap,
} from "@/types/schedule";
import { isEditableIntervention } from "./intervention-utils";
import { getActualKey } from "./actuals-utils";

/**
 * Item types that can be grouped (matches GroupableItem in schedule-utils)
 */
type GroupableItemKind = "intervention" | "departure" | "arrival" | "now";

/**
 * Minimal interface for groupable items (subset of GroupableItem)
 */
interface GroupableItemLike {
  kind: GroupableItemKind;
  time: string;
  data?: Intervention;
}

/**
 * Get the effective time for an intervention, considering actuals.
 *
 * Returns actualTime if status is "modified" and actualTime exists,
 * otherwise returns the planned time.
 *
 * @param intervention - The intervention with planned time
 * @param actual - Optional recorded actual for this intervention
 * @returns The effective time in HH:MM format
 */
export function getEffectiveTime(
  intervention: Intervention,
  actual?: InterventionActual
): string {
  if (actual?.status === "modified" && actual.actualTime) {
    return actual.actualTime;
  }
  return intervention.time;
}

/**
 * Get effective time for a groupable item (handles intervention vs other kinds).
 *
 * For interventions:
 * - Editable types: returns actualTime if modified, else plannedTime
 * - Non-editable types: always returns plannedTime (they cascade with parent)
 *
 * For non-interventions (departure, arrival, now):
 * - Returns their time as-is
 *
 * @param item - The groupable item
 * @param actuals - Optional map of recorded actuals
 * @param dayOffset - Day offset for looking up actuals
 * @returns The effective time in HH:MM format
 */
export function getEffectiveTimeForGroupable(
  item: GroupableItemLike,
  actuals?: ActualsMap,
  dayOffset?: number
): string {
  // Non-interventions use their time as-is
  if (item.kind !== "intervention" || !item.data) {
    return item.time;
  }

  const intervention = item.data;

  // Non-editable interventions always use planned time
  // This ensures they cascade with their parent
  if (!isEditableIntervention(intervention.type)) {
    return item.time;
  }

  // Editable interventions: check for modified actual
  if (actuals && dayOffset !== undefined) {
    const actual = actuals.get(getActualKey(dayOffset, intervention.type));
    return getEffectiveTime(intervention, actual);
  }

  // Default to planned time
  return item.time;
}

/**
 * Determine if a child intervention should stay nested with its parent
 * based on effective times.
 *
 * A child stays nested if:
 * - Its planned time matches the parent's effective time AND one of:
 *   - It's non-editable (cascades with parent, no independent actuals)
 *   - It's skipped (stays nested, shows "Skipped" label)
 *   - Its effective time matches the parent's effective time
 *
 * @param child - The child intervention
 * @param childActual - Optional recorded actual for the child
 * @param parentEffectiveTime - The parent's effective time
 * @returns True if the child should stay nested with the parent
 */
export function shouldChildStayNested(
  child: Intervention,
  childActual: InterventionActual | undefined,
  parentEffectiveTime: string
): boolean {
  // Non-editable children nest only if their planned time matches parent's time
  // (they cascade with parent and don't have independent actuals)
  if (!isEditableIntervention(child.type)) {
    return child.time === parentEffectiveTime;
  }

  // Skipped children stay nested if planned time matches
  // (show "Skipped" label instead of unnesting)
  if (childActual?.status === "skipped") {
    return child.time === parentEffectiveTime;
  }

  // Editable children: compare effective times
  const childEffectiveTime = getEffectiveTime(child, childActual);
  return childEffectiveTime === parentEffectiveTime;
}
