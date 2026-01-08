"use client";

import { getDayLabel } from "@/lib/intervention-utils";
import { dayHasMultipleTimezones } from "@/lib/schedule-utils";
import {
  formatLongDate,
  getCurrentTimeInTimezone,
  getNowTimezone,
} from "@/lib/time-utils";
import { InterventionCard } from "./intervention-card";
import { FlightCard } from "./flight-card";
import { NowMarker } from "./now-marker";
import { TimezoneTransition } from "./timezone-transition";
import type { DaySchedule, Intervention } from "@/types/schedule";
import type { Airport } from "@/types/airport";

interface DaySectionProps {
  daySchedule: DaySchedule;
  origin: Airport;
  destination: Airport;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  isCurrentDay: boolean;
}

// Items with time (used during sorting)
type TimedItem =
  | { kind: "intervention"; time: string; data: Intervention; index: number; timezone?: string }
  | { kind: "departure"; time: string; timezone: string }
  | { kind: "arrival"; time: string; timezone: string }
  | { kind: "now"; time: string; timezone: string };

// All items including transitions (used during rendering)
type ScheduleItem =
  | TimedItem
  | { kind: "timezone_transition"; fromTz: string; toTz: string };

/**
 * Convert time string to sortable minutes.
 * Only treats sleep_target at 00:00-05:59 as "late night" for sorting.
 * Wake times in early morning should still sort first.
 */
function toSortableMinutes(time: string, type?: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes;
  // Only treat sleep_target at 00:00-05:59 as late night
  if (type === "sleep_target" && hours < 6) {
    return totalMinutes + 24 * 60;
  }
  return totalMinutes;
}

