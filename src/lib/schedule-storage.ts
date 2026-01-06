/**
 * localStorage helpers for form state persistence
 *
 * Only stores form inputs for the homepage - schedules are regenerated on demand
 */

import type { TripFormState } from "@/types/trip-form";

const FORM_STATE_KEY = "dawnward_form_state";

/**
 * Get saved form state
 */
export function getFormState(): TripFormState | null {
  if (typeof window === "undefined") return null;
  try {
    const data = localStorage.getItem(FORM_STATE_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.warn("Failed to retrieve form state from localStorage:", error);
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
