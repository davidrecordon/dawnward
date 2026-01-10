import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateShortCode } from "@/lib/short-code";

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

const shareRequestSchema = z.object({
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

const MAX_RETRIES = 5;

/**
 * POST /api/share - Create a shareable schedule link.
 * Requires authentication.
 */
export async function POST(request: Request) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Sign in to share your schedule" },
        { status: 401 }
      );
    }

    const rawBody = await request.json();

    // Validate input
    const parseResult = shareRequestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      const fieldPath = firstError.path.join(".");
      const message = fieldPath
        ? `${fieldPath}: ${firstError.message}`
        : firstError.message;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const data = parseResult.data;

    // Generate unique short code with collision retry
    let code: string | null = null;
    for (let i = 0; i < MAX_RETRIES; i++) {
      const candidate = generateShortCode();
      const existing = await prisma.sharedSchedule.findUnique({
        where: { code: candidate },
        select: { id: true },
      });
      if (!existing) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      return NextResponse.json(
        { error: "Failed to generate unique share code" },
        { status: 500 }
      );
    }

    // Create share record
    const shared = await prisma.sharedSchedule.create({
      data: {
        code,
        userId: session.user.id,
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

    const baseUrl = process.env.NEXTAUTH_URL || "https://dawnward.app";
    const shareUrl = `${baseUrl}/s/${shared.code}`;

    return NextResponse.json({
      url: shareUrl,
      code: shared.code,
    });
  } catch (error) {
    console.error("Share creation error:", error);
    return NextResponse.json(
      { error: "Failed to create share link" },
      { status: 500 }
    );
  }
}
