import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Zod schema for snapshot
const snapshotSchema = z.object({
  dayOffset: z.number(),
  cumulativeShift: z.number(),
  cbtminMinutes: z.number(),
  dlmoMinutes: z.number(),
  direction: z.enum(["advance", "delay"]),
});

// Zod schema for schedule storage
const scheduleUpdateSchema = z.object({
  initialScheduleJson: z.record(z.string(), z.unknown()).optional(),
  currentScheduleJson: z.record(z.string(), z.unknown()).optional(),
  snapshots: z.array(snapshotSchema).optional(),
});

/**
 * PATCH /api/trips/[id] - Update trip schedule storage.
 * Used to save initial schedule on first view, or update current schedule.
 * Requires authentication and ownership.
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Sign in to update trips" },
        { status: 401 }
      );
    }

    // Find the trip
    const trip = await prisma.sharedSchedule.findUnique({
      where: { id },
      select: { id: true, userId: true, initialScheduleJson: true },
    });

    // SECURITY: Combine not-found and not-owner into single 404
    if (!trip || trip.userId !== session.user.id) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    // Parse request body
    const rawBody = await request.json();
    const parseResult = scheduleUpdateSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const updates = parseResult.data;

    // Build update data - only set initialScheduleJson if it doesn't exist
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: Record<string, any> = {};

    if (updates.initialScheduleJson && !trip.initialScheduleJson) {
      updateData.initialScheduleJson = updates.initialScheduleJson;
    }

    if (updates.currentScheduleJson) {
      updateData.currentScheduleJson = updates.currentScheduleJson;
    }

    // Only update if there's something to update
    if (Object.keys(updateData).length > 0) {
      await prisma.sharedSchedule.update({
        where: { id },
        data: updateData,
      });
    }

    // Store snapshots if provided (upsert each one)
    if (updates.snapshots && updates.snapshots.length > 0) {
      for (const snapshot of updates.snapshots) {
        await prisma.markerStateSnapshot.upsert({
          where: {
            scheduleId_legIndex_dayOffset: {
              scheduleId: id,
              legIndex: 0,
              dayOffset: snapshot.dayOffset,
            },
          },
          create: {
            scheduleId: id,
            legIndex: 0,
            dayOffset: snapshot.dayOffset,
            cumulativeShift: snapshot.cumulativeShift,
            cbtminMinutes: snapshot.cbtminMinutes,
            dlmoMinutes: snapshot.dlmoMinutes,
            direction: snapshot.direction,
          },
          update: {
            cumulativeShift: snapshot.cumulativeShift,
            cbtminMinutes: snapshot.cbtminMinutes,
            dlmoMinutes: snapshot.dlmoMinutes,
            direction: snapshot.direction,
          },
        });
      }
    }

    return NextResponse.json({ updated: true });
  } catch (error) {
    console.error("Trip update error:", error);
    return NextResponse.json(
      { error: "Failed to update trip" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/trips/[id] - Delete a trip.
 * Requires authentication and ownership.
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Sign in to delete trips" },
        { status: 401 }
      );
    }

    // Find the trip
    const trip = await prisma.sharedSchedule.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    // SECURITY: Combine not-found and not-owner into single 404 to prevent enumeration
    if (!trip || trip.userId !== session.user.id) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    // Delete the trip
    await prisma.sharedSchedule.delete({
      where: { id },
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Trip deletion error:", error);
    return NextResponse.json(
      { error: "Failed to delete trip" },
      { status: 500 }
    );
  }
}
