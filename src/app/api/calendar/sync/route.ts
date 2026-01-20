import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  createEventsForSchedule,
  deleteCalendarEvents,
} from "@/lib/google-calendar";
import { getValidAccessToken } from "@/lib/token-refresh";
import type { ScheduleResponse } from "@/types/schedule";

/** Retry configuration for transient errors */
const RETRY_CONFIG = {
  maxRetries: 2,
  baseDelayMs: 1000,
};

/** Stale sync timeout - if syncing for longer than this, treat as failed */
const STALE_SYNC_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Error codes for client handling */
type ErrorCode =
  | "token_revoked"
  | "rate_limit"
  | "network"
  | "calendar_not_found"
  | "unknown";

/**
 * Classify an error for appropriate handling
 */
function classifyError(error: unknown): { code: ErrorCode; message: string } {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Token revoked or invalid (requires re-auth)
    if (
      message.includes("invalid_grant") ||
      message.includes("token has been expired or revoked") ||
      message.includes("invalid credentials")
    ) {
      return { code: "token_revoked", message: "Calendar access was revoked" };
    }

    // Rate limiting (should retry with backoff)
    if (message.includes("rate limit") || message.includes("quota exceeded")) {
      return { code: "rate_limit", message: "Rate limited by Google Calendar" };
    }

    // Network errors (transient, should retry)
    if (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("econnrefused")
    ) {
      return { code: "network", message: "Network error" };
    }

    // Calendar not found
    if (message.includes("calendar not found")) {
      return {
        code: "calendar_not_found",
        message: "Calendar not found",
      };
    }

    return { code: "unknown", message: error.message };
  }

  return { code: "unknown", message: "Unknown error" };
}

/**
 * Check if an error is retryable
 */
function isRetryableError(code: ErrorCode): boolean {
  return code === "rate_limit" || code === "network";
}

/**
 * Sleep for specified milliseconds
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Background sync worker function
 * Runs after the response is sent to the client
 */
async function runSyncInBackground(params: {
  tripId: string;
  userId: string;
  syncId: string;
  existingEventIds: string[];
}): Promise<void> {
  const { tripId, userId, syncId, existingEventIds } = params;

  let retryCount = 0;

  while (true) {
    try {
      // Get a fresh access token (auto-refreshes if expired)
      const { accessToken } = await getValidAccessToken(userId);

      // Delete existing events if re-syncing
      if (existingEventIds.length > 0) {
        console.log(
          `[CalendarSync] Deleting ${existingEventIds.length} existing events`
        );
        const deleteResult = await deleteCalendarEvents(
          accessToken,
          existingEventIds
        );

        if (deleteResult.failed.length > 0) {
          console.error(
            `[CalendarSync] Failed to delete ${deleteResult.failed.length} events`
          );
          // Continue anyway - we'll create new events
        }
      }

      // Fetch the trip schedule
      const trip = await prisma.sharedSchedule.findUnique({
        where: { id: tripId },
      });

      if (!trip) {
        throw new Error("Trip not found");
      }

      const scheduleJson = trip.currentScheduleJson ?? trip.initialScheduleJson;
      if (!scheduleJson) {
        throw new Error("No schedule data available");
      }

      const schedule = scheduleJson as unknown as ScheduleResponse;

      // Create calendar events
      console.log(
        `[CalendarSync] Creating events for trip ${tripId}, ${schedule.interventions.length} days`
      );
      const createResult = await createEventsForSchedule(
        accessToken,
        schedule.interventions
      );

      // Update sync record with success
      await prisma.calendarSync.update({
        where: { id: syncId },
        data: {
          status: "completed",
          googleEventIds: createResult.created,
          lastSyncedAt: new Date(),
          eventsCreated: createResult.created.length,
          eventsFailed: createResult.failed,
          errorMessage: null,
          errorCode: null,
        },
      });

      console.log(
        `[CalendarSync] Completed: ${createResult.created.length} created, ${createResult.failed} failed`
      );

      return; // Success - exit retry loop
    } catch (error) {
      const { code, message } = classifyError(error);
      console.error(`[CalendarSync] Error (${code}): ${message}`, error);

      // Check if we should retry
      if (isRetryableError(code) && retryCount < RETRY_CONFIG.maxRetries) {
        retryCount++;
        const delay = RETRY_CONFIG.baseDelayMs * Math.pow(2, retryCount - 1);
        console.log(
          `[CalendarSync] Retrying in ${delay}ms (attempt ${retryCount}/${RETRY_CONFIG.maxRetries})`
        );
        await sleep(delay);
        continue;
      }

      // Update sync record with failure
      await prisma.calendarSync.update({
        where: { id: syncId },
        data: {
          status: "failed",
          errorMessage: message,
          errorCode: code,
        },
      });

      return; // Exit on non-retryable error or max retries reached
    }
  }
}

