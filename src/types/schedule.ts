/**
 * Schedule types - mirrors Python circadian package output
 */

import type { Airport } from "./airport";
import type { NapPreference, ScheduleIntensity } from "./trip-form";

/**
 * Intervention types from the circadian schedule generator
 */
export type InterventionType =
  | "light_seek"
  | "light_avoid"
  | "melatonin"
  | "exercise"
  | "caffeine_ok"
  | "caffeine_cutoff"
  | "sleep_target"
  | "wake_target"
  | "nap_window";

/**
 * Status of a recorded actual
 */
export type ActualStatus = "as_planned" | "modified" | "skipped";

/**
 * Recorded actual for an intervention - what the user actually did
 */
export interface InterventionActual {
  /** Day offset relative to departure */
  dayOffset: number;
  /** Type of intervention this actual is for */
  interventionType: string;
  /** Originally planned time in HH:MM format */
  plannedTime: string;
  /** Actual time in HH:MM format (null if skipped or as_planned) */
  actualTime: string | null;
  /** Status of the actual */
  status: ActualStatus;
}

/**
 * Map of actuals keyed by "dayOffset:interventionType"
 */
export type ActualsMap = Map<string, InterventionActual>;

/**
 * Single scheduled intervention with complete timezone context.
 *
 * Each intervention is self-describing: it carries both origin and destination
 * times/dates/timezones, so consumers (UI, calendar sync) don't need external
 * context to display or process it.
 */
export interface Intervention {
  /** Type of intervention */
  type: InterventionType;
  /** Display title */
  title: string;
  /** User-facing explanation */
  description: string;
  /** Duration in minutes for time-window interventions (light, exercise) */
  duration_min?: number;

  // Dual timezone times - frontend picks which to display based on phase_type
  /** Time in origin timezone (HH:MM format) */
  origin_time: string;
  /** Time in destination timezone (HH:MM format) */
  dest_time: string;
  /** Date in origin timezone (YYYY-MM-DD format) */
  origin_date: string;
  /** Date in destination timezone (YYYY-MM-DD format) */
  dest_date: string;

  // Trip timezone context (always present after enrichment)
  /** Trip's origin IANA timezone */
  origin_tz: string;
  /** Trip's destination IANA timezone */
  dest_tz: string;

  // Phase info
  /** Which phase this intervention belongs to */
  phase_type: PhaseType;
  /** True = display both origin and dest times (in-transit and pre-landing items) */
  show_dual_timezone: boolean;

  // Nap window fields - internal uses local, enrichment converts to UTC
  /** End time for nap window in HH:MM format (internal, used by planner) */
  window_end?: string;
  /** Ideal time within nap window in HH:MM format (internal, used by planner) */
  ideal_time?: string;
  /** Window end time in ISO 8601 UTC format (after enrichment) */
  window_end_utc?: string;
  /** Ideal time in ISO 8601 UTC format (after enrichment) */
  ideal_time_utc?: string;

  // In-flight sleep windows only
  /** Hours into flight for in-transit sleep opportunities (e.g., 4.5 = ~4.5h into flight) */
  flight_offset_hours?: number;
}

/**
 * Parent type for grouped items (used by groupTimedItems).
 * Can be a wake_target intervention or an arrival marker.
 */
export type GroupableParent =
  | { kind: "intervention"; data: Intervention }
  | { kind: "arrival"; dest_tz: string };

/**
 * Group of timed items anchored by a parent (wake_target or arrival).
 * Used for unified "parent + nested children" visual hierarchy.
 */
export interface TimedItemGroup {
  /** The parent item (wake_target intervention or arrival) */
  parent: GroupableParent;
  /** Child interventions at the same time */
  children: Intervention[];
  /** Shared time in HH:MM format */
  time: string;
}

/**
 * Phase types from the V2 scheduler
 */
export type PhaseType =
  | "preparation"
  | "pre_departure"
  | "in_transit"
  | "in_transit_ulr"
  | "post_arrival"
  | "adaptation";

// =============================================================================
// Phase Type Helpers
// =============================================================================

/**
 * Check if a phase is before the flight (user is at origin).
 * These phases display times in origin timezone.
 */
export function isPreFlightPhase(phase: PhaseType | undefined): boolean {
  return phase === "preparation" || phase === "pre_departure";
}

/**
 * Check if a phase is after arrival (user is at destination).
 * These phases display times in destination timezone only.
 */
export function isPostArrivalPhase(phase: PhaseType | undefined): boolean {
  return phase === "post_arrival" || phase === "adaptation";
}

/**
 * Check if a phase is in-transit (user is on the plane).
 * These phases may show dual timezones.
 */
export function isInTransitPhase(phase: PhaseType | undefined): boolean {
  return phase === "in_transit" || phase === "in_transit_ulr";
}

/**
 * Interventions for one day/phase.
 *
 * Note: timezone removed - each intervention now carries its own timezone context.
 * DaySchedule is now just a grouping container.
 */
export interface DaySchedule {
  /** Day relative to departure (-3, -2, -1, 0, 1, 2...) */
  day: number;
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** Interventions for this day, sorted by time */
  items: Intervention[];
  /** Phase type from V2 scheduler (multiple phases can share the same day) */
  phase_type?: PhaseType;
  /** True if both pre_departure and post_arrival phases exist on same date (westbound same-day arrival) */
  hasSameDayArrival?: boolean;
  /** True if this phase is in-transit (on the plane). Used for UI section styling. */
  is_in_transit?: boolean;
}

/**
 * Response from the schedule generator
 */
export interface ScheduleResponse {
  /** Total timezone shift in hours */
  total_shift_hours: number;
  /** Direction of circadian shift */
  direction: "advance" | "delay";
  /** Estimated days to fully adapt */
  estimated_adaptation_days: number;
  /** Schedule grouped by day */
  interventions: DaySchedule[];
  /** Absolute hours shifted (rounded integer) for UI display */
  shift_magnitude: number;
  /** True if shift <= 2 hours - show tips card instead of full schedule by default */
  is_minimal_shift: boolean;
}

/**
 * Stored schedule with form inputs and response
 */
export interface StoredSchedule {
  /** Unique identifier */
  id: string;
  /** When the schedule was generated */
  createdAt: string;
  /** Form inputs */
  request: {
    origin: Airport;
    destination: Airport;
    departureDateTime: string;
    arrivalDateTime: string;
    prepDays: number;
    wakeTime: string;
    sleepTime: string;
    usesMelatonin: boolean;
    usesCaffeine: boolean;
    usesExercise: boolean;
    napPreference: NapPreference;
    scheduleIntensity: ScheduleIntensity;
  };
  /** Generated schedule */
  schedule: ScheduleResponse;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the appropriate display time for an intervention based on its phase.
 *
 * - Preparation/pre_departure phases: use origin_time
 * - Post_arrival/adaptation phases: use dest_time
 * - In_transit phases: use dest_time (displaying destination time during flight)
 */
export function getDisplayTime(intervention: Intervention): string {
  const phase = intervention.phase_type;
  if (phase === "preparation" || phase === "pre_departure") {
    return intervention.origin_time;
  }
  return intervention.dest_time;
}

/**
 * Format a UTC ISO 8601 string in the given timezone.
 *
 * @param utcIso - ISO 8601 datetime string (e.g., "2026-01-21T08:00:00+00:00")
 * @param tz - IANA timezone (e.g., "Europe/London")
 * @returns Formatted time string in HH:MM format
 */
export function formatUtcInTimezone(utcIso: string, tz: string): string {
  const date = new Date(utcIso);
  return date.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
