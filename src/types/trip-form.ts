import type { Airport } from "./airport";

/**
 * Nap preference options for schedule generation
 */
export type NapPreference = "no" | "flight_only" | "all_days";

/**
 * Form state for the trip planning form
 */
export interface TripFormState {
  /** Origin airport */
  origin: Airport | null;
  /** Destination airport */
  destination: Airport | null;
  /** Departure datetime in ISO format for datetime-local input */
  departureDateTime: string;
  /** Arrival datetime in ISO format for datetime-local input */
  arrivalDateTime: string;
  /** Whether to include melatonin timing in schedule */
  useMelatonin: boolean;
  /** Whether to include caffeine strategy in schedule */
  useCaffeine: boolean;
  /** Whether to include exercise recommendations in schedule */
  useExercise: boolean;
  /** Nap preference: "no", "flight_only", or "all_days" */
  napPreference: NapPreference;
  /** User's usual wake time in HH:MM format */
  wakeTime: string;
  /** User's usual sleep time in HH:MM format */
  sleepTime: string;
  /** Number of days before departure to start adapting (1-7) */
  prepDays: number;
}

/**
 * Default form state with sensible defaults
 */
export const defaultFormState: TripFormState = {
  origin: null,
  destination: null,
  departureDateTime: "",
  arrivalDateTime: "",
  useMelatonin: true,
  useCaffeine: true,
  useExercise: false,
  napPreference: "flight_only",
  wakeTime: "07:00",
  sleepTime: "22:00",
  prepDays: 3,
};
