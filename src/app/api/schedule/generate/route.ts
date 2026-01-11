import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { writeFile, unlink, mkdir } from "fs/promises";
import { randomUUID } from "crypto";
import os from "os";
import { z } from "zod";

// Validation patterns
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

/**
 * Validate that a timezone string is a valid IANA timezone.
 * Uses Intl.DateTimeFormat which throws for invalid timezones.
 */
function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Zod schema for timezone validation with IANA check
const timezoneSchema = z.string().min(1).refine(isValidTimezone, {
  message: "Invalid IANA timezone",
});

// Zod schema for schedule generation request
const scheduleRequestSchema = z.object({
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
  caffeine_cutoff_hours: z.number().int().min(6).max(12).default(8),
  light_exposure_minutes: z.number().int().min(30).max(90).default(60),
  nap_preference: z
    .enum(["no", "flight_only", "all_days"])
    .default("flight_only"),
  schedule_intensity: z
    .enum(["gentle", "balanced", "aggressive"])
    .default("balanced"),
});

export async function POST(request: Request) {
  let tempFilePath: string | null = null;

  try {
    const rawBody = await request.json();

    // Validate input with Zod (includes defaults)
    const parseResult = scheduleRequestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      const fieldPath = firstError.path.join(".");
      const message = fieldPath
        ? `${fieldPath}: ${firstError.message}`
        : firstError.message;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const body = parseResult.data;

    // Create temp directory if needed
    const tempDir = path.join(os.tmpdir(), "dawnward");
    await mkdir(tempDir, { recursive: true });

    // Write request data to temp JSON file (avoids command injection)
    const requestId = randomUUID();
    tempFilePath = path.join(tempDir, `request-${requestId}.json`);

    // Zod schema already applied defaults, so we can use body directly
    const requestData = {
      origin_tz: body.origin_tz,
      dest_tz: body.dest_tz,
      departure_datetime: body.departure_datetime,
      arrival_datetime: body.arrival_datetime,
      prep_days: body.prep_days,
      wake_time: body.wake_time,
      sleep_time: body.sleep_time,
      uses_melatonin: body.uses_melatonin,
      uses_caffeine: body.uses_caffeine,
      uses_exercise: body.uses_exercise,
      caffeine_cutoff_hours: body.caffeine_cutoff_hours,
      light_exposure_minutes: body.light_exposure_minutes,
      nap_preference: body.nap_preference,
      schedule_intensity: body.schedule_intensity,
    };

    await writeFile(tempFilePath, JSON.stringify(requestData));

    // Path to Python module (underscore prefix for Vercel compatibility)
    const pythonPath = path.resolve(process.cwd(), "api/_python");

    // Python script that reads from the JSON file
    const pythonScript = `
import sys
import json
from dataclasses import asdict

sys.path.insert(0, sys.argv[1])

from circadian.types import TripLeg, ScheduleRequest
from circadian.scheduler_v2 import ScheduleGeneratorV2

# Read request from JSON file
with open(sys.argv[2], 'r') as f:
    data = json.load(f)

request = ScheduleRequest(
    legs=[
        TripLeg(
            origin_tz=data['origin_tz'],
            dest_tz=data['dest_tz'],
            departure_datetime=data['departure_datetime'],
            arrival_datetime=data['arrival_datetime'],
        )
    ],
    prep_days=data['prep_days'],
    wake_time=data['wake_time'],
    sleep_time=data['sleep_time'],
    uses_melatonin=data['uses_melatonin'],
    uses_caffeine=data['uses_caffeine'],
    uses_exercise=data['uses_exercise'],
    caffeine_cutoff_hours=data.get('caffeine_cutoff_hours', 8),
    light_exposure_minutes=data.get('light_exposure_minutes', 60),
    nap_preference=data.get('nap_preference', 'flight_only'),
    schedule_intensity=data.get('schedule_intensity', 'balanced'),
)

generator = ScheduleGeneratorV2()
response = generator.generate_schedule(request)

# Convert dataclass to dict for JSON serialization
def to_dict(obj):
    if hasattr(obj, '__dataclass_fields__'):
        return {k: to_dict(v) for k, v in asdict(obj).items()}
    elif isinstance(obj, list):
        return [to_dict(item) for item in obj]
    else:
        return obj

print(json.dumps(to_dict(response)))
`;

    // Execute Python with arguments (not shell interpolation)
    const schedule = await new Promise<string>((resolve, reject) => {
      const python = spawn(
        "python3",
        ["-c", pythonScript, pythonPath, tempFilePath!],
        {
          timeout: 30000,
        }
      );

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

    // Parse the JSON output
    const scheduleData = JSON.parse(schedule);

    return NextResponse.json({
      id: randomUUID(),
      schedule: scheduleData,
    });
  } catch (error) {
    console.error("Schedule generation error:", error);

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Failed to parse schedule response" },
        { status: 500 }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Schedule generation failed: ${message}` },
      { status: 500 }
    );
  } finally {
    // Clean up temp file
    if (tempFilePath) {
      try {
        await unlink(tempFilePath);
      } catch (unlinkError) {
        // Log cleanup failures for monitoring - could indicate permission issues
        // or accumulating files in /tmp
        console.error(
          `Failed to cleanup temp file ${tempFilePath}:`,
          unlinkError
        );
      }
    }
  }
}
