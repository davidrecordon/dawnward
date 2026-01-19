#!/usr/bin/env npx tsx
import "dotenv/config";

/**
 * Calendar Debug & Sync Script
 *
 * Preview and sync calendar events for trips. Supports three modes:
 *   1. Load from database by trip ID
 *   2. Generate fresh from flight presets
 *   3. Generate from custom flight parameters
 *
 * Usage:
 *   # Preview events (dry-run, default)
 *   npx tsx scripts/debug-calendar.ts <trip-id>
 *   npx tsx scripts/debug-calendar.ts --preset=SQ31
 *
 *   # Actually sync to Google Calendar
 *   npx tsx scripts/debug-calendar.ts <trip-id> --sync
 *   npx tsx scripts/debug-calendar.ts <trip-id> --resync  # delete + create
 *   npx tsx scripts/debug-calendar.ts <trip-id> --delete  # delete only
 *
 *   # List available presets
 *   npx tsx scripts/debug-calendar.ts --list-presets
 *
 *   # Custom flight parameters
 *   npx tsx scripts/debug-calendar.ts --origin=SFO --dest=SIN \
 *     --depart="2026-01-22T09:45" --arrive="2026-01-23T19:00"
 *
 *   # Additional options
 *   --verbose, -v      Show full event descriptions
 *   --prep-days=N      Preparation days (default: 3)
 *   --wake=HH:MM       Wake time (default: 07:00)
 *   --sleep=HH:MM      Sleep time (default: 22:00)
 *   --no-melatonin     Disable melatonin
 *   --no-caffeine      Disable caffeine
 */

import { prisma } from "../src/lib/prisma";
import {
  groupInterventionsByAnchor,
  buildCalendarEvent,
  createCalendarEvent,
  deleteCalendarEvents,
} from "../src/lib/google-calendar";
import type { ScheduleResponse, PhaseType } from "../src/types/schedule";

// =============================================================================
// Airport & Flight Presets
// =============================================================================

/** Airport code to IANA timezone mapping (common airports) */
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
    description:
      "Singapore Airlines - Westbound dateline (arrives earlier same day)",
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

// =============================================================================
// Display Helpers
// =============================================================================

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

// =============================================================================
// CLI Argument Parsing
// =============================================================================

interface ParsedArgs {
  tripId?: string;
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
  // Sync options
  sync: boolean;
  resync: boolean;
  deleteOnly: boolean;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const result: ParsedArgs = {
    tripId: undefined,
    preset: undefined,
    originTz: undefined,
    destTz: undefined,
    depart: undefined,
    arrive: undefined,
    prepDays: 3,
    wakeTime: "07:00",
    sleepTime: "22:00",
    usesMelatonin: true,
    usesCaffeine: true,
    verbose: false,
    listPresets: false,
    sync: false,
    resync: false,
    deleteOnly: false,
  };

  for (const arg of args) {
    if (arg === "--verbose" || arg === "-v") {
      result.verbose = true;
    } else if (arg === "--sync") {
      result.sync = true;
    } else if (arg === "--resync") {
      result.resync = true;
    } else if (arg === "--delete") {
      result.deleteOnly = true;
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
    } else if (!arg.startsWith("--")) {
      // Positional argument = trip ID
      result.tripId = arg;
    }
  }

  return result;
}

function printUsage() {
  console.error("Usage:");
  console.error("  npx tsx scripts/debug-calendar.ts <trip-id> [options]");
  console.error("  npx tsx scripts/debug-calendar.ts --preset=CODE [options]");
  console.error(
    "  npx tsx scripts/debug-calendar.ts --origin=SFO --dest=SIN --depart=... --arrive=..."
  );
  console.error("");
  console.error("Schedule Source:");
  console.error("  <trip-id>          Load trip from database by ID");
  console.error(
    "  --preset=CODE      Use a flight preset (e.g., SQ31, VS20, QF74)"
  );
  console.error("  --list-presets     List all available presets");
  console.error("  --origin=CODE      Origin airport code (e.g., SFO)");
  console.error("  --dest=CODE        Destination airport code");
  console.error(
    "  --depart=DATETIME  Departure datetime (e.g., 2026-01-22T09:45)"
  );
  console.error("  --arrive=DATETIME  Arrival datetime");
  console.error("");
  console.error("Sync Options (requires trip-id):");
  console.error("  --sync             Create events in Google Calendar");
  console.error("  --resync           Delete existing + create new events");
  console.error("  --delete           Delete existing events only");
  console.error("");
  console.error("Schedule Options:");
  console.error("  --prep-days=N      Preparation days (default: 3)");
  console.error("  --wake=HH:MM       Wake time (default: 07:00)");
  console.error("  --sleep=HH:MM      Sleep time (default: 22:00)");
  console.error("  --no-melatonin     Disable melatonin");
  console.error("  --no-caffeine      Disable caffeine");
  console.error("  --verbose, -v      Show full event descriptions");
  console.error("");
  console.error("Examples:");
  console.error(
    "  npx tsx scripts/debug-calendar.ts cmk95fhzn000104jssj2wfm3g"
  );
  console.error(
    "  npx tsx scripts/debug-calendar.ts cmk95fhzn000104jssj2wfm3g --sync"
  );
  console.error("  npx tsx scripts/debug-calendar.ts --preset=SQ31");
  console.error("  npx tsx scripts/debug-calendar.ts --preset=QF74 --verbose");
}

