import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateShortCode } from "@/lib/short-code";

const MAX_RETRIES = 5;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/trips/[id]/share - Add a share code to an existing trip.
 * Requires authentication and ownership.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Sign in to share your schedule" },
        { status: 401 }
      );
    }

    // Find the trip
    const trip = await prisma.sharedSchedule.findUnique({
      where: { id },
      select: { id: true, userId: true, code: true },
    });

    // SECURITY: Combine not-found and not-owner into single 404 to prevent enumeration
    if (!trip || trip.userId !== session.user.id) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    // If already shared, return existing code
    if (trip.code) {
      const baseUrl = process.env.NEXTAUTH_URL || "https://dawnward.app";
      return NextResponse.json({
        url: `${baseUrl}/s/${trip.code}`,
        code: trip.code,
      });
    }

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

    // Update trip with share code
    await prisma.sharedSchedule.update({
      where: { id },
      data: { code },
    });

    const baseUrl = process.env.NEXTAUTH_URL || "https://dawnward.app";
    return NextResponse.json({
      url: `${baseUrl}/s/${code}`,
      code,
    });
  } catch (error) {
    console.error("Share creation error:", error);
    return NextResponse.json(
      { error: "Failed to create share link" },
      { status: 500 }
    );
  }
}
