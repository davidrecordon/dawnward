/**
 * Schedule types - mirrors Python circadian package output
 */

import type { Airport } from "./airport";

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
  | "wake_target";

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
}

/**
 * Interventions for one day
 */
export interface DaySchedule {
  /** Day relative to departure (-3, -2, -1, 0, 1, 2...) */
  day: number;
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** Interventions for this day, sorted by time */
  items: Intervention[];
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
  };
  /** Generated schedule */
  schedule: ScheduleResponse;
}
