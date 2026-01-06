import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { writeFile, unlink, mkdir } from "fs/promises";
import { randomUUID } from "crypto";
import os from "os";

interface GenerateRequest {
  origin_tz: string;
  dest_tz: string;
  departure_datetime: string;
  arrival_datetime: string;
  prep_days: number;
  wake_time: string;
  sleep_time: string;
  uses_melatonin: boolean;
  uses_caffeine: boolean;
  uses_exercise: boolean;
}

// Validation patterns
const TIMEZONE_PATTERN = /^[A-Za-z_]+\/[A-Za-z_]+$/;
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;

function validateRequest(body: GenerateRequest): string | null {
  // Required fields
  const requiredFields = [
    "origin_tz",
    "dest_tz",
    "departure_datetime",
    "arrival_datetime",
    "prep_days",
    "wake_time",
    "sleep_time",
  ];

  for (const field of requiredFields) {
    if (!(field in body)) {
      return `Missing required field: ${field}`;
    }
  }

  // Timezone validation
  if (!TIMEZONE_PATTERN.test(body.origin_tz)) {
    return `Invalid origin timezone format: ${body.origin_tz}`;
  }
  if (!TIMEZONE_PATTERN.test(body.dest_tz)) {
    return `Invalid destination timezone format: ${body.dest_tz}`;
  }

  // Datetime validation
  if (!DATETIME_PATTERN.test(body.departure_datetime)) {
    return `Invalid departure datetime format: ${body.departure_datetime}`;
  }
  if (!DATETIME_PATTERN.test(body.arrival_datetime)) {
    return `Invalid arrival datetime format: ${body.arrival_datetime}`;
  }

  // Time validation
  if (!TIME_PATTERN.test(body.wake_time)) {
    return `Invalid wake time format: ${body.wake_time}`;
  }
  if (!TIME_PATTERN.test(body.sleep_time)) {
    return `Invalid sleep time format: ${body.sleep_time}`;
  }

  // Prep days validation
  if (typeof body.prep_days !== "number" || body.prep_days < 1 || body.prep_days > 7) {
    return `prep_days must be a number between 1 and 7`;
  }

  return null;
}

export async function POST(request: Request) {
  let tempFilePath: string | null = null;

  try {
    const body: GenerateRequest = await request.json();

    // Validate input
    const validationError = validateRequest(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Create temp directory if needed
    const tempDir = path.join(os.tmpdir(), "dawnward");
    await mkdir(tempDir, { recursive: true });

    // Write request data to temp JSON file (avoids command injection)
    const requestId = randomUUID();
    tempFilePath = path.join(tempDir, `request-${requestId}.json`);

    const requestData = {
      origin_tz: body.origin_tz,
      dest_tz: body.dest_tz,
      departure_datetime: body.departure_datetime,
      arrival_datetime: body.arrival_datetime,
      prep_days: body.prep_days,
      wake_time: body.wake_time,
      sleep_time: body.sleep_time,
      uses_melatonin: body.uses_melatonin ?? true,
      uses_caffeine: body.uses_caffeine ?? true,
      uses_exercise: body.uses_exercise ?? false,
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
from circadian.scheduler import ScheduleGenerator

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
)

generator = ScheduleGenerator()
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
      const python = spawn("python3", ["-c", pythonScript, pythonPath, tempFilePath!], {
        timeout: 30000,
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
          reject(new Error(`Python process exited with code ${code}: ${stderr}`));
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
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
