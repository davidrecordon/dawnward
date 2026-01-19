#!/usr/bin/env npx tsx
import "dotenv/config";

/**
 * Regenerate stored schedules by re-running the Python scheduler.
 *
 * Use this after schema changes to intervention data (e.g., adding new fields
 * like timezone enrichment) or to fix bugs in stored schedules.
 *
 * Usage:
 *   npx tsx scripts/regenerate-schedules.ts --help              # Show help
 *   npx tsx scripts/regenerate-schedules.ts --all-trips         # All future trips
 *   npx tsx scripts/regenerate-schedules.ts --user=<userId>     # All future trips for user
 *   npx tsx scripts/regenerate-schedules.ts --trip=<tripId>     # Specific trip (any date)
 */

import { spawn } from "child_process";
import { writeFile, unlink, mkdir } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import os from "os";
import { prisma } from "../src/lib/prisma";

// CLI argument types
interface ParsedArgs {
  tripId?: string; // --trip=<id>
  userId?: string; // --user=<id>
  allTrips: boolean; // --all-trips
  dryRun: boolean; // --dry-run
  verbose: boolean; // --verbose, -v
  includePast: boolean; // --include-past
  resetInitial: boolean; // --reset-initial
  help: boolean; // --help, -h
}

interface DaySchedule {
  date: string;
  items?: Array<{ origin_time?: string; dest_time?: string }>;
}

interface ScheduleResult {
  total_shift_hours: number;
  direction: string;
  estimated_adaptation_days: number;
  origin_tz: string;
  dest_tz: string;
  interventions: DaySchedule[];
  route_label?: string;
}

function printUsage(): void {
  console.log(`
Regenerate stored schedules by re-running the Python scheduler.

Usage:
  npx tsx scripts/regenerate-schedules.ts --trip=<tripId>  # Specific trip
  npx tsx scripts/regenerate-schedules.ts --user=<userId>  # All future trips for user
  npx tsx scripts/regenerate-schedules.ts --all-trips      # All future trips

Options:
  --dry-run        Preview changes without saving
  --verbose, -v    Show detailed output
  --include-past   Include past trips (with --all-trips or --user)
  --reset-initial  Also update initialScheduleJson (default: only currentScheduleJson)
  --help, -h       Show this help message

Examples:
  npx tsx scripts/regenerate-schedules.ts --all-trips --dry-run
  npx tsx scripts/regenerate-schedules.ts --user=abc123 --include-past
  npx tsx scripts/regenerate-schedules.ts --trip=xyz789 --verbose --reset-initial
`);
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);

  const parsed: ParsedArgs = {
    tripId: undefined,
    userId: undefined,
    allTrips: false,
    dryRun: false,
    verbose: false,
    includePast: false,
    resetInitial: false,
    help: false,
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--all-trips") {
      parsed.allTrips = true;
    } else if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg === "--verbose" || arg === "-v") {
      parsed.verbose = true;
    } else if (arg === "--include-past") {
      parsed.includePast = true;
    } else if (arg === "--reset-initial") {
      parsed.resetInitial = true;
    } else if (arg.startsWith("--trip=")) {
      parsed.tripId = arg.split("=")[1];
    } else if (arg.startsWith("--user=")) {
      parsed.userId = arg.split("=")[1];
    } else {
      console.error(`Unknown argument: ${arg}\n`);
      printUsage();
      process.exit(1);
    }
  }

  return parsed;
}

/**
 * Check if a schedule has any intervention dates >= today
 */
function isFutureTrip(schedule: { interventions: DaySchedule[] }): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return schedule.interventions.some((day) => {
    const dayDate = new Date(day.date);
    dayDate.setHours(0, 0, 0, 0);
    return dayDate >= today;
  });
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
  const args = parseArgs();

  // Show help if requested or no mode specified
  if (args.help || (!args.tripId && !args.userId && !args.allTrips)) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  console.log("🔄 Regenerating schedules...\n");

  if (args.dryRun) {
    console.log("📋 DRY RUN - no changes will be saved\n");
  }

  if (args.verbose) {
    console.log("Options:");
    if (args.tripId) console.log(`  Trip ID: ${args.tripId}`);
    if (args.userId) console.log(`  User ID: ${args.userId}`);
    if (args.allTrips) console.log("  Mode: All trips");
    console.log(`  Include past: ${args.includePast}`);
    console.log(`  Reset initial: ${args.resetInitial}`);
    console.log();
  }

  // Build where clause based on args
  const whereClause: { id?: string; userId?: string } = {};
  if (args.tripId) {
    whereClause.id = args.tripId;
  } else if (args.userId) {
    whereClause.userId = args.userId;
  }
  // --all-trips uses empty where clause

  // Fetch schedules to regenerate
  const schedules = await prisma.sharedSchedule.findMany({
    where: whereClause,
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
      routeLabel: true,
      currentScheduleJson: true,
    },
  });

  if (args.verbose) {
    console.log(`Found ${schedules.length} total schedule(s) in database\n`);
  }

  // Filter by future trips unless --include-past or --trip specified
  const shouldFilterPast = !args.includePast && !args.tripId;
  const filteredSchedules = shouldFilterPast
    ? schedules.filter((s) => {
        const currentJson =
          s.currentScheduleJson as unknown as ScheduleResult | null;
        // Skip schedules with no current JSON (shouldn't happen, but be safe)
        if (!currentJson || !currentJson.interventions) {
          return false;
        }
        return isFutureTrip(currentJson);
      })
    : schedules;

  if (shouldFilterPast && args.verbose) {
    const skipped = schedules.length - filteredSchedules.length;
    console.log(`Filtered out ${skipped} past trip(s)\n`);
  }

  console.log(`Processing ${filteredSchedules.length} schedule(s)\n`);

  if (filteredSchedules.length === 0) {
    console.log("No schedules to process.");
    await prisma.$disconnect();
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  for (const schedule of filteredSchedules) {
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
      const firstDay = newSchedule.interventions[0];
      const firstItem = firstDay?.items?.[0];

      if (!firstItem?.origin_time || !firstItem?.dest_time) {
        throw new Error("New schedule missing timezone enrichment fields");
      }

      if (args.verbose) {
        console.log(`\n  Direction: ${newSchedule.direction}`);
        console.log(`  Shift: ${newSchedule.total_shift_hours}h`);
        console.log(`  Days: ${newSchedule.interventions.length}`);
      }

      if (!args.dryRun) {
        // Build update data - always update currentScheduleJson
        const updateData: {
          currentScheduleJson: object;
          initialScheduleJson?: object;
        } = {
          currentScheduleJson: newSchedule as unknown as object,
        };

        // Only update initialScheduleJson if --reset-initial specified
        if (args.resetInitial) {
          updateData.initialScheduleJson = newSchedule as unknown as object;
        }

        await prisma.sharedSchedule.update({
          where: { id: schedule.id },
          data: updateData,
        });
      }

      console.log("✅");
      successCount++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.log(`❌ ${message}`);
      errorCount++;

      if (args.verbose && error instanceof Error && error.stack) {
        console.log(
          `  Stack: ${error.stack.split("\n").slice(1, 3).join("\n  ")}`
        );
      }
    }
  }

  console.log(`\n✨ Done! ${successCount} succeeded, ${errorCount} failed`);

  if (args.dryRun && successCount > 0) {
    console.log("\nRun without --dry-run to apply changes");
  }

  if (!args.resetInitial && successCount > 0 && !args.dryRun) {
    console.log(
      "Note: Only currentScheduleJson was updated. Use --reset-initial to also update initialScheduleJson"
    );
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