export function DaySection({
  daySchedule,
  origin,
  destination,
  departureDate,
  departureTime,
  arrivalDate,
  arrivalTime,
  isCurrentDay,
}: DaySectionProps) {
  // Build combined items array (TimedItem before transitions are inserted)
  const items: TimedItem[] = [];

  // Only show timezone on Flight Day (0) and Arrival day (1)
  const showTimezone = daySchedule.day === 0 || daySchedule.day === 1;

  // Add interventions
  daySchedule.items.forEach((intervention, index) => {
    // For in-transit items, show destination timezone to help traveler adjust
    let itemTimezone = intervention.timezone;
    if (itemTimezone?.toLowerCase().includes("transit")) {
      itemTimezone = destination.tz;
    }

    items.push({
      kind: "intervention",
      time: intervention.time,
      data: intervention,
      index,
      timezone: showTimezone ? itemTimezone : undefined,
    });
  });

  // Add flight events if on this day
  if (daySchedule.date === departureDate) {
    items.push({ kind: "departure", time: departureTime, timezone: origin.tz });
  }
  if (daySchedule.date === arrivalDate) {
    items.push({ kind: "arrival", time: arrivalTime, timezone: destination.tz });
  }

  // Add "now" marker if this is today, with phase-aware timezone
  if (isCurrentDay) {
    const nowTz = getNowTimezone(
      origin.tz,
      destination.tz,
      `${departureDate}T${departureTime}`,
      `${arrivalDate}T${arrivalTime}`
    );
    const nowTime = getCurrentTimeInTimezone(nowTz);
    items.push({ kind: "now", time: nowTime, timezone: nowTz });
  }

  // Sort items with timezone-aware logic
  // Flight events act as phase boundaries: departure ends pre-departure, arrival starts post-arrival
  items.sort((a, b) => {
    // Get timezone for each item
    const rawTzA = a.kind === "intervention" ? a.timezone : a.kind === "departure" ? origin.tz : a.kind === "arrival" ? destination.tz : a.kind === "now" ? a.timezone : daySchedule.timezone;
    const rawTzB = b.kind === "intervention" ? b.timezone : b.kind === "departure" ? origin.tz : b.kind === "arrival" ? destination.tz : b.kind === "now" ? b.timezone : daySchedule.timezone;
    // Normalize undefined to daySchedule.timezone for interventions without timezone
    const tzA = rawTzA ?? daySchedule.timezone;
    const tzB = rawTzB ?? daySchedule.timezone;

    // Flight events: departure comes before in-transit items
    if (a.kind === "departure" && b.kind === "intervention" && tzB !== origin.tz) {
      return -1; // Departure before in-transit interventions
    }
    if (b.kind === "departure" && a.kind === "intervention" && tzA !== origin.tz) {
      return 1; // Departure before in-transit interventions
    }

    // If items are in different timezones, preserve phase order
    // (from mergePhasesByDate: pre_departure → in_transit → post_arrival)
    if (tzA !== tzB) {
      return 0;
    }

    // In-transit interventions: sort by flight_offset_hours
    const aOffset =
      a.kind === "intervention" ? a.data.flight_offset_hours : undefined;
    const bOffset =
      b.kind === "intervention" ? b.data.flight_offset_hours : undefined;
    if (aOffset !== undefined && bOffset !== undefined) {
      return aOffset - bOffset;
    }

    // Same timezone: sort by time with late-night awareness
    const aType = a.kind === "intervention" ? a.data.type : undefined;
    const bType = b.kind === "intervention" ? b.data.type : undefined;
    const timeCompare = toSortableMinutes(a.time, aType) - toSortableMinutes(b.time, bType);
    if (timeCompare !== 0) {
      return timeCompare;
    }

    // Same time: flight events come before interventions
    const kindOrder = { departure: 0, arrival: 1, intervention: 2, now: 3 };
    return (kindOrder[a.kind] ?? 99) - (kindOrder[b.kind] ?? 99);
  });

  // Determine if this day has multiple timezones (for deciding whether to show tz on "now" marker)
  // Check interventions plus flight events
  const hasMultipleTimezones =
    dayHasMultipleTimezones(daySchedule.items) ||
    (daySchedule.date === departureDate && daySchedule.date === arrivalDate && origin.tz !== destination.tz);

  // Insert timezone transitions when timezone changes between consecutive items
  const itemsWithTransitions: ScheduleItem[] = [];
  let lastTimezone: string | undefined;

  for (const item of items) {
    // Get timezone for this item
    let itemTz: string | undefined;
    if (item.kind === "intervention") {
      itemTz = item.timezone;
    } else if (item.kind === "departure") {
      itemTz = item.timezone;
    } else if (item.kind === "arrival") {
      itemTz = item.timezone;
    } else if (item.kind === "now") {
      itemTz = item.timezone;
    }

    // Insert transition if timezone changed (and both are defined)
    if (lastTimezone && itemTz && lastTimezone !== itemTz) {
      itemsWithTransitions.push({
        kind: "timezone_transition",
        fromTz: lastTimezone,
        toTz: itemTz,
      });
    }

    itemsWithTransitions.push(item);

    // Update lastTimezone only for items that have one
    if (itemTz) {
      lastTimezone = itemTz;
    }
  }

  // Get day label styling based on day number
  const getDayLabelStyle = () => {
    if (daySchedule.day < 0) return "text-sky-600"; // Pre-departure
    if (daySchedule.day === 0) return "text-sky-700"; // Flight day
    if (daySchedule.day === 1) return "text-emerald-600"; // Arrival
    return "text-violet-600"; // Post-arrival adaptation
  };

  return (
    <section id={`day-${daySchedule.day}`} className="relative scroll-mt-15">
      {/* Sticky day header */}
      <div className="sticky top-0 z-20 pt-4 pb-3">
        <div className="overflow-hidden rounded-lg bg-white/90 backdrop-blur-sm border border-white/50 shadow-sm">
          {/* Decorative top gradient */}
          <div className="h-0.5 bg-gradient-to-r from-sky-400 via-indigo-400 to-violet-400" />

          {/* Header content */}
          <div className="flex items-baseline gap-3 px-4 py-2.5">
            <span
              className={`text-sm font-bold tracking-wide uppercase ${getDayLabelStyle()}`}
            >
              {getDayLabel(daySchedule.day, daySchedule.hasSameDayArrival)}
            </span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-600 font-medium">
              {formatLongDate(daySchedule.date)}
            </span>
          </div>
        </div>
      </div>

      {/* Timeline container */}
      <div className="relative pl-8 pb-8">
        {/* Vertical timeline line - gradient from amber to purple */}
        <div className="absolute left-[11px] top-0 bottom-0 w-0.5 bg-gradient-to-b from-amber-300 via-sky-300 to-violet-300 rounded-full" />

        {/* Items */}
        <div className="space-y-3">
          {itemsWithTransitions.map((item, idx) => {
            // Timezone transitions render without dot
            if (item.kind === "timezone_transition") {
              return (
                <TimezoneTransition
                  key={`tz-transition-${idx}`}
                  fromTz={item.fromTz}
                  toTz={item.toTz}
                />
              );
            }

            // Determine dot color based on item type
            const getDotStyle = () => {
              if (item.kind === "now") {
                return "bg-amber-500 ring-4 ring-amber-200 scale-125";
              }
              if (item.kind === "departure" || item.kind === "arrival") {
                return "bg-sky-500 ring-2 ring-sky-200";
              }
              return "bg-white border-2 border-slate-300";
            };

            const itemKey =
              item.kind === "intervention"
                ? `${item.kind}-${item.time}-${item.data.type}-${item.index}`
                : `${item.kind}-${item.time}`;

            return (
              <div key={itemKey} className="relative">
                {/* Timeline dot */}
                <div
                  className={`absolute -left-8 top-5 h-3 w-3 rounded-full transition-all duration-300 ${getDotStyle()}`}
                  style={{ transform: "translateX(5.5px)" }}
                />

                {/* Render card based on item type */}
                {item.kind === "intervention" && (
                  <InterventionCard
                    intervention={item.data}
                    timezone={item.timezone}
                  />
                )}
                {item.kind === "departure" && (
                  <FlightCard
                    type="departure"
                    time={item.time}
                    origin={origin}
                    destination={destination}
                    timezone={item.timezone}
                  />
                )}
                {item.kind === "arrival" && (
                  <FlightCard
                    type="arrival"
                    time={item.time}
                    origin={origin}
                    destination={destination}
                    timezone={item.timezone}
                  />
                )}
                {item.kind === "now" && (
                  <NowMarker
                    time={item.time}
                    timezone={hasMultipleTimezones ? item.timezone : undefined}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Empty day message */}
        {itemsWithTransitions.length === 0 && (
          <div className="relative py-6 text-center text-slate-400 text-sm">
            No scheduled interventions for this day
          </div>
        )}
      </div>
    </section>
  );
}
