import type { ScheduleResponse } from "./schedule";

/**
 * Leg 2 data (connection flight)
 */
export interface TripLeg2Data {
  originTz: string;
  destTz: string;
  departureDatetime: string;
  arrivalDatetime: string;
}

/**
 * Trip data as stored in the database and used by TripScheduleView.
 * Maps directly to SharedSchedule model fields.
 */
export interface TripData {
  // Leg 1
  originTz: string;
  destTz: string;
  departureDatetime: string;
  arrivalDatetime: string;
  // Leg 2 (optional connection)
  leg2: TripLeg2Data | null;
  // Preferences
  prepDays: number;
  wakeTime: string;
  sleepTime: string;
  usesMelatonin: boolean;
  usesCaffeine: boolean;
  usesExercise: boolean;
  napPreference: string;
  scheduleIntensity: string;
  // Metadata
  routeLabel: string | null;
  code: string | null;
  // Schedule storage (for editing/recalculation)
  initialScheduleJson: ScheduleResponse | null;
  currentScheduleJson: ScheduleResponse | null;
}
