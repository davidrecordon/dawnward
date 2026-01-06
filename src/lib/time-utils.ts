/**
 * Time and date utilities for schedule display
 */

import type { ScheduleResponse } from "@/types/schedule";

/**
 * Common schedule data shape used by time utility functions.
 * Works with both in-memory generated schedules and stored schedules.
 */
export interface ScheduleData {
  request: {
    origin: { tz: string };
  };
  schedule: ScheduleResponse;
}

/**
 * Get current time in HH:MM format (24-hour)
 */
export function getCurrentTime(): string {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * Get current date in YYYY-MM-DD format (browser's local timezone)
 */
export function getCurrentDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get current date in YYYY-MM-DD format for a specific timezone.
 * Uses Intl.DateTimeFormat with 'en-CA' locale for ISO format (YYYY-MM-DD).
 */
export function getCurrentDateInTimezone(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
  }).format(new Date());
}

/**
 * Format a Date object as datetime-local string (YYYY-MM-DDTHH:MM)
 */
export function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Format date to long readable format (e.g., "Wednesday, January 19")
 */
export function formatLongDate(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/**
 * Check if current date is before schedule starts.
 * Uses the origin timezone from the schedule to determine "today".
 */
export function isBeforeSchedule(schedule: ScheduleData): boolean {
  const originTz = schedule.request.origin.tz;
  const today = getCurrentDateInTimezone(originTz);
  const firstDay = schedule.schedule.interventions[0]?.date;
  return firstDay ? today < firstDay : false;
}

/**
 * Check if current date is after schedule ends.
 * Uses the origin timezone from the schedule to determine "today".
 */
export function isAfterSchedule(schedule: ScheduleData): boolean {
  const originTz = schedule.request.origin.tz;
  const today = getCurrentDateInTimezone(originTz);
  const interventions = schedule.schedule.interventions;
  const lastDay = interventions[interventions.length - 1]?.date;
  return lastDay ? today > lastDay : false;
}

/**
 * Find the day number for the current date in the schedule.
 * Uses the origin timezone from the schedule to determine "today".
 * Returns null if today is not a schedule day.
 */
export function getCurrentDayNumber(schedule: ScheduleData): number | null {
  const originTz = schedule.request.origin.tz;
  const today = getCurrentDateInTimezone(originTz);
  const daySchedule = schedule.schedule.interventions.find(
    (d) => d.date === today
  );
  return daySchedule ? daySchedule.day : null;
}

/**
 * Get time period of day for styling (morning, afternoon, evening, night)
 */
export function getTimePeriod(
  time: string
): "morning" | "afternoon" | "evening" | "night" {
  const hour = parseInt(time.split(":")[0], 10);
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}
