/**
 * Trip form validation utilities
 */

import { calculateFlightDuration } from "@/lib/timezone-utils";

export interface TripValidationInput {
  origin: { code: string; tz: string } | null;
  destination: { code: string; tz: string } | null;
  departureDateTime: string;
  arrivalDateTime: string;
}

export interface TripValidationErrors {
  origin?: string;
  destination?: string;
  departureDateTime?: string;
  arrivalDateTime?: string;
  form?: string;
}

/**
 * Validate trip form inputs.
 *
 * Uses timezone-aware comparison for flight times to properly handle
 * dateline-crossing flights where the local arrival time may appear
 * earlier than the departure time.
 */
export function validateTripForm(
  input: TripValidationInput
): TripValidationErrors {
  const errors: TripValidationErrors = {};

  // Field-level validation
  if (!input.origin) {
    errors.origin = "Please select a departure airport";
  }
  if (!input.destination) {
    errors.destination = "Please select an arrival airport";
  }
  if (!input.departureDateTime) {
    errors.departureDateTime = "Please select when you depart";
  }
  if (!input.arrivalDateTime) {
    errors.arrivalDateTime = "Please select when you arrive";
  }

  // Cross-field validation
  if (
    input.origin &&
    input.destination &&
    input.origin.code === input.destination.code
  ) {
    errors.form = "Your origin and destination can't be the same airport";
  }

  // Use timezone-aware comparison for dateline-crossing flights
  if (
    input.departureDateTime &&
    input.arrivalDateTime &&
    input.origin &&
    input.destination
  ) {
    const duration = calculateFlightDuration(
      input.departureDateTime,
      input.arrivalDateTime,
      input.origin.tz,
      input.destination.tz
    );
    if (!duration) {
      errors.form = "Your arrival time needs to be after departure";
    }
  }

  return errors;
}

/**
 * Check if validation passed (no errors)
 */
export function isValidTrip(errors: TripValidationErrors): boolean {
  return Object.keys(errors).length === 0;
}
