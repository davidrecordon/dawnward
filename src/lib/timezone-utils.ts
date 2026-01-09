/**
 * Timezone calculation utilities for trip planning
 * Uses Luxon for robust timezone handling
 */

import { DateTime } from "luxon";

/**
 * Calculate the time shift in hours between two IANA timezones
 * Positive = eastward travel (later local time)
 * Negative = westward travel (earlier local time)
 */
export function calculateTimeShift(
  originTz: string,
  destTz: string,
  referenceDate: Date = new Date()
): number {
  const dt = DateTime.fromJSDate(referenceDate);
  const originOffset = dt.setZone(originTz).offset; // minutes from UTC
  const destOffset = dt.setZone(destTz).offset;

  return (destOffset - originOffset) / 60; // convert to hours
}

/**
 * Format time shift as display string
 * e.g., "+16h", "-8h", "+5.5h"
 */
export function formatTimeShift(hours: number): string {
  const sign = hours >= 0 ? "+" : "";
  // Round to nearest half hour for display
  const rounded = Math.round(hours * 2) / 2;
  return `${sign}${rounded}h`;
}

/**
 * Calculate flight duration from departure and arrival times
 * accounting for timezone differences.
 *
 * IMPORTANT: datetime-local values are interpreted as local time in their
 * respective timezones (departure in originTz, arrival in destTz), regardless
 * of the browser's timezone.
 */
export function calculateFlightDuration(
  departureDateTime: string,
  arrivalDateTime: string,
  originTz: string,
  destTz: string
): { hours: number; minutes: number } | null {
  if (!departureDateTime || !arrivalDateTime) {
    return null;
  }

  try {
    // Parse each datetime in its respective timezone
    const departure = DateTime.fromISO(departureDateTime, { zone: originTz });
    const arrival = DateTime.fromISO(arrivalDateTime, { zone: destTz });

    if (!departure.isValid || !arrival.isValid) {
      return null;
    }

    // Calculate duration in minutes
    const diff = arrival.diff(departure, "minutes");
    const totalMinutes = Math.round(diff.minutes);

    if (totalMinutes < 0) {
      return null; // Invalid: arrival before departure
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return { hours, minutes };
  } catch {
    return null;
  }
}

/**
 * Format duration as display string
 * e.g., "17h", "5h 30m", "12h 15m"
 */
export function formatDuration(hours: number, minutes: number): string {
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
}
