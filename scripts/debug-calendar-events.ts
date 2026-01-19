#!/usr/bin/env npx tsx
import "dotenv/config";

/**
 * Debug calendar event creation for a trip.
 *
 * This script loads a trip's schedule from the database and shows what calendar
 * events WOULD be created, without actually calling the Google Calendar API.
 * Useful for verifying timezone handling and event grouping before sync.
 *
 * Usage:
 *   npx tsx scripts/debug-calendar-events.ts <trip-id>
 *   npx tsx scripts/debug-calendar-events.ts <trip-id> --verbose
 */

import { prisma } from "../src/lib/prisma";
import {
  groupInterventionsByAnchor,
  buildCalendarEvent,
  getEventDuration,
} from "../src/lib/google-calendar";
import type {
  ScheduleResponse,
  DaySchedule,
  PhaseType,
} from "../src/types/schedule";

// Parse CLI args
const args = process.argv.slice(2);
const tripId = args.find((a) => !a.startsWith("--"));
const verbose = args.includes("--verbose");

if (!tripId) {
  console.error(
    "Usage: npx tsx scripts/debug-calendar-events.ts <trip-id> [--verbose]"
  );
  console.error("\nOptions:");
  console.error("  --verbose  Show full event descriptions");
  process.exit(1);
}

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

async function main() {
  console.log(`\n🔍 Debugging calendar events for trip: ${tripId}\n`);

  // Fetch the trip
  const trip = await prisma.sharedSchedule.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      routeLabel: true,
      originTz: true,
      destTz: true,
      departureDatetime: true,
      arrivalDatetime: true,
      initialScheduleJson: true,
      currentScheduleJson: true,
    },
  });

  if (!trip) {
    console.error(`❌ Trip not found: ${tripId}`);
    process.exit(1);
  }

  // Get the schedule data
  const scheduleJson = trip.currentScheduleJson ?? trip.initialScheduleJson;
  if (!scheduleJson) {
    console.error("❌ No schedule data available for this trip");
    process.exit(1);
  }

  const schedule = scheduleJson as unknown as ScheduleResponse;

  // Print trip info
  console.log(`📋 Trip: ${trip.routeLabel || "Unnamed"}`);
  console.log(`   Origin: ${trip.originTz}`);
  console.log(`   Destination: ${trip.destTz}`);
  console.log(`   Departure: ${trip.departureDatetime}`);
  console.log(`   Arrival: ${trip.arrivalDatetime}`);
  console.log(`   Shift: ${schedule.total_shift_hours}h ${schedule.direction}`);
  console.log(`   Days: ${schedule.interventions.length}`);
  console.log("");

  // Process each day
  let totalEvents = 0;
  const daysByPhase = new Map<PhaseType, DaySchedule[]>();

  // Group days by phase
  for (const day of schedule.interventions) {
    const phase = day.phase_type || "adaptation";
    if (!daysByPhase.has(phase)) {
      daysByPhase.set(phase, []);
    }
    daysByPhase.get(phase)!.push(day);
  }

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
    const sortedTimes = Array.from(groups.keys()).sort();

    for (const time of sortedTimes) {
      const interventions = groups.get(time)!;

      try {
        // Build the calendar event (without creating it)
        const event = buildCalendarEvent(interventions);

        // Extract date and timezone from the event
        const timezone = event.start?.timeZone || "unknown";
        const eventDate = event.start?.dateTime?.split("T")[0] || "unknown";
        const anchor = interventions[0]; // First item is the anchor
        const duration = getEventDuration(anchor);

        // Show if date differs from day.date (important for cross-dateline flights)
        const dateNote = eventDate !== day.date ? ` [calendar: ${eventDate}]` : "";

        console.log("");
        console.log(
          `   ${time} ${timezone} (${formatDuration(duration)})${dateNote}`
        );
        console.log(`      ${event.summary}`);

        if (verbose && event.description) {
          // Show description indented
          const lines = event.description.split("\n");
          for (const line of lines) {
            console.log(`      ${line}`);
          }
        } else if (!verbose) {
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
        }
      }
    }

    console.log("");
  }

  // Summary
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n✅ Total events that would be created: ${totalEvents}`);
  console.log("");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
