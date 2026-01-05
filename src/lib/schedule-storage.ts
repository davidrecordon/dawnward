/**
 * localStorage helpers for schedule and form state persistence
 *
 * Only stores ONE trip at a time - used as a bridge to logged-in state
 */

import type { StoredSchedule } from "@/types/schedule";
import type { TripFormState } from "@/types/trip-form";

const SCHEDULE_KEY = "dawnward_schedule";
const FORM_STATE_KEY = "dawnward_form_state";

/**
 * Get the stored schedule (only one at a time)
 */
export function getSchedule(): StoredSchedule | null {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem(SCHEDULE_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

/**
 * Save the schedule (replaces any existing one)
 */
export function saveSchedule(schedule: StoredSchedule): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedule));
}

/**
 * Delete the stored schedule
 */
export function deleteSchedule(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SCHEDULE_KEY);
}

/**
 * Toggle completion status for an intervention item
 */
export function toggleItemCompletion(itemKey: string): string[] {
  const schedule = getSchedule();
  if (!schedule) return [];

  const completedItems = new Set(schedule.completedItems);
  if (completedItems.has(itemKey)) {
    completedItems.delete(itemKey);
  } else {
    completedItems.add(itemKey);
  }

  const updatedItems = Array.from(completedItems);
  saveSchedule({
    ...schedule,
    completedItems: updatedItems,
  });

  return updatedItems;
}

/**
 * Generate a unique key for an intervention item
 */
export function getItemKey(day: number, time: string, type: string): string {
  return `${day}_${time}_${type}`;
}

/**
 * Generate a UUID for new schedules
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Get saved form state
 */
export function getFormState(): TripFormState | null {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem(FORM_STATE_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

/**
 * Save form state
 */
export function saveFormState(state: TripFormState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(FORM_STATE_KEY, JSON.stringify(state));
}

/**
 * Clear form state
 */
export function clearFormState(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(FORM_STATE_KEY);
}
