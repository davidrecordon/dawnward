import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { writeFile, unlink, mkdir } from "fs/promises";
import { randomUUID } from "crypto";
import os from "os";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Zod schema for preferences update request
const preferencesUpdateSchema = z
  .object({
    usesCaffeine: z.boolean().optional(),
    usesMelatonin: z.boolean().optional(),
    usesExercise: z.boolean().optional(),
    napPreference: z.enum(["no", "flight_only", "all_days"]).optional(),
    scheduleIntensity: z.enum(["gentle", "balanced", "aggressive"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one preference must be provided",
  });

/**
 * PATCH /api/trips/[id]/preferences - Update trip preferences.
 * Regenerates the entire schedule with new preferences.
 * Requires authentication and ownership.
 */
export async function PATCH(request: Request, context: RouteContext) {
  let tempFilePath: string | null = null;

  try {
    const { id } = await context.params;

    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Sign in to edit trips" },
        { status: 401 }
      );
    }

    // Find the trip
    const trip = await prisma.sharedSchedule.findUnique({
      where: { id },
    });

    // SECURITY: Combine not-found and not-owner into single 404
    if (!trip || trip.userId !== session.user.id) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    // Parse and validate request body
    const rawBody = await request.json();
    const parseResult = preferencesUpdateSchema.safeParse(rawBody);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      return NextResponse.json({ error: firstError.message }, { status: 400 });
    }

    const updates = parseResult.data;

    // Merge updates with existing preferences
    const updatedPreferences = {
      usesMelatonin: updates.usesMelatonin ?? trip.usesMelatonin,
      usesCaffeine: updates.usesCaffeine ?? trip.usesCaffeine,
      usesExercise: updates.usesExercise ?? trip.usesExercise,
      napPreference: updates.napPreference ?? trip.napPreference,
      scheduleIntensity: updates.scheduleIntensity ?? trip.scheduleIntensity,
    };

    // Update the trip preferences in the database
    await prisma.sharedSchedule.update({
      where: { id },
      data: updatedPreferences,
    });

    // Regenerate schedule with new preferences
    // Create temp directory if needed
    const tempDir = path.join(os.tmpdir(), "dawnward");
    await mkdir(tempDir, { recursive: true });

    const requestId = randomUUID();
    tempFilePath = path.join(tempDir, `request-${requestId}.json`);

    const requestData = {
      origin_tz: trip.originTz,
      dest_tz: trip.destTz,
      departure_datetime: trip.departureDatetime,
      arrival_datetime: trip.arrivalDatetime,
      prep_days: trip.prepDays,
      wake_time: trip.wakeTime,
      sleep_time: trip.sleepTime,
      uses_melatonin: updatedPreferences.usesMelatonin,
      uses_caffeine: updatedPreferences.usesCaffeine,
      uses_exercise: updatedPreferences.usesExercise,
      nap_preference: updatedPreferences.napPreference,
      schedule_intensity: updatedPreferences.scheduleIntensity,
    };

    await writeFile(tempFilePath, JSON.stringify(requestData));

    // Path to Python script (SECURITY: use external script, not inline code)
    const pythonPath = path.resolve(process.cwd(), "api/_python");
    const scriptPath = path.join(pythonPath, "regenerate_schedule.py");

    // Execute Python with external script
    const scheduleJson = await new Promise<string>((resolve, reject) => {
      const python = spawn("python3", [scriptPath, tempFilePath!], {
        timeout: 30000,
        cwd: pythonPath, // Set working directory for imports
      });

      let stdout = "";
      let stderr = "";

      python.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      python.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      python.on("close", (code) => {
        if (code !== 0) {
          console.error("Python stderr:", stderr);
          reject(
            new Error(`Python process exited with code ${code}: ${stderr}`)
          );
        } else {
          resolve(stdout.trim());
        }
      });

      python.on("error", (err) => {
        reject(err);
      });
    });

    const scheduleData = JSON.parse(scheduleJson);

    // Store the regenerated schedule
    // If no initialScheduleJson exists, this is the first save
    const updateData: {
      currentScheduleJson: typeof scheduleData;
      lastRecalculatedAt: Date;
      initialScheduleJson?: typeof scheduleData;
    } = {
      currentScheduleJson: scheduleData,
      lastRecalculatedAt: new Date(),
    };

    // Only set initialScheduleJson if it doesn't exist
    if (!trip.initialScheduleJson) {
      updateData.initialScheduleJson = scheduleData;
    }

    await prisma.sharedSchedule.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      schedule: scheduleData,
      regeneratedAt: updateData.lastRecalculatedAt.toISOString(),
    });
  } catch (error) {
    console.error("Preferences update error:", error);

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Log detailed error server-side, return generic message to client
    console.error("Failed to update preferences:", error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  } finally {
    // Clean up temp file
    if (tempFilePath) {
      try {
        await unlink(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
