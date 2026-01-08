/**
 * Schedule types - mirrors Python circadian package output
 */

import type { Airport } from "./airport";
import type { NapPreference } from "./trip-form";

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
 * Single scheduled intervention
 */
export interface Intervention {
  /** Time in HH:MM format (local time) */
  time: string;
  /** Type of intervention */
  type: InterventionType;
  /** Display title */
  title: string;
  /** User-facing explanation */
  description: string;
  /** Duration in minutes for time-window interventions (light, exercise) */
  duration_min?: number;
  /** End time for nap window in HH:MM format */
  window_end?: string;
  /** Ideal time within nap window in HH:MM format */
  ideal_time?: string;
  /** IANA timezone for this intervention's time (added during merge for display) */
  timezone?: string;
  /** Hours into flight for in-transit sleep opportunities (e.g., 4.5 = ~4.5h into flight) */
  flight_offset_hours?: number;
  /** True if this intervention is in-transit (on the plane). Added during merge for display. */
  is_in_transit?: boolean;
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

/**
 * Interventions for one day/phase
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
  /** IANA timezone for this day's times (e.g., "America/Los_Angeles" or "In transit") */
  timezone?: string;
  /** True if both pre_departure and post_arrival phases exist on same date (westbound same-day arrival) */
  hasSameDayArrival?: boolean;
  /** True if this phase is in-transit (on the plane). Replaces string matching on timezone. */
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
  };
  /** Generated schedule */
  schedule: ScheduleResponse;
}
