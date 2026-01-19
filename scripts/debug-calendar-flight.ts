#!/usr/bin/env npx tsx

/**
 * Debug calendar event creation for a flight route.
 *
 * Takes flight parameters directly, calls the Python scheduler to generate
 * a schedule, then shows what calendar events WOULD be created.
 *
 * Usage:
 *   npx tsx scripts/debug-calendar-flight.ts --origin=SFO --dest=SIN \
 *     --depart="2026-01-22T09:45" --arrive="2026-01-23T19:00"
 *
 *   # With all options:
 *   npx tsx scripts/debug-calendar-flight.ts \
 *     --origin-tz=America/Los_Angeles \
 *     --dest-tz=Asia/Singapore \
 *     --depart="2026-01-22T09:45" \
 *     --arrive="2026-01-23T19:00" \
 *     --prep-days=3 \
 *     --wake=07:00 \
 *     --sleep=22:00 \
 *     --melatonin \
 *     --caffeine \
 *     --verbose
 *
 * Presets (realistic flights from test suite):
 *   npx tsx scripts/debug-calendar-flight.ts --preset=SQ31  # SFO → Singapore
 *   npx tsx scripts/debug-calendar-flight.ts --preset=VS20  # SFO → London
 *   npx tsx scripts/debug-calendar-flight.ts --preset=QF74  # SFO → Sydney (+2 day)
 *   npx tsx scripts/debug-calendar-flight.ts --preset=CX872 # Hong Kong → SFO (-1 day)
 */

import {
  groupInterventionsByTime,
  buildCalendarEvent,
} from "../src/lib/google-calendar";
import type {
  ScheduleResponse,
  DaySchedule,
  PhaseType,
} from "../src/types/schedule";

// Airport code to IANA timezone mapping (common airports)
const AIRPORT_TIMEZONES: Record<string, string> = {
  // US West
  SFO: "America/Los_Angeles",
  LAX: "America/Los_Angeles",
  SEA: "America/Los_Angeles",
  // US East
  JFK: "America/New_York",
  EWR: "America/New_York",
  BOS: "America/New_York",
  // US Mountain
  DEN: "America/Denver",
  // Hawaii
  HNL: "Pacific/Honolulu",
  // Europe
  LHR: "Europe/London",
  CDG: "Europe/Paris",
  FRA: "Europe/Berlin",
  AMS: "Europe/Amsterdam",
  // Middle East
  DXB: "Asia/Dubai",
  // Asia
  SIN: "Asia/Singapore",
  HKG: "Asia/Hong_Kong",
  NRT: "Asia/Tokyo",
  HND: "Asia/Tokyo",
  ICN: "Asia/Seoul",
  // Australia
  SYD: "Australia/Sydney",
  MEL: "Australia/Melbourne",
};

// Realistic flight presets from test suite
interface FlightPreset {
  name: string;
  originTz: string;
  destTz: string;
  departTime: string;
  arriveTime: string;
  arriveDayOffset: number;
  description: string;
}