/**
 * POST /api/calendar/sync
 * Sync a trip's schedule to Google Calendar.
 * Returns immediately and runs sync in background.
 */
export async function POST(request: Request) {
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

  // Verify schedule data exists
  const scheduleJson = trip.currentScheduleJson ?? trip.initialScheduleJson;
  if (!scheduleJson) {
    return NextResponse.json(
      { error: "No schedule data available" },
      { status: 400 }
    );
  }

  // Get existing sync record (if any)
  const existingSync = trip.calendarSyncs[0];
  const existingEventIds = existingSync?.googleEventIds ?? [];

  // Create or update sync record with "syncing" status
  const syncRecord = await prisma.calendarSync.upsert({
    where: {
      tripId_userId: {
        tripId,
        userId: session.user.id,
      },
    },
    create: {
      tripId,
      userId: session.user.id,
      status: "syncing",
      startedAt: new Date(),
      googleEventIds: [],
    },
    update: {
      status: "syncing",
      startedAt: new Date(),
      errorMessage: null,
      errorCode: null,
    },
  });

  // Fire background task (non-blocking)
  waitUntil(
    runSyncInBackground({
      tripId,
      userId: session.user.id,
      syncId: syncRecord.id,
      existingEventIds,
    })
  );

  // Return immediately
  return NextResponse.json({
    success: true,
    status: "syncing",
    message: "Calendar sync started",
  });
}

/**
 * DELETE /api/calendar/sync
 * Remove all calendar events for a trip.
 */
export async function DELETE(request: Request) {
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
 * Check sync status for a trip.
 */
export async function GET(request: Request) {
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

  if (!sync) {
    return NextResponse.json({
      isSynced: false,
      status: null,
      lastSyncedAt: null,
      eventCount: 0,
    });
  }

  // Check for stale sync (stuck in "syncing" state)
  let status = sync.status;
  let errorMessage = sync.errorMessage;
  let errorCode = sync.errorCode;

  if (
    status === "syncing" &&
    sync.startedAt &&
    Date.now() - sync.startedAt.getTime() > STALE_SYNC_TIMEOUT_MS
  ) {
    // Treat stale sync as failed - background function likely crashed
    status = "failed";
    errorMessage = "Sync timed out. Please try again.";
    errorCode = "network";

    // Update the database record to reflect the timeout
    // (fire-and-forget - don't await to keep response fast)
    prisma.calendarSync
      .update({
        where: { id: sync.id },
        data: {
          status: "failed",
          errorMessage,
          errorCode,
        },
      })
      .catch((err) => {
        console.error("[CalendarSync] Failed to update stale sync status:", err);
      });
  }

  return NextResponse.json({
    isSynced: status === "completed",
    status,
    lastSyncedAt: sync.lastSyncedAt,
    eventCount: sync.googleEventIds.length,
    eventsCreated: sync.eventsCreated,
    eventsFailed: sync.eventsFailed,
    errorMessage,
    errorCode,
  });
}
