/**
 * Time format utilities for 12-hour/24-hour display.
 * Uses a simple boolean: true = 24-hour, false = 12-hour (default).
 */

/**
 * Format a time string for display.
 * @param time - Time in "HH:MM" 24-hour format
 * @param use24Hour - If true, display as 24-hour; if false (default), display as 12-hour with AM/PM
 */
export function formatTimeDisplay(time: string, use24Hour = false): string {
  const [hours, minutes] = time.split(":").map(Number);

  if (use24Hour) {
    // 24-hour format: "09:30", "14:00", "00:00"
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }

  // 12-hour format: "9:30 AM", "2:00 PM", "12:00 AM"
  const period = hours >= 12 ? "PM" : "AM";
  const displayHour = hours % 12 || 12;
  return `${displayHour}:${minutes.toString().padStart(2, "0")} ${period}`;
}
