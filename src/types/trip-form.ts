import type { Airport } from "./airport";

/**
 * A single flight leg (origin, destination, and times)
 */
export interface TripLeg {
  /** Origin airport */
  origin: Airport | null;
  /** Destination airport */
  destination: Airport | null;
  /** Departure datetime in ISO format for datetime-local input */
  departureDateTime: string;
  /** Arrival datetime in ISO format for datetime-local input */
  arrivalDateTime: string;
}

/**
 * Nap preference options for schedule generation
 */
export type NapPreference = "no" | "flight_only" | "all_days";

/**
 * Schedule intensity options controlling circadian shift rates (direction-specific)
 * - gentle: 0.75h/day advance, 1.0h/day delay (easier to follow)
 * - balanced: 1.0h/day advance, 1.5h/day delay (good balance)
 * - aggressive: 1.25h/day advance, 2.0h/day delay (fastest adaptation)
 */
export type ScheduleIntensity = "gentle" | "balanced" | "aggressive";

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
  /** Schedule intensity: "gentle", "balanced", or "aggressive" */
  scheduleIntensity: ScheduleIntensity;
  /** User's usual wake time in HH:MM format */
  wakeTime: string;
  /** User's usual sleep time in HH:MM format */
  sleepTime: string;
  /** Number of days before departure to start adapting (1-7) */
  prepDays: number;
  /** Optional second leg (connection flight) */
  leg2: TripLeg | null;
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
  scheduleIntensity: "balanced",
  wakeTime: "07:00",
  sleepTime: "22:00",
  prepDays: 3,
  leg2: null,
};

/**
 * Create an empty leg (for adding a connection)
 */
export const createEmptyLeg = (): TripLeg => ({
  origin: null,
  destination: null,
  departureDateTime: "",
  arrivalDateTime: "",
});
