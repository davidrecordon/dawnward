import type { TripData } from "@/types/trip-data";

/**
 * Database record shape from Prisma sharedSchedule
 */
interface SharedScheduleRecord {
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

/**
 * Map a database SharedSchedule record to the TripData shape for TripScheduleView
 */
export function mapSharedScheduleToTripData(
  record: SharedScheduleRecord
): TripData {
  return {
    originTz: record.originTz,
    destTz: record.destTz,
    departureDatetime: record.departureDatetime,
    arrivalDatetime: record.arrivalDatetime,
    prepDays: record.prepDays,
    wakeTime: record.wakeTime,
    sleepTime: record.sleepTime,
    usesMelatonin: record.usesMelatonin,
    usesCaffeine: record.usesCaffeine,
    usesExercise: record.usesExercise,
    napPreference: record.napPreference,
    scheduleIntensity: record.scheduleIntensity,
    routeLabel: record.routeLabel,
    code: record.code,
  };
}
