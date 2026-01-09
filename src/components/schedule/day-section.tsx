"use client";

import { getDayLabel } from "@/lib/intervention-utils";
import {
  dayHasMultipleTimezones,
  groupWakeTargetInterventions,
  toSortableMinutes,
} from "@/lib/schedule-utils";
import {
  formatLongDate,
  getCurrentTimeInTimezone,
  getNowTimezone,
} from "@/lib/time-utils";
import { InterventionCard } from "./intervention-card";
import { FlightCard } from "./flight-card";
import { NowMarker } from "./now-marker";
import { TimezoneTransition } from "./timezone-transition";
import { WakeTargetCard } from "./wake-target-card";
import type {
  DaySchedule,
  Intervention,
  WakeTargetGroup,
} from "@/types/schedule";
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
  | {
      kind: "intervention";
      time: string;
      data: Intervention;
      index: number;
      timezone?: string;
    }
  | {
      kind: "wake_target_group";
      time: string;
      data: WakeTargetGroup;
      timezone?: string;
    }
  | { kind: "departure"; time: string; timezone: string }
  | { kind: "arrival"; time: string; timezone: string }
  | { kind: "now"; time: string; timezone: string };

// All items including transitions (used during rendering)
type ScheduleItem =
  | TimedItem
  | { kind: "timezone_transition"; fromTz: string; toTz: string };

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

  // Prepare interventions with timezone info for grouping
  const interventionsWithTimezone: Intervention[] = daySchedule.items.map(
    (intervention) => {
      // For in-transit items, show destination timezone to help traveler adjust
      let itemTimezone = intervention.timezone;
      if (intervention.is_in_transit) {
        itemTimezone = destination.tz;
      }
      return {
        ...intervention,
        timezone: showTimezone ? itemTimezone : undefined,
      };
    }
  );

  // Group wake_target interventions with same-time items
  const { groups, ungrouped } = groupWakeTargetInterventions(
    interventionsWithTimezone
  );

  // Add wake_target groups
  groups.forEach((group) => {
    items.push({
      kind: "wake_target_group",
      time: group.time,
      data: group,
      timezone: group.timezone,
    });
  });

  // Add ungrouped interventions
  ungrouped.forEach((intervention, index) => {
    items.push({
      kind: "intervention",
      time: intervention.time,
      data: intervention,
      index,
      timezone: intervention.timezone,
    });
  });

  // Add flight events if on this day
  if (daySchedule.date === departureDate) {
    items.push({ kind: "departure", time: departureTime, timezone: origin.tz });
  }
  if (daySchedule.date === arrivalDate) {
    items.push({
      kind: "arrival",
      time: arrivalTime,
      timezone: destination.tz,
    });
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
    // Helper to get timezone for an item
    const getItemTimezone = (item: TimedItem): string | undefined => {
      if (item.kind === "intervention" || item.kind === "wake_target_group") {
        return item.timezone;
      }
      if (item.kind === "departure") return origin.tz;
      if (item.kind === "arrival") return destination.tz;
      if (item.kind === "now") return item.timezone;
      return daySchedule.timezone;
    };

    const rawTzA = getItemTimezone(a);
    const rawTzB = getItemTimezone(b);
    // Normalize undefined to daySchedule.timezone for items without timezone
    const tzA = rawTzA ?? daySchedule.timezone;
    const tzB = rawTzB ?? daySchedule.timezone;

    // Flight events: departure comes before in-transit items
    const isInterventionLike = (kind: string) =>
      kind === "intervention" || kind === "wake_target_group";
    if (a.kind === "departure" && isInterventionLike(b.kind) && tzB !== origin.tz) {
      return -1; // Departure before in-transit interventions
    }
    if (b.kind === "departure" && isInterventionLike(a.kind) && tzA !== origin.tz) {
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
    // wake_target_group uses wake_target type for sorting
    const aType =
      a.kind === "intervention"
        ? a.data.type
        : a.kind === "wake_target_group"
          ? "wake_target"
          : undefined;
    const bType =
      b.kind === "intervention"
        ? b.data.type
        : b.kind === "wake_target_group"
          ? "wake_target"
          : undefined;
    const timeCompare =
      toSortableMinutes(a.time, aType) - toSortableMinutes(b.time, bType);
    if (timeCompare !== 0) {
      return timeCompare;
    }

    // Same time: flight events come before interventions
    const kindOrder = {
      departure: 0,
      arrival: 1,
      intervention: 2,
      wake_target_group: 2,
      now: 3,
    };
    return (kindOrder[a.kind] ?? 99) - (kindOrder[b.kind] ?? 99);
  });

  // Determine if this day has multiple timezones (for deciding whether to show tz on "now" marker)
  // Check interventions plus flight events
  const hasMultipleTimezones =
    dayHasMultipleTimezones(daySchedule.items) ||
    (daySchedule.date === departureDate &&
      daySchedule.date === arrivalDate &&
      origin.tz !== destination.tz);

  // Insert timezone transitions when timezone changes between consecutive items
  const itemsWithTransitions: ScheduleItem[] = [];
  let lastTimezone: string | undefined;

  for (const item of items) {
    // Get timezone for this item
    let itemTz: string | undefined;
    if (
      item.kind === "intervention" ||
      item.kind === "wake_target_group" ||
      item.kind === "departure" ||
      item.kind === "arrival" ||
      item.kind === "now"
    ) {
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
        <div className="overflow-hidden rounded-lg border border-white/50 bg-white/90 shadow-sm backdrop-blur-sm">
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
            <span className="font-medium text-slate-600">
              {formatLongDate(daySchedule.date)}
            </span>
          </div>
        </div>
      </div>

      {/* Timeline container */}
      <div className="relative pb-8 pl-8">
        {/* Vertical timeline line - gradient from amber to purple */}
        <div className="absolute top-0 bottom-0 left-[11px] w-0.5 rounded-full bg-gradient-to-b from-amber-300 via-sky-300 to-violet-300" />

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
                : item.kind === "wake_target_group"
                  ? `wake-group-${item.time}`
                  : `${item.kind}-${item.time}`;

            return (
              <div key={itemKey} className="relative">
                {/* Timeline dot */}
                <div
                  className={`absolute top-5 -left-8 h-3 w-3 rounded-full transition-all duration-300 ${getDotStyle()}`}
                  style={{ transform: "translateX(5.5px)" }}
                />

                {/* Render card based on item type */}
                {item.kind === "intervention" && (
                  <InterventionCard
                    intervention={item.data}
                    timezone={item.timezone}
                  />
                )}
                {item.kind === "wake_target_group" && (
                  <WakeTargetCard group={item.data} timezone={item.timezone} />
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
          <div className="relative py-6 text-center text-sm text-slate-400">
            No scheduled interventions for this day
          </div>
        )}
      </div>
    </section>
  );
}
