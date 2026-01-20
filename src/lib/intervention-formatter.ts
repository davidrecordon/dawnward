/**
 * Unified intervention formatting for consistent display across:
 * - Web UI (DaySummaryCard)
 * - Google Calendar events
 * - Email notifications
 *
 * Single source of truth for emojis, descriptions, and formatting logic.
 */

import type {
  DaySchedule,
  Intervention,
  InterventionType,
} from "@/types/schedule";
import {
  getDisplayTime,
  isInTransitPhase,
  isPreFlightPhase,
  isPostArrivalPhase,
} from "@/types/schedule";

// =============================================================================
// Emoji Mapping
// =============================================================================

/**
 * Emoji for each intervention type.
 * Designed to be visually distinct and work across web, calendar, and email.
 */
export const INTERVENTION_EMOJI: Record<InterventionType, string> = {
  wake_target: "☀️",
  light_seek: "🌅",
  light_avoid: "😎",
  caffeine_ok: "☕",
  caffeine_cutoff: "🚫",
  melatonin: "💊",
  sleep_target: "😴",
  nap_window: "💤",
  exercise: "🏃",
};

const DEFAULT_EMOJI = "📋";

/**
 * Get emoji for an intervention type.
 */
export function getInterventionEmoji(type: InterventionType): string {
  return INTERVENTION_EMOJI[type] ?? DEFAULT_EMOJI;
}

// =============================================================================
// Condensed Descriptions
// =============================================================================

/**
 * Short, action-oriented descriptions for summary views.
 * Used in DaySummaryCard and email notifications.
 */
export const CONDENSED_DESCRIPTIONS: Record<InterventionType, string> = {
  wake_target: "Wake up to help shift your clock",
  light_seek: "Get 30+ min bright light",
  light_avoid: "Avoid bright light, dim screens",
  caffeine_cutoff: "Last caffeine for today",
  caffeine_ok: "Caffeine OK until cutoff",
  melatonin: "Take melatonin to shift rhythm",
  sleep_target: "Aim for sleep by this time",
  nap_window: "Good window for a short nap",
  exercise: "Physical activity helps shift rhythm",
};

const DEFAULT_DESCRIPTION = "Follow this intervention";

/**
 * Get condensed description for an intervention type.
 */
export function getCondensedDescription(type: InterventionType): string {
  return CONDENSED_DESCRIPTIONS[type] ?? DEFAULT_DESCRIPTION;
}

// =============================================================================
// Text Formatting (for Email/Plain Text Output)
// =============================================================================

/**
 * Format time as HH:MM or h:MM AM/PM based on preference.
 */
export function formatTimeForText(time: string, use24Hour: boolean): string {
  if (use24Hour) {
    return time;
  }

  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
}

/**
 * Format a single intervention as a text line.
 * Example: "☀️  7:00 AM   Wake up to help shift your clock"
 */
export function formatInterventionForText(
  intervention: Intervention,
  use24Hour = false
): string {
  const emoji = getInterventionEmoji(intervention.type);
  const time = formatTimeForText(getDisplayTime(intervention), use24Hour);
  const desc = getCondensedDescription(intervention.type);
  return `${emoji}  ${time}   ${desc}`;
}

/**
 * Format flight offset for in-transit interventions.
 * Example: "~4h into flight"
 */
export function formatFlightOffset(hours: number): string {
  const wholeHours = Math.floor(hours);
  const hasHalf = hours - wholeHours >= 0.25;
  return hasHalf ? `~${wholeHours}.5h into flight` : `~${wholeHours}h into flight`;
}

// =============================================================================
// Flight Day Formatting (for Email)
// =============================================================================

/**
 * Flight day sections for structured email output.
 */
export interface FlightDaySections {
  beforeBoarding: Intervention[];
  onThePlane: Intervention[];
  afterLanding: Intervention[];
}

/**
 * Group interventions by flight phase for structured display.
 * Used for flight day email formatting.
 */