const FLIGHT_PRESETS: Record<string, FlightPreset> = {
  // Minimal jet lag (3h)
  HA11: {
    name: "HA11 SFO-HNL",
    originTz: "America/Los_Angeles",
    destTz: "Pacific/Honolulu",
    departTime: "07:00",
    arriveTime: "09:35",
    arriveDayOffset: 0,
    description: "Hawaiian Airlines - Minimal jet lag (2h west)",
  },
  AA16: {
    name: "AA16 SFO-JFK",
    originTz: "America/Los_Angeles",
    destTz: "America/New_York",
    departTime: "11:00",
    arriveTime: "19:35",
    arriveDayOffset: 0,
    description: "American Airlines - Domestic transcontinental (3h east)",
  },

  // Moderate jet lag (8-9h) - Transatlantic
  VS20: {
    name: "VS20 SFO-LHR",
    originTz: "America/Los_Angeles",
    destTz: "Europe/London",
    departTime: "16:30",
    arriveTime: "10:40",
    arriveDayOffset: 1,
    description: "Virgin Atlantic - Overnight eastbound (+1 day)",
  },
  VS19: {
    name: "VS19 LHR-SFO",
    originTz: "Europe/London",
    destTz: "America/Los_Angeles",
    departTime: "11:40",
    arriveTime: "14:40",
    arriveDayOffset: 0,
    description: "Virgin Atlantic - Westbound return (same day)",
  },
  AF83: {
    name: "AF83 SFO-CDG",
    originTz: "America/Los_Angeles",
    destTz: "Europe/Paris",
    departTime: "15:40",
    arriveTime: "11:35",
    arriveDayOffset: 1,
    description: "Air France - Paris overnight (+1 day)",
  },
  LH455: {
    name: "LH455 SFO-FRA",
    originTz: "America/Los_Angeles",
    destTz: "Europe/Berlin",
    departTime: "14:40",
    arriveTime: "10:30",
    arriveDayOffset: 1,
    description: "Lufthansa - Frankfurt overnight (+1 day)",
  },

  // Severe jet lag (12-17h) - Cross-dateline
  EK226: {
    name: "EK226 SFO-DXB",
    originTz: "America/Los_Angeles",
    destTz: "Asia/Dubai",
    departTime: "15:40",
    arriveTime: "19:25",
    arriveDayOffset: 1,
    description: "Emirates - Dubai (12h shift)",
  },
  SQ31: {
    name: "SQ31 SFO-SIN",
    originTz: "America/Los_Angeles",
    destTz: "Asia/Singapore",
    departTime: "09:40",
    arriveTime: "19:05",
    arriveDayOffset: 1,
    description: "Singapore Airlines - Ultra-long-haul (16h→8h delay)",
  },
  SQ32: {
    name: "SQ32 SIN-SFO",
    originTz: "Asia/Singapore",
    destTz: "America/Los_Angeles",
    departTime: "09:15",
    arriveTime: "07:50",
    arriveDayOffset: 0,
    description: "Singapore Airlines - Westbound dateline (arrives earlier same day)",
  },
  CX879: {
    name: "CX879 SFO-HKG",
    originTz: "America/Los_Angeles",
    destTz: "Asia/Hong_Kong",
    departTime: "11:25",
    arriveTime: "19:00",
    arriveDayOffset: 1,
    description: "Cathay Pacific - Hong Kong (+1 day)",
  },
  CX872: {
    name: "CX872 HKG-SFO",
    originTz: "Asia/Hong_Kong",
    destTz: "America/Los_Angeles",
    departTime: "01:00",
    arriveTime: "21:15",
    arriveDayOffset: -1,
    description: "Cathay Pacific - ARRIVES PREVIOUS DAY (-1 day)",
  },
  JL1: {
    name: "JL1 SFO-HND",
    originTz: "America/Los_Angeles",
    destTz: "Asia/Tokyo",
    departTime: "12:55",
    arriveTime: "17:20",
    arriveDayOffset: 1,
    description: "Japan Airlines - Tokyo (+1 day)",
  },
  JL2: {
    name: "JL2 HND-SFO",
    originTz: "Asia/Tokyo",
    destTz: "America/Los_Angeles",
    departTime: "18:05",
    arriveTime: "10:15",
    arriveDayOffset: 0,
    description: "Japan Airlines - Westbound dateline (same day earlier)",
  },
  QF74: {
    name: "QF74 SFO-SYD",
    originTz: "America/Los_Angeles",
    destTz: "Australia/Sydney",
    departTime: "20:15",
    arriveTime: "06:10",
    arriveDayOffset: 2,
    description: "Qantas - Sydney ARRIVES +2 DAYS",
  },
  QF73: {
    name: "QF73 SYD-SFO",
    originTz: "Australia/Sydney",
    destTz: "America/Los_Angeles",
    departTime: "21:25",
    arriveTime: "15:55",
    arriveDayOffset: 0,
    description: "Qantas - Westbound dateline (same day)",
  },
};

/** Emoji for each phase type */
const PHASE_EMOJI: Record<PhaseType, string> = {
  preparation: "🏠",
  pre_departure: "🛫",
  in_transit: "✈️",
  in_transit_ulr: "✈️",
  post_arrival: "🛬",
  adaptation: "🌍",
};

