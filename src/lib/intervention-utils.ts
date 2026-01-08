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
import type { InterventionType } from "@/types/schedule";

interface InterventionStyle {
  icon: LucideIcon;
  bgColor: string;
  textColor: string;
  label: string;
}

/**
 * Get styling for an intervention type
 */
export function getInterventionStyle(type: InterventionType): InterventionStyle {
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
  if (day < 0) {
    return `Day ${day}`;
  } else if (day === 0) {
    // For westbound same-day arrivals, show combined label
    if (hasSameDayArrival) {
      return "Flight & Arrival Day";
    }
    return "Flight Day";
  } else if (day === 1) {
    // Day 1 is "Arrival" only if NOT same-day arrival
    // (for same-day arrivals, day 1 doesn't exist - it's merged into day 0)
    return "Arrival";
  } else {
    // For same-day arrivals, shift the day numbers down by 1
    // (day 2 becomes "Day +1", day 3 becomes "Day +2", etc.)
    const displayDay = hasSameDayArrival ? day - 1 : day;
    return `Day +${displayDay}`;
  }
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
 * Uses Intl.DateTimeFormat to get the proper abbreviation accounting for DST.
 *
 * @param tz - IANA timezone (e.g., "America/Los_Angeles") or special value like "In transit"
 * @param date - Optional date to determine DST status (defaults to now)
 * @returns Abbreviation like "PST", "PDT", "GMT", etc.
 */
export function getTimezoneAbbr(tz: string, date?: Date): string {
  // Handle special "In transit" timezone
  if (tz === "In transit" || tz.toLowerCase().includes("transit")) {
    return "In Flight";
  }

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
