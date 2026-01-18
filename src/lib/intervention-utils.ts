/**
 * Intervention styling utilities
 * Maps intervention types to icons and colors based on the design system
 */

import {
  Sun,
  EyeOff,
  Pill,
  Coffee,
  Activity,
  Moon,
  type LucideIcon,
} from "lucide-react";
import type { Intervention, InterventionType } from "@/types/schedule";

// Day constants for schedule phases
export const FLIGHT_DAY = 0;
export const ARRIVAL_DAY = 1;

// Flight phase thresholds (as fraction of total flight)
const EARLY_FLIGHT_THRESHOLD = 0.33;
const MID_FLIGHT_THRESHOLD = 0.66;

interface InterventionStyle {
  icon: LucideIcon;
  bgColor: string;
  textColor: string;
  label: string;
}

/**
 * Get styling for an intervention type
 */
export function getInterventionStyle(
  type: InterventionType
): InterventionStyle {
  switch (type) {
    case "light_seek":
      return {
        icon: Sun,
        bgColor: "bg-amber-100",
        textColor: "text-amber-600",
        label: "Seek Light",
      };
    case "light_avoid":
      return {
        icon: EyeOff,
        bgColor: "bg-indigo-100",
        textColor: "text-indigo-600",
        label: "Avoid Light",
      };
    case "melatonin":
      return {
        icon: Pill,
        bgColor: "bg-emerald-100",
        textColor: "text-emerald-600",
        label: "Melatonin",
      };
    case "caffeine_ok":
      return {
        icon: Coffee,
        bgColor: "bg-orange-100",
        textColor: "text-orange-600",
        label: "Caffeine OK",
      };
    case "caffeine_cutoff":
      return {
        icon: Coffee,
        bgColor: "bg-slate-100",
        textColor: "text-slate-500",
        label: "Caffeine Cutoff",
      };
    case "exercise":
      return {
        icon: Activity,
        bgColor: "bg-sky-100",
        textColor: "text-sky-600",
        label: "Exercise",
      };
    case "sleep_target":
      return {
        icon: Moon,
        bgColor: "bg-purple-100",
        textColor: "text-purple-600",
        label: "Sleep Target",
      };
    case "wake_target":
      return {
        icon: Sun,
        bgColor: "bg-amber-100",
        textColor: "text-amber-600",
        label: "Wake Target",
      };
    case "nap_window":
      return {
        icon: Moon,
        bgColor: "bg-purple-100",
        textColor: "text-purple-600",
        label: "Nap Window",
      };
    default:
      return {
        icon: Sun,
        bgColor: "bg-slate-100",
        textColor: "text-slate-600",
        label: "Unknown",
      };
  }
}

/**
 * Format time from HH:MM to a more readable format
 */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
}

/**
 * Get a friendly label for a day number.
 *
 * @param day - Day number relative to departure (negative = prep, 0 = flight, positive = after)
 * @param hasSameDayArrival - True if departure and arrival are on the same calendar day (westbound flights).
 *                           When true, day 0 becomes "Flight & Arrival Day" and subsequent days are shifted
 *                           (day 2 → "Day +1", day 3 → "Day +2", etc.)
 */
export function getDayLabel(day: number, hasSameDayArrival?: boolean): string {
  if (day < FLIGHT_DAY) {
    return `Day ${day}`;
  }
  if (day === FLIGHT_DAY) {
    return hasSameDayArrival ? "Flight & Arrival Day" : "Flight Day";
  }
  if (day === ARRIVAL_DAY) {
    return "Arrival";
  }
  // For same-day arrivals, shift the day numbers down by 1
  const displayDay = hasSameDayArrival ? day - 1 : day;
  return `Day +${displayDay}`;
}

/**
 * Format a date string to a short format (e.g., "Jan 28")
 */
export function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Get timezone abbreviation from IANA timezone string.
 * Uses Intl.DateTimeFormat with timeZoneName: "short" to get abbreviations.
 *
 * Output varies by timezone and browser/runtime:
 * - US timezones: "PST", "PDT", "EST", "EDT" (friendly abbreviations)
 * - UK: "GMT", "BST" (British Summer Time)
 * - Europe: "GMT+1", "GMT+2" (offset format, CET/CEST on some browsers)
 * - Asia: "GMT+9", "GMT+8" (offset format, JST/CST on some browsers)
 *
 * The offset format (GMT+X) appears for timezones without universally
 * recognized abbreviations. This is browser-dependent behavior.
 *
 * @param tz - IANA timezone (e.g., "America/Los_Angeles")
 * @param date - Optional date to determine DST status (defaults to now)
 * @returns Abbreviation like "PST", "PDT", "GMT+1", etc.
 */