/** Format duration in minutes to human readable */
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/** Parse CLI arguments */
function parseArgs(): {
  preset?: string;
  originTz?: string;
  destTz?: string;
  depart?: string;
  arrive?: string;
  prepDays: number;
  wakeTime: string;
  sleepTime: string;
  usesMelatonin: boolean;
  usesCaffeine: boolean;
  verbose: boolean;
  listPresets: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    preset: undefined as string | undefined,
    originTz: undefined as string | undefined,
    destTz: undefined as string | undefined,
    depart: undefined as string | undefined,
    arrive: undefined as string | undefined,
    prepDays: 3,
    wakeTime: "07:00",
    sleepTime: "22:00",
    usesMelatonin: true,
    usesCaffeine: true,
    verbose: false,
    listPresets: false,
  };

  for (const arg of args) {
    if (arg === "--verbose" || arg === "-v") {
      result.verbose = true;
    } else if (arg === "--melatonin") {
      result.usesMelatonin = true;
    } else if (arg === "--no-melatonin") {
      result.usesMelatonin = false;
    } else if (arg === "--caffeine") {
      result.usesCaffeine = true;
    } else if (arg === "--no-caffeine") {
      result.usesCaffeine = false;
    } else if (arg === "--list-presets" || arg === "--presets") {
      result.listPresets = true;
    } else if (arg.startsWith("--preset=")) {
      result.preset = arg.split("=")[1].toUpperCase();
    } else if (arg.startsWith("--origin=")) {
      const code = arg.split("=")[1].toUpperCase();
      result.originTz = AIRPORT_TIMEZONES[code] || code;
    } else if (arg.startsWith("--origin-tz=")) {
      result.originTz = arg.split("=")[1];
    } else if (arg.startsWith("--dest=")) {
      const code = arg.split("=")[1].toUpperCase();
      result.destTz = AIRPORT_TIMEZONES[code] || code;
    } else if (arg.startsWith("--dest-tz=")) {
      result.destTz = arg.split("=")[1];
    } else if (arg.startsWith("--depart=")) {
      result.depart = arg.split("=")[1];
    } else if (arg.startsWith("--arrive=")) {
      result.arrive = arg.split("=")[1];
    } else if (arg.startsWith("--prep-days=")) {
      result.prepDays = parseInt(arg.split("=")[1], 10);
    } else if (arg.startsWith("--wake=")) {
      result.wakeTime = arg.split("=")[1];
    } else if (arg.startsWith("--sleep=")) {
      result.sleepTime = arg.split("=")[1];
    }
  }

  return result;
}

