/**
 * Error handling utilities for consistent error message extraction
 */

/**
 * Extract a user-friendly message from an unknown error.
 * Handles Error instances, strings, and unknown types safely.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "An unexpected error occurred";
}
