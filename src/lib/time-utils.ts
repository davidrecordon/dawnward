/**
 * Time and date utilities for schedule display
 */

import type { StoredSchedule } from "@/types/schedule";

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
 * Get current date in YYYY-MM-DD format
 */
export function getCurrentDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
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
 * Check if current date is before schedule starts
 */
export function isBeforeSchedule(schedule: StoredSchedule): boolean {
  const today = getCurrentDate();
  const firstDay = schedule.schedule.interventions[0]?.date;
  return firstDay ? today < firstDay : false;
}

/**
 * Check if current date is after schedule ends
 */
export function isAfterSchedule(schedule: StoredSchedule): boolean {
  const today = getCurrentDate();
  const interventions = schedule.schedule.interventions;
  const lastDay = interventions[interventions.length - 1]?.date;
  return lastDay ? today > lastDay : false;
}

/**
 * Find the day number for the current date in the schedule
 * Returns null if today is not a schedule day
 */
export function getCurrentDayNumber(schedule: StoredSchedule): number | null {
  const today = getCurrentDate();
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
