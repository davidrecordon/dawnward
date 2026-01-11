/**
 * Utilities for working with intervention actuals
 */

import type { InterventionActual, ActualsMap } from "@/types/schedule";

/**
 * Generate a unique key for looking up an actual.
 * Format: "dayOffset:interventionType"
 */
export function getActualKey(dayOffset: number, interventionType: string): string {
  return `${dayOffset}:${interventionType}`;
}

/**
 * Build a lookup map from an array of actuals.
 * Keys are in format "dayOffset:interventionType"
 */
export function buildActualsMap(actuals: InterventionActual[]): ActualsMap {
  const map = new Map<string, InterventionActual>();
  for (const actual of actuals) {
    const key = getActualKey(actual.dayOffset, actual.interventionType);
    map.set(key, actual);
  }
  return map;
}
