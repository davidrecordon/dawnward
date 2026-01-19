/**
 * Locale detection utilities for time format preferences.
 */

/**
 * Detect if user's browser locale prefers 24-hour time format.
 *
 * Uses the Intl.DateTimeFormat API to check the user's locale settings.
 * Returns false on the server or if detection fails.
 */
export function detectUser24HourPreference(): boolean {
  if (typeof window === "undefined") return false; // SSR safety

  try {
    const formatter = new Intl.DateTimeFormat(undefined, { hour: "numeric" });
    const options = formatter.resolvedOptions();

    // hour12: true = 12-hour, false = 24-hour
    if (options.hour12 !== undefined) {
      return !options.hour12;
    }

    // Fallback: check for AM/PM in formatted output
    const testDate = new Date(2026, 0, 1, 13, 0, 0); // 1 PM
    const formatted = formatter.format(testDate);
    return !/(AM|PM)/i.test(formatted);
  } catch {
    return false;
  }
}
