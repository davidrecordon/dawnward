import type { TripData } from "@/types/trip-data";
import type { ScheduleResponse } from "@/types/schedule";
import type { TripLeg } from "@/types/trip-form";
import type { JsonValue } from "@prisma/client/runtime/client";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Build route label from airport codes (e.g. "SFO → LAX → JFK")
 */
export function buildRouteLabel(
  leg1Origin: string | undefined,
  leg1Dest: string | undefined,
  leg2Dest?: string | undefined
): string | undefined {
  if (!leg1Origin || !leg1Dest) return undefined;
  if (leg2Dest) {
    return `${leg1Origin} → ${leg1Dest} → ${leg2Dest}`;
  }
  return `${leg1Origin} → ${leg1Dest}`;
}

/**
 * Calculate layover duration between two legs
 * Returns { hours, minutes } or null if invalid
 */
export function calculateLayoverDuration(
  leg1ArrivalDatetime: string,
  leg2DepartureDatetime: string
): { hours: number; minutes: number } | null {
  const leg1Arr = new Date(leg1ArrivalDatetime);
  const leg2Dep = new Date(leg2DepartureDatetime);
  const diffMs = leg2Dep.getTime() - leg1Arr.getTime();

  if (diffMs <= 0 || isNaN(diffMs)) return null;

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return { hours, minutes };
}

/**
 * Calculate total flight time for multi-leg trip (excludes layover)
 */
export function calculateTotalFlightTime(
  leg1Duration: { hours: number; minutes: number } | null,
  leg2Duration: { hours: number; minutes: number } | null
): { hours: number; minutes: number } | null {
  if (!leg1Duration) return null;
  if (!leg2Duration) return leg1Duration;

  const totalMinutes =
    leg1Duration.hours * 60 +
    leg1Duration.minutes +
    leg2Duration.hours * 60 +
    leg2Duration.minutes;

  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

/**
 * Validate that leg2 departure is after leg1 arrival
 */
export function isValidLeg2Timing(
  leg1ArrivalDatetime: string,
  leg2DepartureDatetime: string
): boolean {
  const leg1Arr = new Date(leg1ArrivalDatetime);
  const leg2Dep = new Date(leg2DepartureDatetime);
  return leg2Dep > leg1Arr;
}

/**
 * Check if a leg has all required fields filled
 */
export function isLegComplete(leg: TripLeg | null): boolean {
  if (!leg) return false;
  return !!(
    leg.origin &&
    leg.destination &&
    leg.departureDateTime &&
    leg.arrivalDateTime
  );
}

/**
 * Database record shape from Prisma sharedSchedule
 */
interface SharedScheduleRecord {
  // Leg 1
  originTz: string;
  destTz: string;
  departureDatetime: string;
  arrivalDatetime: string;
  // Leg 2 (nullable)
  leg2OriginTz: string | null;
  leg2DestTz: string | null;
  leg2DepartureDatetime: string | null;
  leg2ArrivalDatetime: string | null;
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
  initialScheduleJson: JsonValue | null;
  currentScheduleJson: JsonValue | null;
}

/**
 * Map a database SharedSchedule record to the TripData shape for TripScheduleView
 */
export function mapSharedScheduleToTripData(
  record: SharedScheduleRecord
): TripData {
  // Build leg2 object if all leg2 fields are present
  const leg2 =
    record.leg2OriginTz &&
    record.leg2DestTz &&
    record.leg2DepartureDatetime &&
    record.leg2ArrivalDatetime
      ? {
          originTz: record.leg2OriginTz,
          destTz: record.leg2DestTz,
          departureDatetime: record.leg2DepartureDatetime,
          arrivalDatetime: record.leg2ArrivalDatetime,
        }
      : null;

  return {
    originTz: record.originTz,
    destTz: record.destTz,
    departureDatetime: record.departureDatetime,
    arrivalDatetime: record.arrivalDatetime,
    leg2,
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
