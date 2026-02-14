import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Validation patterns (same as schedule generation)
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const timezoneSchema = z.string().min(1).refine(isValidTimezone, {
  message: "Invalid IANA timezone",
});

const tripRequestSchema = z.object({
  origin_tz: timezoneSchema,
  dest_tz: timezoneSchema,
  departure_datetime: z
    .string()
    .regex(
      DATETIME_PATTERN,
      "Invalid datetime format (expected YYYY-MM-DDTHH:MM)"
    ),
  arrival_datetime: z
    .string()
    .regex(
      DATETIME_PATTERN,
      "Invalid datetime format (expected YYYY-MM-DDTHH:MM)"
    ),
  prep_days: z.number().int().min(1).max(7),
  wake_time: z
    .string()
    .regex(TIME_PATTERN, "Invalid time format (expected HH:MM)"),
  sleep_time: z
    .string()
    .regex(TIME_PATTERN, "Invalid time format (expected HH:MM)"),
  uses_melatonin: z.boolean().default(true),
  uses_caffeine: z.boolean().default(true),
  uses_exercise: z.boolean().default(false),
  nap_preference: z
    .enum(["no", "flight_only", "all_days"])
    .default("flight_only"),
  schedule_intensity: z
    .enum(["gentle", "balanced", "aggressive"])
    .default("balanced"),
  route_label: z.string().optional(),
});

/**
 * POST /api/trips - Save a trip.
 * Works for both authenticated and anonymous users.
 */
export async function POST(request: Request) {
  try {
    // Check authentication (optional - anonymous users get userId: null)
    const session = await auth();
    const userId = session?.user?.id ?? null;

    const rawBody = await request.json();

    // Validate input
    const parseResult = tripRequestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      const fieldPath = firstError.path.join(".");
      const message = fieldPath
        ? `${fieldPath}: ${firstError.message}`
        : firstError.message;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const data = parseResult.data;

    // Check for duplicate trip (authenticated users only)
    if (userId) {
      const existingTrip = await prisma.sharedSchedule.findFirst({
        where: {
          userId,
          originTz: data.origin_tz,
          destTz: data.dest_tz,
          departureDatetime: data.departure_datetime,
          arrivalDatetime: data.arrival_datetime,
          prepDays: data.prep_days,
          wakeTime: data.wake_time,
          sleepTime: data.sleep_time,
          usesMelatonin: data.uses_melatonin,
          usesCaffeine: data.uses_caffeine,
          usesExercise: data.uses_exercise,
          napPreference: data.nap_preference,
          scheduleIntensity: data.schedule_intensity,
        },
        select: { id: true },
      });

      if (existingTrip) {
        return NextResponse.json({ id: existingTrip.id, saved: true });
      }
    }

    // Create saved trip (no share code)
    const trip = await prisma.sharedSchedule.create({
      data: {
        code: null, // Not shared
        userId,
        originTz: data.origin_tz,
        destTz: data.dest_tz,
        departureDatetime: data.departure_datetime,
        arrivalDatetime: data.arrival_datetime,
        prepDays: data.prep_days,
        wakeTime: data.wake_time,
        sleepTime: data.sleep_time,
        usesMelatonin: data.uses_melatonin,
        usesCaffeine: data.uses_caffeine,
        usesExercise: data.uses_exercise,
        napPreference: data.nap_preference,
        scheduleIntensity: data.schedule_intensity,
        routeLabel: data.route_label,
      },
    });

    return NextResponse.json({
      id: trip.id,
      saved: true,
    });
  } catch (error) {
    console.error("Trip save error:", error);
    return NextResponse.json({ error: "Failed to save trip" }, { status: 500 });
  }
}
