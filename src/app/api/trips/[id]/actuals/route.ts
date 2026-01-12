import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  createEventsForSchedule,
  deleteCalendarEvents,
} from "@/lib/google-calendar";
import type { ScheduleResponse } from "@/types/schedule";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Trigger a calendar re-sync if the trip is synced.
 * Uses delete-and-replace strategy for simplicity with grouped events.
 */
async function triggerCalendarResync(
  tripId: string,
  userId: string,
  accessToken: string | undefined
): Promise<void> {
  // Skip if no access token (calendar not authorized)
  if (!accessToken) return;

  // Check if trip has a calendar sync
  const sync = await prisma.calendarSync.findUnique({
    where: {
      tripId_userId: { tripId, userId },
    },
    include: {
      trip: {
        select: {
          currentScheduleJson: true,
          initialScheduleJson: true,
          destTz: true,
        },
      },
    },
  });

  if (!sync) return; // Not synced, nothing to do

  // Delete existing events
  if (sync.googleEventIds.length > 0) {
    try {
      await deleteCalendarEvents(accessToken, sync.googleEventIds);
    } catch (error) {
      console.error("Error deleting old calendar events during resync:", error);
    }
  }

  // Get schedule data
  const scheduleJson =
    sync.trip.currentScheduleJson ?? sync.trip.initialScheduleJson;
  if (!scheduleJson) return;

  const schedule = scheduleJson as unknown as ScheduleResponse;

  // Recreate events using shared helper
  const createdEventIds = await createEventsForSchedule(
    accessToken,
    schedule.interventions,
    sync.trip.destTz
  );

  // Update sync record
  await prisma.calendarSync.update({
    where: { id: sync.id },
    data: {
      googleEventIds: createdEventIds,
      lastSyncedAt: new Date(),
    },
  });
}

// Valid intervention types that can have actuals recorded
const RECORDABLE_INTERVENTION_TYPES = [
  "wake_target",
  "sleep_target",
  "light_seek",
  "light_avoid",
  "melatonin",
  "caffeine_ok",
  "caffeine_cutoff",
  "caffeine_boost",
  "nap",
] as const;

// Valid status values
const ACTUAL_STATUS = ["as_planned", "modified", "skipped"] as const;

// Zod schema for recording an actual
const recordActualSchema = z.object({
  legIndex: z.number().int().min(0).default(0),
  dayOffset: z.number().int(), // Can be negative for prep days
  interventionType: z.enum(RECORDABLE_INTERVENTION_TYPES),
  plannedTime: z.string().regex(/^\d{2}:\d{2}$/, "Time must be HH:MM format"),
  actualTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Time must be HH:MM format")
    .nullable()
    .optional(),
  status: z.enum(ACTUAL_STATUS),
});

/**
 * POST /api/trips/[id]/actuals - Record an intervention actual.
 * Creates or updates the actual for a specific intervention.
 * Requires authentication and ownership.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Sign in to record actuals" },
        { status: 401 }
      );
    }

    // Find the trip
    const trip = await prisma.sharedSchedule.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    // SECURITY: Combine not-found and not-owner into single 404
    if (!trip || trip.userId !== session.user.id) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    // Parse request body
    const rawBody = await request.json();
    const parseResult = recordActualSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // Validate actualTime is provided for modified status
    if (data.status === "modified" && !data.actualTime) {
      return NextResponse.json(
        { error: "actualTime is required when status is 'modified'" },
        { status: 400 }
      );
    }

    // Upsert the actual (create or update)
    const actual = await prisma.interventionActual.upsert({
      where: {
        scheduleId_legIndex_dayOffset_interventionType: {
          scheduleId: id,
          legIndex: data.legIndex,
          dayOffset: data.dayOffset,
          interventionType: data.interventionType,
        },
      },
      create: {
        scheduleId: id,
        legIndex: data.legIndex,
        dayOffset: data.dayOffset,
        interventionType: data.interventionType,
        plannedTime: data.plannedTime,
        actualTime: data.actualTime ?? null,
        status: data.status,
        source: "manual",
      },
      update: {
        actualTime: data.actualTime ?? null,
        status: data.status,
        source: "manual",
        recordedAt: new Date(),
      },
    });

    // Trigger calendar re-sync in background (don't await to avoid blocking response)
    if (session.hasCalendarScope && session.accessToken) {
      triggerCalendarResync(id, session.user.id, session.accessToken).catch(
        (error) => console.error("Calendar resync error:", error)
      );
    }

    return NextResponse.json({
      recorded: true,
      actual: {
        id: actual.id,
        legIndex: actual.legIndex,
        dayOffset: actual.dayOffset,
        interventionType: actual.interventionType,
        plannedTime: actual.plannedTime,
        actualTime: actual.actualTime,
        status: actual.status,
      },
    });
  } catch (error) {
    console.error("Record actual error:", error);
    return NextResponse.json(
      { error: "Failed to record actual" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/trips/[id]/actuals - Get all actuals for a trip.
 * Returns list of recorded intervention actuals.
 * Requires authentication and ownership.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Sign in to view actuals" },
        { status: 401 }
      );
    }

    // Find the trip
    const trip = await prisma.sharedSchedule.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    // SECURITY: Combine not-found and not-owner into single 404
    if (!trip || trip.userId !== session.user.id) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    // Get all actuals for this trip
    const actuals = await prisma.interventionActual.findMany({
      where: { scheduleId: id },
      orderBy: [{ dayOffset: "asc" }, { legIndex: "asc" }],
      select: {
        id: true,
        legIndex: true,
        dayOffset: true,
        interventionType: true,
        plannedTime: true,
        actualTime: true,
        status: true,
        recordedAt: true,
      },
    });

    return NextResponse.json({ actuals });
  } catch (error) {
    console.error("Get actuals error:", error);
    return NextResponse.json(
      { error: "Failed to get actuals" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/trips/[id]/actuals - Delete an intervention actual.
 * Requires the same composite key to identify the actual.
 * Requires authentication and ownership.
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Sign in to delete actuals" },
        { status: 401 }
      );
    }

    // Find the trip
    const trip = await prisma.sharedSchedule.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    // SECURITY: Combine not-found and not-owner into single 404
    if (!trip || trip.userId !== session.user.id) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    // Parse request body for composite key
    const rawBody = await request.json();
    const deleteSchema = z.object({
      legIndex: z.number().int().min(0).default(0),
      dayOffset: z.number().int(),
      interventionType: z.enum(RECORDABLE_INTERVENTION_TYPES),
    });

    const parseResult = deleteSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // Delete the actual
    await prisma.interventionActual.delete({
      where: {
        scheduleId_legIndex_dayOffset_interventionType: {
          scheduleId: id,
          legIndex: data.legIndex,
          dayOffset: data.dayOffset,
          interventionType: data.interventionType,
        },
      },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    // Handle record not found gracefully
    if (
      error instanceof Error &&
      error.message.includes("Record to delete does not exist")
    ) {
      return NextResponse.json({ error: "Actual not found" }, { status: 404 });
    }

    console.error("Delete actual error:", error);
    return NextResponse.json(
      { error: "Failed to delete actual" },
      { status: 500 }
    );
  }
}