function printPresets() {
  console.log("\n📋 Available flight presets:\n");
  console.log("  Minimal Jet Lag (3h):");
  for (const [code, preset] of Object.entries(FLIGHT_PRESETS)) {
    if (
      preset.description.includes("Minimal") ||
      preset.description.includes("Domestic")
    ) {
      console.log(
        `    --preset=${code}  ${preset.name} - ${preset.description}`
      );
    }
  }
  console.log("\n  Moderate Jet Lag (8-9h):");
  for (const [code, preset] of Object.entries(FLIGHT_PRESETS)) {
    if (
      preset.description.includes("overnight") ||
      preset.description.includes("Westbound return")
    ) {
      console.log(
        `    --preset=${code}  ${preset.name} - ${preset.description}`
      );
    }
  }
  console.log("\n  Severe Jet Lag (12-17h):");
  for (const [code, preset] of Object.entries(FLIGHT_PRESETS)) {
    if (
      preset.description.includes("Dubai") ||
      preset.description.includes("Singapore") ||
      preset.description.includes("Hong Kong") ||
      preset.description.includes("Tokyo") ||
      preset.description.includes("Sydney") ||
      preset.description.includes("dateline")
    ) {
      console.log(
        `    --preset=${code}  ${preset.name} - ${preset.description}`
      );
    }
  }
  console.log("\n  Special Cases:");
  console.log(
    "    --preset=CX872  CX872 HKG-SFO - Arrives PREVIOUS calendar day (-1)"
  );
  console.log("    --preset=QF74   QF74 SFO-SYD - Arrives TWO days later (+2)");
  console.log("");
}

// =============================================================================
// Schedule Loading
// =============================================================================

interface TripData {
  tripId: string;
  userId: string | null;
  schedule: ScheduleResponse;
  label: string;
  originTz: string;
  destTz: string;
  departure: string;
  arrival: string;
  existingSyncId: string | null;
  existingEventIds: string[];
}

/** Load schedule from database by trip ID */
async function loadFromDatabase(tripId: string): Promise<TripData> {
  const trip = await prisma.sharedSchedule.findUnique({
    where: { id: tripId },
    include: {
      calendarSyncs: true,
    },
  });

  if (!trip) {
    throw new Error(`Trip not found: ${tripId}`);
  }

  const scheduleJson = trip.currentScheduleJson ?? trip.initialScheduleJson;
  if (!scheduleJson) {
    throw new Error("No schedule data available for this trip");
  }

  // Format dates (Prisma returns Date objects)
  const depDate = trip.departureDatetime as unknown;
  const arrDate = trip.arrivalDatetime as unknown;
  const departure =
    depDate instanceof Date
      ? depDate.toISOString()
      : String(trip.departureDatetime);
  const arrival =
    arrDate instanceof Date
      ? arrDate.toISOString()
      : String(trip.arrivalDatetime);

  const existingSync = trip.calendarSyncs[0];

  return {
    tripId: trip.id,
    userId: trip.userId,
    schedule: scheduleJson as unknown as ScheduleResponse,
    label: trip.routeLabel || "Unnamed",
    originTz: trip.originTz,
    destTz: trip.destTz,
    departure,
    arrival,
    existingSyncId: existingSync?.id ?? null,
    existingEventIds: (existingSync?.googleEventIds as string[]) ?? [],
  };
}

// =============================================================================
// Google Calendar Sync
// =============================================================================

