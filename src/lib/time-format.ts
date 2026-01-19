/**
 * Time format type and utilities for 12-hour/24-hour display.
 * This is the single source of truth for time format configuration.
 */

/** Time format type for 12-hour or 24-hour display */
export type TimeFormat = "12h" | "24h";

/** Default time format (matches user expectations in US locale) */
export const DEFAULT_TIME_FORMAT: TimeFormat = "12h";

/**
 * Type guard to validate time format values.
 */
export function isValidTimeFormat(value: unknown): value is TimeFormat {
  return value === "12h" || value === "24h";
}
