import type { TripData } from "@/types/trip-data";
import type { ScheduleResponse } from "@/types/schedule";
import type { JsonValue } from "@prisma/client/runtime/client";
import type { PrismaClient } from "@/generated/prisma/client";

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
  initialScheduleJson: JsonValue | null;
  currentScheduleJson: JsonValue | null;
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
    initialScheduleJson: record.initialScheduleJson as ScheduleResponse | null,
    currentScheduleJson: record.currentScheduleJson as ScheduleResponse | null,
  };
}

/**
 * Increment view count for a shared trip (fire-and-forget).
 * Used when non-owners view a shared schedule.
 */
export function incrementViewCount(prisma: PrismaClient, tripId: string): void {
  prisma.sharedSchedule
    .update({
      where: { id: tripId },
      data: {
        viewCount: { increment: 1 },
        lastViewedAt: new Date(),
      },
    })
    .catch(() => {
      // Ignore errors - analytics shouldn't break the page
    });
}
