/**
 * Timezone calculation utilities for trip planning
 */

/**
 * Get the UTC offset in hours for a timezone at a specific date
 * Uses Intl.DateTimeFormat to get the offset
 */
function getTimezoneOffsetHours(timezone: string, date: Date): number {
  // Create formatters for UTC and the target timezone
  const utcFormat = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const tzFormat = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  // Get the time parts
  const utcParts = utcFormat.formatToParts(date);
  const tzParts = tzFormat.formatToParts(date);

  const utcHour = parseInt(utcParts.find((p) => p.type === "hour")?.value || "0");
  const utcMinute = parseInt(utcParts.find((p) => p.type === "minute")?.value || "0");
  const tzHour = parseInt(tzParts.find((p) => p.type === "hour")?.value || "0");
  const tzMinute = parseInt(tzParts.find((p) => p.type === "minute")?.value || "0");

  // Calculate difference in hours
  let hourDiff = tzHour - utcHour;
  const minuteDiff = tzMinute - utcMinute;

  // Handle day boundary crossing
  if (hourDiff > 12) hourDiff -= 24;
  if (hourDiff < -12) hourDiff += 24;

  return hourDiff + minuteDiff / 60;
}

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
  const originOffset = getTimezoneOffsetHours(originTz, referenceDate);
  const destOffset = getTimezoneOffsetHours(destTz, referenceDate);

  return destOffset - originOffset;
}

/**
 * Format time shift as display string
 * e.g., "+16h", "-8h", "+5.5h"
 */
export function formatTimeShift(hours: number): string {
  const sign = hours >= 0 ? "+" : "";
  // Round to nearest half hour for display
  const rounded = Math.round(hours * 2) / 2;

  if (rounded % 1 === 0) {
    return `${sign}${rounded}h`;
  }
  return `${sign}${rounded}h`;
}

/**
 * Parse datetime-local string and get UTC milliseconds for a given timezone.
 * The datetime-local format is "YYYY-MM-DDTHH:MM" and represents local time
 * in the specified timezone, NOT the browser's timezone.
 */
function getUtcMillisForLocalTime(
  datetimeLocal: string,
  timezone: string
): number {
  // Parse components from datetime-local string (e.g., "2026-01-28T08:30")
  const [datePart, timePart] = datetimeLocal.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  // Create a UTC date with the same calendar values
  // This gives us a reference point without browser timezone interference
  const utcDate = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  // Get the offset for this timezone at this approximate time
  // We use the UTC date as reference since we need to know the offset
  const offset = getTimezoneOffsetHours(timezone, new Date(utcDate));

  // The datetime-local value represents local time in the target timezone.
  // To get UTC: if local time is 08:30 and offset is -8 (Pacific),
  // then UTC = 08:30 - (-8) = 16:30 UTC
  // So we subtract the offset (in ms) from our reference
  return utcDate - offset * 60 * 60 * 1000;
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
    // Convert both times to UTC milliseconds, interpreting each in its timezone
    const depUTC = getUtcMillisForLocalTime(departureDateTime, originTz);
    const arrUTC = getUtcMillisForLocalTime(arrivalDateTime, destTz);

    // Calculate duration in milliseconds
    const durationMs = arrUTC - depUTC;

    if (durationMs < 0) {
      return null; // Invalid: arrival before departure
    }

    const totalMinutes = Math.round(durationMs / (1000 * 60));
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