export function groupByFlightPhase(items: Intervention[]): FlightDaySections {
  const result: FlightDaySections = {
    beforeBoarding: [],
    onThePlane: [],
    afterLanding: [],
  };

  for (const item of items) {
    if (isInTransitPhase(item.phase_type)) {
      result.onThePlane.push(item);
    } else if (isPreFlightPhase(item.phase_type)) {
      result.beforeBoarding.push(item);
    } else if (isPostArrivalPhase(item.phase_type)) {
      result.afterLanding.push(item);
    } else {
      // Defensive: unexpected phase types on flight day go to afterLanding
      console.warn(`Unexpected phase type on flight day: ${item.phase_type}`);
      result.afterLanding.push(item);
    }
  }

  return result;
}

/**
 * Format a flight day section for plain text email.
 */
function formatFlightDaySection(
  title: string,
  interventions: Intervention[],
  use24Hour: boolean,
  showFlightOffset = false
): string {
  if (interventions.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push(`═══ ${title.toUpperCase()} ═══`);
  lines.push("");

  for (const intervention of interventions) {
    const emoji = getInterventionEmoji(intervention.type);
    const desc = getCondensedDescription(intervention.type);

    // For in-flight items with flight_offset_hours, show offset instead of time
    if (showFlightOffset && intervention.flight_offset_hours != null) {
      const offset = formatFlightOffset(intervention.flight_offset_hours);
      lines.push(`${emoji}  ${offset}`);
    } else {
      const time = formatTimeForText(getDisplayTime(intervention), use24Hour);
      lines.push(`${emoji}  ${time}   ${desc}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Format a complete flight day schedule for plain text email.
 */
export function formatFlightDayForEmail(
  daySchedule: DaySchedule,
  use24Hour = false,
  departureTime?: string,
  arrivalTime?: string,
  originCode?: string,
  destCode?: string
): string {
  const sections = groupByFlightPhase(daySchedule.items);
  const parts: string[] = [];

  // Before Boarding section
  if (sections.beforeBoarding.length > 0 || departureTime) {
    let beforeSection = formatFlightDaySection(
      "Before Boarding",
      sections.beforeBoarding,
      use24Hour
    );

    // Add departure flight info
    if (departureTime && originCode && destCode) {
      const depTime = formatTimeForText(departureTime, use24Hour);
      beforeSection += `✈️  ${depTime}   ${originCode} → ${destCode} departs\n\n`;
    }

    parts.push(beforeSection);
  }

  // On the Plane section
  if (sections.onThePlane.length > 0) {
    parts.push(
      formatFlightDaySection("On the Plane", sections.onThePlane, use24Hour, true)
    );
  }

  // After Landing section
  if (sections.afterLanding.length > 0 || arrivalTime) {
    let afterSection = "";

    // Add arrival flight info first
    if (arrivalTime && destCode) {
      const arrTime = formatTimeForText(arrivalTime, use24Hour);
      afterSection = `═══ AFTER LANDING ═══\n\n`;
      afterSection += `🛬  ${arrTime}   Arrive at ${destCode}\n`;
    }

    if (sections.afterLanding.length > 0) {
      if (!arrivalTime) {
        afterSection = `═══ AFTER LANDING ═══\n\n`;
      }
      for (const intervention of sections.afterLanding) {
        const emoji = getInterventionEmoji(intervention.type);
        const time = formatTimeForText(getDisplayTime(intervention), use24Hour);
        const desc = getCondensedDescription(intervention.type);
        afterSection += `${emoji}  ${time}   ${desc}\n`;
      }
    }

    afterSection += "\n";
    parts.push(afterSection);
  }

  return parts.join("");
}

/**
 * Format a regular (non-flight) day for plain text email.
 */
export function formatDayForText(
  daySchedule: DaySchedule,
  use24Hour = false
): string {
  if (daySchedule.items.length === 0) {
    return "No scheduled interventions for this day.\n";
  }

  return (
    daySchedule.items
      .map((item) => formatInterventionForText(item, use24Hour))
      .join("\n") + "\n"
  );
}