export function getTimezoneAbbr(tz: string, date?: Date): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short",
    });
    const parts = formatter.formatToParts(date ?? new Date());
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    return tzPart?.value ?? tz;
  } catch {
    // If timezone is invalid, return it as-is
    return tz;
  }
}

/**
 * Format time with optional timezone abbreviation.
 * Used for Flight Day and Arrival day where multiple timezones may appear.
 *
 * @param time - Time in HH:MM format
 * @param timezone - Optional IANA timezone
 * @param date - Optional date for DST calculation
 * @returns Formatted time like "9:00 AM PST" or "9:00 AM"
 */
export function formatTimeWithTimezone(
  time: string,
  timezone?: string,
  date?: Date
): string {
  const formattedTime = formatTime(time);
  if (!timezone) return formattedTime;
  return `${formattedTime} ${getTimezoneAbbr(timezone, date)}`;
}

/**
 * Format flight offset hours for display.
 * Used for in-flight sleep windows to show when during the flight they occur.
 *
 * @param hours - Hours into flight (e.g., 4.5)
 * @returns Human-readable string like "~4.5 hours into flight"
 */
export function formatFlightOffset(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    if (minutes === 0) {
      return "As soon as you can";
    }
    return `~${minutes} minutes into flight`;
  }
  return `~${hours} hours into flight`;
}

/**
 * Get a descriptive label for when during a flight a sleep window occurs.
 *
 * @param offsetHours - Hours into flight
 * @param totalHours - Total flight duration in hours
 * @returns "Early in flight", "Mid-flight", or "Later in flight"
 */
export function formatFlightPhase(
  offsetHours: number,
  totalHours: number
): string {
  const progress = offsetHours / totalHours;
  if (progress < EARLY_FLIGHT_THRESHOLD) return "Early in flight";
  if (progress < MID_FLIGHT_THRESHOLD) return "Mid-flight";
  return "Later in flight";
}

/** Intervention types that support recording actuals */
const EDITABLE_INTERVENTION_TYPES: Set<InterventionType> = new Set([
  "wake_target",
  "sleep_target",
  "melatonin",
  "exercise",
  "nap_window",
]);

/**
 * Determines if an intervention type supports recording actuals.
 *
 * Editable types are discrete timed events (wake, sleep, melatonin, exercise, naps).
 * Advisory types (light_seek, light_avoid, caffeine_*) are informational only.
 */
export function isEditableIntervention(type: InterventionType): boolean {
  return EDITABLE_INTERVENTION_TYPES.has(type);
}

/**
 * Format dual timezone times for an intervention.
 * Uses the pre-computed origin_time/dest_time from the intervention.
 *
 * @param intervention - Intervention with timezone context
 * @param forceDual - If true, always show dual times (user preference)
 * @returns Object with formatted origin and destination times with abbreviations,
 *          or null if the intervention shouldn't show dual timezone or lacks required fields
 */
export function formatDualTimezones(
  intervention: Intervention,
  forceDual = false
): {
  originTime: string;
  destTime: string;
} | null {
  // Early return if dual display not needed
  if (!forceDual && !intervention.show_dual_timezone) {
    return null;
  }

  // Guard: legacy schedules may not have enriched timezone fields
  const { origin_time, dest_time, origin_date, dest_date, origin_tz, dest_tz } =
    intervention;
  if (
    !origin_time ||
    !dest_time ||
    !origin_date ||
    !dest_date ||
    !origin_tz ||
    !dest_tz
  ) {
    return null;
  }

  // No need for dual display when timezones are the same
  if (origin_tz === dest_tz) {
    return null;
  }

  // Parse dates for DST calculation
  const originDateObj = new Date(origin_date + "T00:00:00");
  const destDateObj = new Date(dest_date + "T00:00:00");

  return {
    originTime: `${formatTime(origin_time)} ${getTimezoneAbbr(origin_tz, originDateObj)}`,
    destTime: `${formatTime(dest_time)} ${getTimezoneAbbr(dest_tz, destDateObj)}`,
  };
}