/** Get Google access token for a user from the Account table */
async function getAccessToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "google",
    },
  });

  if (!account) {
    throw new Error(`No Google account found for user: ${userId}`);
  }

  if (!account.access_token) {
    throw new Error(
      "Google account has no access token. User may need to re-authenticate."
    );
  }

  // Check if token might be expired
  if (account.expires_at) {
    const expiresAt = new Date(account.expires_at * 1000);
    if (expiresAt < new Date()) {
      console.warn(
        `⚠️  Access token may be expired (expired: ${expiresAt.toISOString()})`
      );
      console.warn(
        "   If sync fails, user needs to sign out and back in to refresh token."
      );
    }
  }

  // Check if token has calendar scope
  if (account.scope && !account.scope.includes("calendar")) {
    throw new Error(
      "Google account does not have calendar scope. User needs to grant calendar permission."
    );
  }

  return account.access_token;
}

/** Delete existing calendar events */
async function deleteExistingEvents(
  accessToken: string,
  eventIds: string[]
): Promise<{ deleted: number; failed: number }> {
  if (eventIds.length === 0) {
    console.log("📭 No existing events to delete");
    return { deleted: 0, failed: 0 };
  }

  console.log(`\n🗑️  Deleting ${eventIds.length} existing events...`);

  const result = await deleteCalendarEvents(accessToken, eventIds);

  console.log(`   ✅ Deleted: ${result.deleted.length}`);
  if (result.failed.length > 0) {
    console.log(`   ❌ Failed: ${result.failed.length}`);
    for (const id of result.failed) {
      console.log(`      - ${id}`);
    }
  }

  return { deleted: result.deleted.length, failed: result.failed.length };
}

