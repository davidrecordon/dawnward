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

// Zod schema for intervention items
const interventionSchema = z.object({
  type: z.string(),
  time: z.string(),
  title: z.string(),
  description: z.string(),
  duration_minutes: z.number().optional().nullable(),
  end_time: z.string().optional().nullable(),
});

// Zod schema for day schedule
const dayScheduleSchema = z.object({
  day: z.number(),
  date: z.string(),
  timezone: z.string(),
  items: z.array(interventionSchema),
  phase_type: z.string().optional().nullable(),
  is_travel_day: z.boolean().optional(),
  is_in_transit: z.boolean().optional(),
});

// Zod schema for schedule response (validates newSchedule in PUT)
const scheduleResponseSchema = z.object({
  total_shift_hours: z.number(),
  direction: z.enum(["advance", "delay"]),
  estimated_adaptation_days: z.number(),
  origin_tz: z.string(),
  dest_tz: z.string(),
  interventions: z.array(dayScheduleSchema),
  route_label: z.string().optional().nullable(),
});

// Maximum payload size for schedule (prevents storage exhaustion)
const MAX_SCHEDULE_SIZE_BYTES = 512 * 1024; // 512KB

/**
 * POST /api/trips/[id]/recalculate - Trigger schedule recalculation.
 * Analyzes recorded actuals and returns a diff if changes are needed.
 * Requires authentication and ownership.
 *
 * SECURITY: Uses direct Python invocation instead of HTTP fetch to prevent SSRF.
 */
export async function POST(request: Request, context: RouteContext) {
  let tempFilePath: string | null = null;

  try {
    const { id } = await context.params;

    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Sign in to recalculate schedule" },
        { status: 401 }
      );
    }

    // Find the trip with its actuals and snapshots
    const trip = await prisma.sharedSchedule.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        originTz: true,
        destTz: true,
        departureDatetime: true,
        arrivalDatetime: true,
        prepDays: true,
        wakeTime: true,
        sleepTime: true,
        usesMelatonin: true,
        usesCaffeine: true,
        usesExercise: true,
        napPreference: true,
        scheduleIntensity: true,
        currentScheduleJson: true,
        initialScheduleJson: true,
        actuals: true,
        stateSnapshots: true,
      },
    });

    // SECURITY: Combine not-found and not-owner into single 404
    if (!trip || trip.userId !== session.user.id) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }

    // Check if there are any non-compliant actuals
    const nonCompliantActuals = trip.actuals.filter(
      (a) => a.status === "modified" || a.status === "skipped"
    );

    if (nonCompliantActuals.length === 0) {
      return NextResponse.json({
        needsRecalculation: false,
        message: "All interventions completed as planned",
      });
    }

    // Get current schedule
    const currentSchedule =
      trip.currentScheduleJson || trip.initialScheduleJson;
    if (!currentSchedule) {
      return NextResponse.json(
        { error: "No schedule to recalculate" },
        { status: 400 }
      );
    }

    // Create temp directory if needed
    const tempDir = path.join(os.tmpdir(), "dawnward");
    await mkdir(tempDir, { recursive: true });

    const requestId = randomUUID();
    tempFilePath = path.join(tempDir, `recalc-${requestId}.json`);

    // Prepare request data for Python script
    const requestData = {
      origin_tz: trip.originTz,
      dest_tz: trip.destTz,
      departure_datetime: trip.departureDatetime,
      arrival_datetime: trip.arrivalDatetime,
      prep_days: trip.prepDays,
      wake_time: trip.wakeTime,
      sleep_time: trip.sleepTime,
      uses_melatonin: trip.usesMelatonin,
      uses_caffeine: trip.usesCaffeine,
      uses_exercise: trip.usesExercise,
      nap_preference: trip.napPreference,
      schedule_intensity: trip.scheduleIntensity,
      current_schedule: currentSchedule,
      snapshots: trip.stateSnapshots.map((s) => ({
        dayOffset: s.dayOffset,
        cumulativeShift: s.cumulativeShift,
        cbtminMinutes: s.cbtminMinutes,
        dlmoMinutes: s.dlmoMinutes,
        direction: s.direction,
      })),
      actuals: trip.actuals.map((a) => ({
        dayOffset: a.dayOffset,
        interventionType: a.interventionType,
        plannedTime: a.plannedTime,
        actualTime: a.actualTime,
        status: a.status,
      })),
    };

    await writeFile(tempFilePath, JSON.stringify(requestData));

    // Path to Python script (SECURITY: direct invocation, no HTTP fetch)
    const pythonPath = path.resolve(process.cwd(), "api/_python");
    const scriptPath = path.join(pythonPath, "recalculate_schedule.py");

    // Execute Python recalculation script
    const resultJson = await new Promise<string>((resolve, reject) => {
      const python = spawn("python3", [scriptPath, tempFilePath!], {
        timeout: 30000,
        cwd: pythonPath,
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

    const result = JSON.parse(resultJson);

    if (result.error) {
      throw new Error(result.error);
    }

    if (!result.needsRecalculation) {
      return NextResponse.json({
        needsRecalculation: false,
        message:
          result.message || "Schedule changes are not significant enough",
      });
    }

    return NextResponse.json({
      needsRecalculation: true,
      newSchedule: result.newSchedule,
      changes: result.changes,
      restoredFromDay: result.restoredFromDay,
    });
  } catch (error) {
    console.error("Recalculation error:", error);
    return NextResponse.json(
      { error: "Failed to recalculate schedule" },
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

/**
 * PUT /api/trips/[id]/recalculate - Apply recalculated schedule.
 * Saves the new schedule to currentScheduleJson.
 * Requires authentication and ownership.
 *
 * SECURITY: Validates newSchedule with Zod schema before storage.
 */
export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Sign in to apply recalculation" },
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

    // Get raw body to check size before parsing
    const rawBody = await request.text();

    // SECURITY: Prevent storage exhaustion attacks
    if (rawBody.length > MAX_SCHEDULE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Schedule payload too large" },
        { status: 413 }
      );
    }

    // Parse JSON
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Extract newSchedule
    const bodyObj = body as Record<string, unknown>;
    const { newSchedule } = bodyObj;

    if (!newSchedule) {
      return NextResponse.json(
        { error: "Missing newSchedule in request body" },
        { status: 400 }
      );
    }

    // SECURITY: Validate newSchedule structure with Zod
    const parseResult = scheduleResponseSchema.safeParse(newSchedule);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      return NextResponse.json(
        {
          error: `Invalid schedule format: ${firstError.path.join(".")} - ${firstError.message}`,
        },
        { status: 400 }
      );
    }

    // Update the trip with validated schedule
    await prisma.sharedSchedule.update({
      where: { id },
      data: {
        currentScheduleJson: parseResult.data,
        lastRecalculatedAt: new Date(),
      },
    });

    return NextResponse.json({ applied: true });
  } catch (error) {
    console.error("Apply recalculation error:", error);
    return NextResponse.json(
      { error: "Failed to apply recalculation" },
      { status: 500 }
    );
  }
}