/** Generate a schedule by calling the Python API */
async function generateSchedule(params: {
  originTz: string;
  destTz: string;
  departureDateTime: string;
  arrivalDateTime: string;
  prepDays: number;
  wakeTime: string;
  sleepTime: string;
  usesMelatonin: boolean;
  usesCaffeine: boolean;
}): Promise<ScheduleResponse> {
  // Call the schedule endpoint
  const apiUrl = "http://localhost:3000/api/schedule/generate";

  // API expects flat fields, not a legs array
  const body = {
    origin_tz: params.originTz,
    dest_tz: params.destTz,
    departure_datetime: params.departureDateTime,
    arrival_datetime: params.arrivalDateTime,
    prep_days: params.prepDays,
    wake_time: params.wakeTime,
    sleep_time: params.sleepTime,
    uses_melatonin: params.usesMelatonin,
    uses_caffeine: params.usesCaffeine,
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Schedule generation failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  // API wraps the schedule in a { id, schedule } object
  return data.schedule as ScheduleResponse;
}

/** Format a date for display */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Main function */
async function main() {
  const args = parseArgs();

  // List presets and exit
  if (args.listPresets) {
    console.log("\n📋 Available flight presets:\n");
    console.log("  Minimal Jet Lag (3h):");
    for (const [code, preset] of Object.entries(FLIGHT_PRESETS)) {
      if (preset.description.includes("Minimal") || preset.description.includes("Domestic")) {
        console.log(`    --preset=${code}  ${preset.name} - ${preset.description}`);
      }
    }
    console.log("\n  Moderate Jet Lag (8-9h):");
    for (const [code, preset] of Object.entries(FLIGHT_PRESETS)) {
      if (preset.description.includes("overnight") || preset.description.includes("Westbound return")) {
        console.log(`    --preset=${code}  ${preset.name} - ${preset.description}`);
      }
    }
    console.log("\n  Severe Jet Lag (12-17h):");
    for (const [code, preset] of Object.entries(FLIGHT_PRESETS)) {
      if (preset.description.includes("Dubai") || preset.description.includes("Singapore") ||
          preset.description.includes("Hong Kong") || preset.description.includes("Tokyo") ||
          preset.description.includes("Sydney") || preset.description.includes("dateline")) {
        console.log(`    --preset=${code}  ${preset.name} - ${preset.description}`);
      }
    }
    console.log("\n  Special Cases:");
    console.log("    --preset=CX872  CX872 HKG-SFO - Arrives PREVIOUS calendar day (-1)");
    console.log("    --preset=QF74   QF74 SFO-SYD - Arrives TWO days later (+2)");
    console.log("");
    process.exit(0);
  }

  // Resolve flight parameters
  let originTz: string;
  let destTz: string;
  let departureDateTime: string;
  let arrivalDateTime: string;
  let flightName: string;

  if (args.preset) {
    const preset = FLIGHT_PRESETS[args.preset];
    if (!preset) {
      console.error(`❌ Unknown preset: ${args.preset}`);
      console.error(`   Run with --list-presets to see available presets`);
      process.exit(1);
    }

    originTz = preset.originTz;
    destTz = preset.destTz;
    flightName = preset.name;

    // Calculate dates relative to today + 7 days
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + 7);
    const baseDateStr = baseDate.toISOString().split("T")[0];

    departureDateTime = `${baseDateStr}T${preset.departTime}`;

    // Calculate arrival date
    const arrivalDate = new Date(baseDate);
    arrivalDate.setDate(arrivalDate.getDate() + preset.arriveDayOffset);
    const arrivalDateStr = arrivalDate.toISOString().split("T")[0];
    arrivalDateTime = `${arrivalDateStr}T${preset.arriveTime}`;

    console.log(`\n✈️  Using preset: ${preset.name}`);
    console.log(`   ${preset.description}`);
  } else {
    // Use provided parameters
    if (!args.originTz || !args.destTz || !args.depart || !args.arrive) {
      console.error("Usage: npx tsx scripts/debug-calendar-flight.ts [options]");
      console.error("\nOptions:");
      console.error("  --preset=CODE      Use a flight preset (e.g., SQ31, VS20, QF74)");
      console.error("  --list-presets     List all available presets");
      console.error("  --origin=CODE      Origin airport code (e.g., SFO)");
      console.error("  --origin-tz=TZ     Origin IANA timezone");
      console.error("  --dest=CODE        Destination airport code");
      console.error("  --dest-tz=TZ       Destination IANA timezone");
      console.error("  --depart=DATETIME  Departure datetime (e.g., 2026-01-22T09:45)");
      console.error("  --arrive=DATETIME  Arrival datetime");
      console.error("  --prep-days=N      Preparation days (default: 3)");
      console.error("  --wake=HH:MM       Wake time (default: 07:00)");
      console.error("  --sleep=HH:MM      Sleep time (default: 22:00)");
      console.error("  --no-melatonin     Disable melatonin");
      console.error("  --no-caffeine      Disable caffeine");
      console.error("  --verbose          Show full event descriptions");
      console.error("\nExamples:");
      console.error("  npx tsx scripts/debug-calendar-flight.ts --preset=SQ31");
      console.error("  npx tsx scripts/debug-calendar-flight.ts --preset=QF74 --verbose");
      console.error('  npx tsx scripts/debug-calendar-flight.ts --origin=SFO --dest=SIN --depart="2026-01-22T09:45" --arrive="2026-01-23T19:00"');
      process.exit(1);
    }

    originTz = args.originTz;
    destTz = args.destTz;
    departureDateTime = args.depart;
    arrivalDateTime = args.arrive;
    flightName = `${originTz.split("/").pop()} → ${destTz.split("/").pop()}`;
  }

  console.log(`\n🔍 Generating schedule and calendar events...\n`);

  // Generate schedule
  let schedule: ScheduleResponse;
  try {
    schedule = await generateSchedule({
      originTz,
      destTz,
      departureDateTime,
      arrivalDateTime,
      prepDays: args.prepDays,
      wakeTime: args.wakeTime,
      sleepTime: args.sleepTime,
      usesMelatonin: args.usesMelatonin,
      usesCaffeine: args.usesCaffeine,
    });
  } catch (error) {
    console.error(`❌ Failed to generate schedule: ${error}`);
    console.error("\n   Make sure the dev server is running: bun dev");
    process.exit(1);
  }

  // Print flight info
  console.log(`📋 Flight: ${flightName}`);
  console.log(`   Origin: ${originTz}`);
  console.log(`   Destination: ${destTz}`);
  console.log(`   Departure: ${departureDateTime}`);
  console.log(`   Arrival: ${arrivalDateTime}`);
  console.log(`   Shift: ${schedule.total_shift_hours}h ${schedule.direction}`);
  console.log(`   Days: ${schedule.interventions.length}`);
  console.log("");

  // Process each day
  let totalEvents = 0;

  for (const day of schedule.interventions) {
    const phase = day.phase_type || "adaptation";
    const phaseEmoji = PHASE_EMOJI[phase] || "📅";

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`${phaseEmoji} Day ${day.day} (${day.date}) - ${phase}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Group interventions by time
    const groups = groupInterventionsByTime(day.items);

    if (groups.size === 0) {
      console.log("   (no actionable interventions)");
      console.log("");
      continue;
    }

    // Sort groups by time
    const sortedTimes = Array.from(groups.keys()).sort();

    for (const time of sortedTimes) {
      const interventions = groups.get(time)!;

      try {
        // Build the calendar event (without creating it)
        const event = buildCalendarEvent(interventions);

        // Extract date and timezone from the event
        const timezone = event.start?.timeZone || "unknown";
        const eventDateTime = event.start?.dateTime || "";
        const eventDate = eventDateTime.split("T")[0];
        const eventTime = eventDateTime.split("T")[1]?.substring(0, 5) || time;
        const duration = interventions[0].duration_min ?? 15;

        // Show if date differs from day.date (important for cross-dateline flights)
        const dateNote = eventDate !== day.date ? ` [calendar: ${eventDate}]` : "";

        // Check origin vs dest date for cross-dateline insight
        const anchor = interventions[0];
        const datesDiffer = anchor.origin_date !== anchor.dest_date;
        const crossDatelineNote = datesDiffer
          ? ` (origin: ${anchor.origin_date}, dest: ${anchor.dest_date})`
          : "";

        console.log("");
        console.log(
          `   ${eventTime} ${timezone} (${formatDuration(duration)})${dateNote}`
        );
        if (datesDiffer && args.verbose) {
          console.log(`      📅 Cross-dateline:${crossDatelineNote}`);
        }
        console.log(`      ${event.summary}`);

        if (args.verbose && event.description) {
          // Show description indented
          const lines = event.description.split("\n");
          for (const line of lines) {
            console.log(`      ${line}`);
          }
        } else if (!args.verbose) {
          // Show condensed intervention types
          const types = interventions.map((i) => i.type).join(", ");
          console.log(`      Types: ${types}`);
        }

        totalEvents++;
      } catch (error) {
        console.log("");
        console.log(`   ${time} ❌ ERROR`);
        console.log(
          `      ${error instanceof Error ? error.message : "Unknown error"}`
        );

        // Show interventions that failed
        for (const intervention of interventions) {
          console.log(
            `      - ${intervention.type}: origin_tz=${intervention.origin_tz}, dest_tz=${intervention.dest_tz}, phase=${intervention.phase_type}`
          );
          console.log(
            `        origin_date=${intervention.origin_date}, dest_date=${intervention.dest_date}`
          );
        }
      }
    }

    console.log("");
  }

  // Summary
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n✅ Total calendar events that would be created: ${totalEvents}`);

  // Highlight any cross-dateline date adjustments
  let crossDatelineCount = 0;
  for (const day of schedule.interventions) {
    for (const item of day.items) {
      if (item.origin_date !== item.dest_date) {
        crossDatelineCount++;
      }
    }
  }
  if (crossDatelineCount > 0) {
    console.log(`📅 ${crossDatelineCount} interventions have different origin/dest dates (cross-dateline)`);
  }
  console.log("");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