/** Create calendar events from schedule */
async function createEvents(
  accessToken: string,
  schedule: ScheduleResponse,
  verbose: boolean
): Promise<{ created: string[]; failed: number }> {
  console.log("\n📤 Creating calendar events...\n");

  const created: string[] = [];
  let failed = 0;

  for (const day of schedule.interventions) {
    console.log(`📅 Day ${day.day} (${day.date})`);

    const groups = groupInterventionsByAnchor(day.items);

    for (const [, interventions] of groups) {
      try {
        const event = buildCalendarEvent(interventions);
        const startTime =
          event.start?.dateTime?.split("T")[1]?.substring(0, 5) || "??:??";

        process.stdout.write(`   ${startTime} ${event.summary}... `);

        const eventId = await createCalendarEvent(accessToken, event);
        created.push(eventId);

        console.log(`✅ ${eventId}`);

        if (verbose) {
          console.log(
            `      Types: ${interventions.map((i) => i.type).join(", ")}`
          );
        }
      } catch (error) {
        failed++;
        console.log(`❌`);
        console.log(
          `      Error: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    console.log("");
  }

  return { created, failed };
}

/** Update or create sync record in database */
async function updateSyncRecord(
  tripId: string,
  userId: string,
  existingSyncId: string | null,
  eventIds: string[]
) {
  if (existingSyncId) {
    await prisma.calendarSync.update({
      where: { id: existingSyncId },
      data: {
        googleEventIds: eventIds,
        lastSyncedAt: new Date(),
      },
    });
    console.log(`📝 Updated sync record: ${existingSyncId}`);
  } else {
    const sync = await prisma.calendarSync.create({
      data: {
        tripId,
        userId,
        googleEventIds: eventIds,
        lastSyncedAt: new Date(),
      },
    });
    console.log(`📝 Created sync record: ${sync.id}`);
  }
}

/** Delete sync record from database */
async function deleteSyncRecord(syncId: string) {
  await prisma.calendarSync.delete({
    where: { id: syncId },
  });
  console.log(`📝 Deleted sync record: ${syncId}`);
}

/** Generate schedule by calling the API */
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
  const apiUrl = "http://localhost:3000/api/schedule/generate";

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
  return data.schedule as ScheduleResponse;
}

// =============================================================================
// Display Logic
// =============================================================================

function displaySchedule(
  schedule: ScheduleResponse,
  label: string,
  originTz: string,
  destTz: string,
  departure: string,
  arrival: string,
  verbose: boolean
) {
  // Print trip/flight info
  console.log(`📋 Trip: ${label}`);
  console.log(`   Origin: ${originTz}`);
  console.log(`   Destination: ${destTz}`);
  console.log(`   Departure: ${departure}`);
  console.log(`   Arrival: ${arrival}`);
  console.log(`   Shift: ${schedule.total_shift_hours}h ${schedule.direction}`);
  console.log(`   Days: ${schedule.interventions.length}`);
  console.log("");

  let totalEvents = 0;
  let crossDatelineCount = 0;

  // Process each day
  for (const day of schedule.interventions) {
    const phase = day.phase_type || "adaptation";
    const phaseEmoji = PHASE_EMOJI[phase] || "📅";

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`${phaseEmoji} Day ${day.day} (${day.date}) - ${phase}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Group interventions by anchor (event density optimization)
    const groups = groupInterventionsByAnchor(day.items);

    if (groups.size === 0) {
      console.log("   (no actionable interventions)");
      console.log("");
      continue;
    }

    // Sort groups by time
    const sortedKeys = Array.from(groups.keys()).sort();

    for (const key of sortedKeys) {
      const interventions = groups.get(key)!;

      try {
        // Build the calendar event (without creating it)
        const event = buildCalendarEvent(interventions);

        // Extract date and timezone from the event
        const timezone = event.start?.timeZone || "unknown";
        const eventDateTime = event.start?.dateTime || "";
        const eventDate = eventDateTime.split("T")[0];
        const eventTime =
          eventDateTime.split("T")[1]?.substring(0, 5) || "??:??";
        const anchor = interventions[0];

        // Calculate duration from event start/end (accounts for grouped max duration)
        const startMs = new Date(event.start?.dateTime || "").getTime();
        const endMs = new Date(event.end?.dateTime || "").getTime();
        const duration = Math.round((endMs - startMs) / 60000);

        // Show if date differs from day.date (important for cross-dateline flights)
        const dateNote =
          eventDate !== day.date ? ` [calendar: ${eventDate}]` : "";

        // Track cross-dateline interventions
        const datesDiffer = anchor.origin_date !== anchor.dest_date;
        if (datesDiffer) crossDatelineCount++;

        console.log("");
        console.log(
          `   ${eventTime} ${timezone} (${formatDuration(duration)})${dateNote}`
        );

        if (datesDiffer && verbose) {
          console.log(
            `      📅 Cross-dateline: origin=${anchor.origin_date}, dest=${anchor.dest_date}`
          );
        }

        console.log(`      ${event.summary}`);

        if (verbose && event.description) {
          const lines = event.description.split("\n");
          for (const line of lines) {
            console.log(`      ${line}`);
          }
        } else if (!verbose) {
          const types = interventions.map((i) => i.type).join(", ");
          console.log(`      Types: ${types}`);
        }

        totalEvents++;
      } catch (error) {
        console.log("");
        console.log(`   ❌ ERROR building event`);
        console.log(
          `      ${error instanceof Error ? error.message : "Unknown error"}`
        );

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
  console.log(
    `\n✅ Total calendar events that would be created: ${totalEvents}`
  );
  if (crossDatelineCount > 0) {
    console.log(
      `📅 ${crossDatelineCount} interventions have different origin/dest dates (cross-dateline)`
    );
  }
  console.log("");
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = parseArgs();

  // List presets and exit
  if (args.listPresets) {
    printPresets();
    process.exit(0);
  }

  // Check if sync is requested but no tripId provided
  const wantsSync = args.sync || args.resync || args.deleteOnly;
  if (wantsSync && !args.tripId) {
    console.error("❌ Sync options require a trip ID from the database");
    console.error("   Presets and custom flights cannot be synced (no owner)");
    process.exit(1);
  }

  let schedule: ScheduleResponse;
  let label: string;
  let originTz: string;
  let destTz: string;
  let departure: string;
  let arrival: string;
  let tripData: TripData | null = null;

  // Mode 1: Load from database by trip ID
  if (args.tripId) {
    console.log(`\n🔍 Loading trip from database: ${args.tripId}\n`);
    try {
      tripData = await loadFromDatabase(args.tripId);
      schedule = tripData.schedule;
      label = tripData.label;
      originTz = tripData.originTz;
      destTz = tripData.destTz;
      departure = tripData.departure;
      arrival = tripData.arrival;

      if (wantsSync) {
        console.log(`   User: ${tripData.userId ?? "(anonymous)"}`);
        console.log(`   Existing sync: ${tripData.existingSyncId ?? "none"}`);
        console.log(`   Existing events: ${tripData.existingEventIds.length}`);
      }
    } catch (error) {
      console.error(
        `❌ ${error instanceof Error ? error.message : "Unknown error"}`
      );
      process.exit(1);
    }
  }
  // Mode 2: Use preset
  else if (args.preset) {
    const preset = FLIGHT_PRESETS[args.preset];
    if (!preset) {
      console.error(`❌ Unknown preset: ${args.preset}`);
      console.error(`   Run with --list-presets to see available presets`);
      process.exit(1);
    }

    console.log(`\n✈️  Using preset: ${preset.name}`);
    console.log(`   ${preset.description}\n`);

    originTz = preset.originTz;
    destTz = preset.destTz;
    label = preset.name;

    // Calculate dates relative to today + 7 days
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + 7);
    const baseDateStr = baseDate.toISOString().split("T")[0];

    departure = `${baseDateStr}T${preset.departTime}`;

    const arrivalDate = new Date(baseDate);
    arrivalDate.setDate(arrivalDate.getDate() + preset.arriveDayOffset);
    const arrivalDateStr = arrivalDate.toISOString().split("T")[0];
    arrival = `${arrivalDateStr}T${preset.arriveTime}`;

    console.log(`🔍 Generating schedule...\n`);
    try {
      schedule = await generateSchedule({
        originTz,
        destTz,
        departureDateTime: departure,
        arrivalDateTime: arrival,
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
  }
  // Mode 3: Custom flight parameters
  else if (args.originTz && args.destTz && args.depart && args.arrive) {
    originTz = args.originTz;
    destTz = args.destTz;
    departure = args.depart;
    arrival = args.arrive;
    label = `${originTz.split("/").pop()} → ${destTz.split("/").pop()}`;

    console.log(`\n🔍 Generating schedule for custom flight...\n`);
    try {
      schedule = await generateSchedule({
        originTz,
        destTz,
        departureDateTime: departure,
        arrivalDateTime: arrival,
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
  }
  // No valid mode
  else {
    printUsage();
    process.exit(1);
  }

  // If not syncing, just display the schedule
  if (!wantsSync) {
    displaySchedule(
      schedule,
      label,
      originTz,
      destTz,
      departure,
      arrival,
      args.verbose
    );
    await prisma.$disconnect();
    return;
  }

  // === Sync Mode ===
  // tripData is guaranteed to exist here due to earlier check
  if (!tripData || !tripData.userId) {
    console.error("❌ Trip has no owner (anonymous trip). Cannot sync.");
    process.exit(1);
  }

  console.log(`\n🗓️  Calendar Sync Mode\n`);
  console.log(`Trip: ${label}`);
  console.log(
    `Mode: ${args.deleteOnly ? "DELETE" : args.resync ? "RESYNC" : "CREATE"}`
  );

  // Get access token
  console.log("\n🔑 Getting access token...");
  let accessToken: string;
  try {
    accessToken = await getAccessToken(tripData.userId);
    console.log("   ✅ Access token retrieved");
  } catch (error) {
    console.error(
      `❌ ${error instanceof Error ? error.message : "Unknown error"}`
    );
    process.exit(1);
  }

  // Delete only mode
  if (args.deleteOnly) {
    const result = await deleteExistingEvents(
      accessToken,
      tripData.existingEventIds
    );

    if (tripData.existingSyncId && result.deleted > 0) {
      await deleteSyncRecord(tripData.existingSyncId);
    }

    console.log("\n🏁 Delete complete.\n");
    await prisma.$disconnect();
    return;
  }

  // Resync mode - delete first
  if (args.resync && tripData.existingEventIds.length > 0) {
    const deleteResult = await deleteExistingEvents(
      accessToken,
      tripData.existingEventIds
    );

    if (deleteResult.failed > 0) {
      console.error(
        "\n❌ Some events failed to delete. Aborting to prevent duplicates."
      );
      process.exit(1);
    }
  }

  // Create events
  const createResult = await createEvents(accessToken, schedule, args.verbose);

  // Update sync record
  if (createResult.created.length > 0) {
    await updateSyncRecord(
      tripData.tripId,
      tripData.userId,
      tripData.existingSyncId,
      createResult.created
    );
  }

  // Summary
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`\n✅ Sync complete!`);
  console.log(`   Created: ${createResult.created.length} events`);
  if (createResult.failed > 0) {
    console.log(`   Failed: ${createResult.failed} events`);
  }
  console.log("");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
