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

/**
 * Convert HH:MM time string to minutes since midnight.
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** 12 hours in minutes - threshold for detecting midnight crossing */
const TWELVE_HOURS_MINUTES = 720;
/** 24 hours in minutes */
const TWENTY_FOUR_HOURS_MINUTES = 1440;

/**
 * Calculate time deviation handling midnight crossing.
 *
 * For sleep/wake times that cross midnight, naive subtraction gives wrong results:
 * - Sleep target 23:00, actual 02:00: naive = -21 hours, actual = +3 hours late
 *
 * This function assumes the smallest reasonable deviation (< 12 hours).
 * If naive deviation exceeds 12 hours, we assume midnight crossing and adjust.
 *
 * @param plannedTime - Planned time in HH:MM format
 * @param actualTime - Actual time in HH:MM format
 * @returns Deviation in minutes (positive = late, negative = early)
 *
 * @example
 * // Sleep target 23:00, actual 02:00 (next day)
 * calculateDeviation("23:00", "02:00") // returns 180 (3 hours late)
 *
 * @example
 * // Wake target 07:00, actual 05:30 (early)
 * calculateDeviation("07:00", "05:30") // returns -90 (1.5 hours early)
 */
export function calculateDeviation(
  plannedTime: string,
  actualTime: string
): number {
  const plannedMinutes = timeToMinutes(plannedTime);
  const actualMinutes = timeToMinutes(actualTime);

  let deviation = actualMinutes - plannedMinutes;

  // If deviation is more negative than -12 hours, assume actual is next day
  // Example: planned 23:00 (1380), actual 02:00 (120)
  // Naive: 120 - 1380 = -1260 (21 hours early - wrong!)
  // Adjusted: -1260 + 1440 = 180 (3 hours late - correct!)
  if (deviation < -TWELVE_HOURS_MINUTES) {
    deviation += TWENTY_FOUR_HOURS_MINUTES;
  }

  // If deviation is more positive than +12 hours, assume actual is previous day
  // Example: planned 02:00 (120), actual 23:00 (1380)
  // Naive: 1380 - 120 = 1260 (21 hours late - wrong!)
  // Adjusted: 1260 - 1440 = -180 (3 hours early - correct!)
  if (deviation > TWELVE_HOURS_MINUTES) {
    deviation -= TWENTY_FOUR_HOURS_MINUTES;
  }

  return deviation;
}
