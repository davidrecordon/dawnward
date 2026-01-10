import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{ id: string }>;
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
