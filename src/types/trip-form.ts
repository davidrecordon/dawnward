import type { Airport } from "./airport";

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
  /** User's usual wake time in HH:MM format */
  wakeTime: string;
  /** User's usual sleep time in HH:MM format */
  sleepTime: string;
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
  wakeTime: "07:00",
  sleepTime: "23:00",
};
