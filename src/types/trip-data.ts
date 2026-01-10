/**
 * Trip data as stored in the database and used by TripScheduleView.
 * Maps directly to SharedSchedule model fields.
 */
export interface TripData {
  originTz: string;
  destTz: string;
  departureDatetime: string;
  arrivalDatetime: string;
  prepDays: number;
  wakeTime: string;
  sleepTime: string;
  usesMelatonin: boolean;
  usesCaffeine: boolean;
  usesExercise: boolean;
  napPreference: string;
  scheduleIntensity: string;
  routeLabel: string | null;
  code: string | null;
}
