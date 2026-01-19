import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  createEventsForSchedule,
  deleteCalendarEvents,
} from "@/lib/google-calendar";
import type { ScheduleResponse } from "@/types/schedule";

// Feature flag for calendar sync
const CALENDAR_SYNC_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_CALENDAR_SYNC === "true";

/**
 * POST /api/calendar/sync
 * Sync a trip's schedule to Google Calendar.
 * Creates calendar events for all actionable interventions.
 */
export async function POST(request: Request) {
  // Guard: Calendar sync feature must be enabled
  if (!CALENDAR_SYNC_ENABLED) {
    return NextResponse.json(
      { error: "Calendar sync is not available" },
      { status: 404 }
    );
  }
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.hasCalendarScope || !session.accessToken) {
    return NextResponse.json(
      { error: "Calendar access not granted. Please re-authorize." },
      { status: 403 }
    );
  }

  let tripId: string;
  try {
    const body = await request.json();
    tripId = body.tripId;
    if (!tripId) {
      return NextResponse.json(
        { error: "tripId is required" },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  // Fetch the trip and verify ownership
  const trip = await prisma.sharedSchedule.findUnique({
    where: { id: tripId },
    include: {
      calendarSyncs: {
        where: { userId: session.user.id },
      },
    },
  });

  if (!trip) {
    return NextResponse.json({ error: "Trip not found" }, { status: 404 });
  }

  if (trip.userId !== session.user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Get the schedule data
  const scheduleJson = trip.currentScheduleJson ?? trip.initialScheduleJson;
  if (!scheduleJson) {
    return NextResponse.json(
      { error: "No schedule data available" },
      { status: 400 }
    );
  }

  const schedule = scheduleJson as unknown as ScheduleResponse;

  // Delete existing calendar events if this trip was previously synced.
  // NOTE: We abort on delete failure here (unlike DELETE endpoint which continues).
  // This is intentional: if we can't clean up old events, creating new ones would
  // result in duplicate events in the user's calendar. Better to fail and let user retry.
  const existingSync = trip.calendarSyncs[0];
  if (existingSync && existingSync.googleEventIds.length > 0) {
    const deleteResult = await deleteCalendarEvents(
      session.accessToken,
      existingSync.googleEventIds
    );

    if (deleteResult.failed.length > 0) {
      console.error(
        `Failed to delete ${deleteResult.failed.length} calendar events:`,
        deleteResult.failed
      );
      return NextResponse.json(
        {
          error: `Failed to remove ${deleteResult.failed.length} existing calendar events. Please try again.`,
          failedEventIds: deleteResult.failed,
        },
        { status: 500 }
      );
    }
  }

  // Create calendar events for each day's interventions
  console.log(
    `[Calendar API] Creating events for trip ${tripId}, ${schedule.interventions.length} days`
  );
  const createResult = await createEventsForSchedule(
    session.accessToken,
    schedule.interventions
  );
  console.log(
    `[Calendar API] Result: ${createResult.created.length} created, ${createResult.failed} failed`
  );

  // Save or update the sync record with successfully created events
  if (existingSync) {
    await prisma.calendarSync.update({
      where: { id: existingSync.id },
      data: {
        googleEventIds: createResult.created,
        lastSyncedAt: new Date(),
      },
    });
  } else {
    await prisma.calendarSync.create({
      data: {
        tripId,
        userId: session.user.id,
        googleEventIds: createResult.created,
        lastSyncedAt: new Date(),
      },
    });
  }

  // If some events failed to create, return 207 Multi-Status with warning
  if (createResult.failed > 0) {
    return NextResponse.json(
      {
        success: true,
        eventsCreated: createResult.created.length,
        eventsFailed: createResult.failed,
        warning: `${createResult.failed} event(s) could not be added to your calendar. The rest were added successfully.`,
      },
      { status: 207 } // Multi-Status
    );
  }

  return NextResponse.json({
    success: true,
    eventsCreated: createResult.created.length,
  });
}

/**
 * DELETE /api/calendar/sync
 * Remove all calendar events for a trip.
 */
export async function DELETE(request: Request) {
  // Guard: Calendar sync feature must be enabled
  if (!CALENDAR_SYNC_ENABLED) {
    return NextResponse.json(
      { error: "Calendar sync is not available" },
      { status: 404 }
    );
  }

  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.hasCalendarScope || !session.accessToken) {
    return NextResponse.json(
      { error: "Calendar access not granted" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("tripId");

  if (!tripId) {
    return NextResponse.json({ error: "tripId is required" }, { status: 400 });
  }

  // Find the sync record
  const sync = await prisma.calendarSync.findUnique({
    where: {
      tripId_userId: {
        tripId,
        userId: session.user.id,
      },
    },
  });

  if (!sync) {
    return NextResponse.json({ error: "Sync not found" }, { status: 404 });
  }

  // Delete all calendar events (best-effort).
  // NOTE: Unlike POST (which aborts on delete failure), we continue here even if some
  // deletions fail. This is intentional: when removing sync, we want to clean up our
  // database record regardless. Failed deletions just mean some orphaned events remain
  // in the user's calendar - they can delete those manually if needed.
  let deletedCount = 0;
  if (sync.googleEventIds.length > 0) {
    const deleteResult = await deleteCalendarEvents(
      session.accessToken,
      sync.googleEventIds
    );
    deletedCount = deleteResult.deleted.length;

    if (deleteResult.failed.length > 0) {
      console.error(
        `Failed to delete ${deleteResult.failed.length} calendar events:`,
        deleteResult.failed
      );
    }
  }

  // Delete the sync record
  await prisma.calendarSync.delete({
    where: { id: sync.id },
  });

  return NextResponse.json({
    success: true,
    eventsDeleted: deletedCount,
  });
}

/**
 * GET /api/calendar/sync
 * Check if a trip is synced to calendar.
 */
export async function GET(request: Request) {
  // Guard: Calendar sync feature must be enabled
  if (!CALENDAR_SYNC_ENABLED) {
    return NextResponse.json(
      { error: "Calendar sync is not available" },
      { status: 404 }
    );
  }

  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("tripId");

  if (!tripId) {
    return NextResponse.json({ error: "tripId is required" }, { status: 400 });
  }

  const sync = await prisma.calendarSync.findUnique({
    where: {
      tripId_userId: {
        tripId,
        userId: session.user.id,
      },
    },
  });

  return NextResponse.json({
    isSynced: !!sync,
    lastSyncedAt: sync?.lastSyncedAt ?? null,
    eventCount: sync?.googleEventIds.length ?? 0,
  });
}
