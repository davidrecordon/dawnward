#!/usr/bin/env npx tsx
import "dotenv/config";

/**
 * Regenerate all stored schedules with the new timezone enrichment fields.
 *
 * This script migrates schedules from the old format (single `time` field)
 * to the new format with dual timezone fields:
 * - origin_time, dest_time
 * - origin_date, dest_date
 * - origin_tz, dest_tz
 * - phase_type
 * - show_dual_timezone
 *
 * Usage:
 *   npx tsx scripts/regenerate-schedules.ts           # Regenerate all schedules
 *   npx tsx scripts/regenerate-schedules.ts --dry-run # Preview without saving
 *   npx tsx scripts/regenerate-schedules.ts --id=xxx  # Regenerate specific trip
 */

import { spawn } from "child_process";
import { writeFile, unlink, mkdir } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import os from "os";
import { prisma } from "../src/lib/prisma";

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const specificId = args.find((a) => a.startsWith("--id="))?.split("=")[1];

interface ScheduleResult {
  total_shift_hours: number;
  direction: string;
  estimated_adaptation_days: number;
  origin_tz: string;
  dest_tz: string;
  interventions: unknown[];
  route_label?: string;
}

// Python script that generates a schedule (same as API route)
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

/**
 * Call Python scheduler to generate a fresh schedule
 */
async function generateSchedule(params: {
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
  nap_preference: string;
  schedule_intensity: string;
}): Promise<ScheduleResult> {
  const tempDir = path.join(os.tmpdir(), "dawnward-migrate");
  await mkdir(tempDir, { recursive: true });

  const requestId = randomUUID();
  const tempFilePath = path.join(tempDir, `migrate-${requestId}.json`);

  // Write request to temp file
  await writeFile(
    tempFilePath,
    JSON.stringify({
      ...params,
      caffeine_cutoff_hours: 8,
      light_exposure_minutes: 60,
    })
  );

  const pythonPath = path.resolve(process.cwd(), "api/_python");

  try {
    const resultJson = await new Promise<string>((resolve, reject) => {
      const python = spawn(
        "python3",
        ["-c", pythonScript, pythonPath, tempFilePath],
        { timeout: 30000 }
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
          reject(new Error(`Python error: ${stderr}`));
        } else {
          resolve(stdout.trim());
        }
      });

      python.on("error", reject);
    });

    return JSON.parse(resultJson) as ScheduleResult;
  } finally {
    try {
      await unlink(tempFilePath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

async function main() {
  console.log("🔄 Regenerating schedules with new timezone fields...\n");

  if (dryRun) {
    console.log("📋 DRY RUN - no changes will be saved\n");
  }

  // Fetch schedules to regenerate
  const whereClause = specificId ? { id: specificId } : {};

  const schedules = await prisma.sharedSchedule.findMany({
    where: whereClause,
    select: {
      id: true,
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
      routeLabel: true,
      initialScheduleJson: true,
      currentScheduleJson: true,
    },
  });

  console.log(`Found ${schedules.length} schedule(s) to regenerate\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const schedule of schedules) {
    const label = schedule.routeLabel || schedule.id;
    process.stdout.write(`Processing ${label}... `);

    try {
      // Generate fresh schedule with new fields
      const newSchedule = await generateSchedule({
        origin_tz: schedule.originTz,
        dest_tz: schedule.destTz,
        departure_datetime: schedule.departureDatetime,
        arrival_datetime: schedule.arrivalDatetime,
        prep_days: schedule.prepDays,
        wake_time: schedule.wakeTime,
        sleep_time: schedule.sleepTime,
        uses_melatonin: schedule.usesMelatonin,
        uses_caffeine: schedule.usesCaffeine,
        uses_exercise: schedule.usesExercise,
        nap_preference: schedule.napPreference,
        schedule_intensity: schedule.scheduleIntensity,
      });

      // Validate new schedule has the enriched fields
      const firstDay = newSchedule.interventions[0] as {
        items?: Array<{ origin_time?: string; dest_time?: string }>;
      };
      const firstItem = firstDay?.items?.[0];

      if (!firstItem?.origin_time || !firstItem?.dest_time) {
        throw new Error("New schedule missing timezone enrichment fields");
      }

      if (!dryRun) {
        // Update both initial and current schedule JSON
        // Cast to unknown first since Prisma expects InputJsonValue
        await prisma.sharedSchedule.update({
          where: { id: schedule.id },
          data: {
            initialScheduleJson: newSchedule as unknown as object,
            currentScheduleJson: newSchedule as unknown as object,
          },
        });
      }

      console.log("✅");
      successCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.log(`❌ ${message}`);
      errorCount++;
    }
  }

  console.log(`\n✨ Done! ${successCount} succeeded, ${errorCount} failed`);

  if (dryRun && successCount > 0) {
    console.log("\nRun without --dry-run to apply changes");
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
