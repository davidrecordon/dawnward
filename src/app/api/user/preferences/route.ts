import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { z } from "zod";

const preferencesSchema = z.object({
  defaultWakeTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  defaultSleepTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  defaultPrepDays: z.number().min(1).max(7).optional(),
  usesMelatonin: z.boolean().optional(),
  usesCaffeine: z.boolean().optional(),
  usesExercise: z.boolean().optional(),
  caffeineCutoffHours: z
    .number()
    .int()
    .refine((v) => [6, 8, 10, 12].includes(v), {
      message: "Must be 6, 8, 10, or 12",
    })
    .optional(),
  lightExposureMinutes: z
    .number()
    .int()
    .refine((v) => [30, 45, 60, 90].includes(v), {
      message: "Must be 30, 45, 60, or 90",
    })
    .optional(),
  napPreference: z.enum(["no", "flight_only", "all_days"]).optional(),
  scheduleIntensity: z.enum(["gentle", "balanced", "aggressive"]).optional(),
  showDualTimezone: z.boolean().optional(),
  use24HourFormat: z.boolean().optional(),
});

/**
 * GET /api/user/preferences
 * Returns the current user's preferences (for pre-populating the trip form)
 */
export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      defaultWakeTime: true,
      defaultSleepTime: true,
      defaultPrepDays: true,
      usesMelatonin: true,
      usesCaffeine: true,
      usesExercise: true,
      caffeineCutoffHours: true,
      lightExposureMinutes: true,
      napPreference: true,
      scheduleIntensity: true,
      showDualTimezone: true,
      use24HourFormat: true,
      createdAt: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}

/**
 * PATCH /api/user/preferences
 * Updates the current user's preferences (from the save modal)
 */
export async function PATCH(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = preferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid preferences", details: parsed.error.issues },
      { status: 400 }
    );
  }

  // Only update fields that were provided
  const updates = parsed.data;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No preferences to update" },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: updates,
    select: {
      defaultWakeTime: true,
      defaultSleepTime: true,
      defaultPrepDays: true,
      usesMelatonin: true,
      usesCaffeine: true,
      usesExercise: true,
      caffeineCutoffHours: true,
      lightExposureMinutes: true,
      napPreference: true,
      scheduleIntensity: true,
      showDualTimezone: true,
      use24HourFormat: true,
    },
  });

  return NextResponse.json(updated);
}
