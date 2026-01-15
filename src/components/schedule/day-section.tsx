"use client";

import { useMemo } from "react";
import {
  getDayLabel,
  isEditableIntervention,
  FLIGHT_DAY,
  ARRIVAL_DAY,
} from "@/lib/intervention-utils";
import {
  dayHasMultipleTimezones,
  groupTimedItems,
  toSortableMinutes,
  type GroupableItem,
} from "@/lib/schedule-utils";
import {
  formatLongDate,
  getCurrentTimeInTimezone,
  getNowTimezone,
} from "@/lib/time-utils";
import { InterventionCard } from "./intervention-card";
import { InFlightSleepCard } from "./inflight-sleep-card";
import { FlightCard } from "./flight-card";
import { GroupedItemCard } from "./grouped-item-card";
import { NowMarker } from "./now-marker";
import { TimezoneTransition } from "./timezone-transition";
import { calculateFlightDuration } from "@/lib/timezone-utils";
import { getActualKey } from "@/lib/actuals-utils";
import type {
  DaySchedule,
  Intervention,
  TimedItemGroup,
  ActualsMap,
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
  /** Recorded actuals map for displaying inline changes */
  actuals?: ActualsMap;
  /** Optional callback when an intervention card is clicked (for recording actuals) */
  onInterventionClick?: (
    intervention: Intervention,
    dayOffset: number,
    date: string,
    nestedChildren?: Intervention[]
  ) => void;
}

/** Items with time (used during sorting) */
type TimedItem =
  | {
      kind: "intervention";
      time: string;
      data: Intervention;
      index: number;
      timezone?: string;
    }
  | {
      kind: "timed_item_group";
      time: string;
      data: TimedItemGroup;
      timezone?: string;
    }
  | { kind: "departure"; time: string; timezone: string }
  | { kind: "arrival"; time: string; timezone: string }
  | { kind: "now"; time: string; timezone: string };

/** All items including transitions (used during rendering) */
type ScheduleItem =
  | TimedItem
  | { kind: "timezone_transition"; fromTz: string; toTz: string };

/** Check if an item kind can have interventions (for sorting logic) */
function isInterventionLike(kind: TimedItem["kind"]): boolean {
  return kind === "intervention" || kind === "timed_item_group";
}

/**
 * Determines if a nap_window intervention is an in-flight sleep opportunity.
 * In-flight sleep windows have a numeric flight_offset_hours from the Python scheduler.
 * Ground-based naps have null/undefined flight_offset_hours.
 */
function isInFlightSleep(intervention: Intervention): boolean {
  return (
    intervention.type === "nap_window" &&
    intervention.flight_offset_hours != null
  );
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
  actuals,
  onInterventionClick,
}: DaySectionProps) {
  // Only show timezone on Flight Day and Arrival day
  const showTimezone =
    daySchedule.day === FLIGHT_DAY || daySchedule.day === ARRIVAL_DAY;

  // Calculate flight duration for in-flight sleep card progress bar
  const flightDuration = calculateFlightDuration(
    `${departureDate}T${departureTime}`,
    `${arrivalDate}T${arrivalTime}`,
    origin.tz,
    destination.tz
  );
  const totalFlightHours = flightDuration
    ? flightDuration.hours + flightDuration.minutes / 60
    : undefined;

  // Flight context for in-transit cards to show dual timezones
  const flightContext = showTimezone
    ? {
        originTimezone: origin.tz,
        destTimezone: destination.tz,
        departureDateTime: `${departureDate}T${departureTime}`,
        totalFlightHours,
      }
    : undefined;

  // Memoize expensive item construction, sorting, and transition logic
  const { itemsWithTransitions, hasMultipleTimezones } = useMemo(() => {
    // Build combined items array (TimedItem before transitions are inserted)
    const items: TimedItem[] = [];

    // Build pre-grouping items array with all interventions, flights, and now marker
    const preGroupItems: GroupableItem[] = [];

    // Add all interventions
    // Note: is_in_transit is set at the DaySchedule level by Python scheduler,
    // so we propagate it to each intervention for dual timezone display logic
    const isInTransitDay = daySchedule.is_in_transit ?? false;
    daySchedule.items.forEach((intervention) => {
      // For in-transit items, show destination timezone to help traveler adjust
      let itemTimezone = intervention.timezone;
      if (isInTransitDay || intervention.is_in_transit) {
        itemTimezone = destination.tz;
      }
      preGroupItems.push({
        kind: "intervention",
        time: intervention.time,
        data: {
          ...intervention,
          is_in_transit: isInTransitDay || intervention.is_in_transit,
          timezone: showTimezone ? itemTimezone : undefined,
        },
        timezone: showTimezone ? itemTimezone : undefined,
      });
    });

    // Add flight events if on this day
    if (daySchedule.date === departureDate) {
      preGroupItems.push({
        kind: "departure",
        time: departureTime,
        timezone: origin.tz,
      });
    }
    if (daySchedule.date === arrivalDate) {
      preGroupItems.push({
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
      preGroupItems.push({ kind: "now", time: nowTime, timezone: nowTz });
    }

    // Group items by parent (wake_target or arrival) with same-effective-time children
    // Pass actuals so grouping considers modified times (children with different actual times unnest)
    const { groups, ungrouped } = groupTimedItems(
      preGroupItems,
      actuals,
      daySchedule.day
    );

    // Add groups as timed_item_group
    groups.forEach((group) => {
      items.push({
        kind: "timed_item_group",
        time: group.time,
        data: group,
        timezone: group.timezone,
      });
    });

    // Add ungrouped items
    ungrouped.forEach((item, index) => {
      if (item.kind === "intervention") {
        items.push({
          kind: "intervention",
          time: item.time,
          data: item.data,
          index,
          timezone: item.timezone,
        });
      } else if (item.kind === "departure") {
        items.push({
          kind: "departure",
          time: item.time,
          timezone: item.timezone,
        });
      } else if (item.kind === "arrival") {
        items.push({
          kind: "arrival",
          time: item.time,
          timezone: item.timezone,
        });
      } else if (item.kind === "now") {
        items.push({ kind: "now", time: item.time, timezone: item.timezone });
      }
    });

    // Sort items with timezone-aware logic
    // Flight events act as phase boundaries: departure ends pre-departure, arrival starts post-arrival
    items.sort((a, b) => {
      // Get timezone for an item (defaults to daySchedule.timezone)
      const tzA = a.timezone ?? daySchedule.timezone;
      const tzB = b.timezone ?? daySchedule.timezone;

      // Departure comes before in-transit interventions
      if (
        a.kind === "departure" &&
        isInterventionLike(b.kind) &&
        tzB !== origin.tz
      ) {
        return -1;
      }
      if (
        b.kind === "departure" &&
        isInterventionLike(a.kind) &&
        tzA !== origin.tz
      ) {
        return 1;
      }

      // Different timezones: preserve phase order (pre_departure → in_transit → post_arrival)
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

      // Get intervention type for late-night sort handling
      const getTypeForSort = (item: TimedItem): string | undefined => {
        if (item.kind === "intervention") return item.data.type;
        if (item.kind === "timed_item_group") {
          const { parent } = item.data;
          return parent.kind === "intervention" ? parent.data.type : "arrival";
        }
        return undefined;
      };

      // Same timezone: sort by time with late-night awareness
      const timeCompare =
        toSortableMinutes(a.time, getTypeForSort(a)) -
        toSortableMinutes(b.time, getTypeForSort(b));
      if (timeCompare !== 0) {
        return timeCompare;
      }

      // Same time: order by kind (departure, arrival, interventions, now)
      const kindOrder: Record<TimedItem["kind"], number> = {
        departure: 0,
        arrival: 1,
        intervention: 2,
        timed_item_group: 2,
        now: 3,
      };
      return kindOrder[a.kind] - kindOrder[b.kind];
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
      const itemTz = item.timezone;

      // Insert transition if timezone changed (and both are defined)
      if (lastTimezone && itemTz && lastTimezone !== itemTz) {
        itemsWithTransitions.push({
          kind: "timezone_transition",
          fromTz: lastTimezone,
          toTz: itemTz,
        });
      }

      itemsWithTransitions.push(item);

      if (itemTz) {
        lastTimezone = itemTz;
      }
    }

    return { itemsWithTransitions, hasMultipleTimezones };
  }, [
    daySchedule,
    origin,
    destination,
    departureDate,
    departureTime,
    arrivalDate,
    arrivalTime,
    isCurrentDay,
    actuals,
    showTimezone,
  ]);

  // Day label color based on phase
  function getDayLabelStyle(): string {
    if (daySchedule.day < FLIGHT_DAY) return "text-sky-600"; // Pre-departure
    if (daySchedule.day === FLIGHT_DAY) return "text-sky-700"; // Flight day
    if (daySchedule.day === ARRIVAL_DAY) return "text-emerald-600"; // Arrival
    return "text-violet-600"; // Post-arrival adaptation
  }

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

            // Timeline dot style based on item type
            function getDotStyle(): string {
              if (item.kind === "now") {
                return "bg-amber-500 ring-4 ring-amber-200 scale-125";
              }
              if (item.kind === "departure" || item.kind === "arrival") {
                return "bg-sky-500 ring-2 ring-sky-200";
              }
              return "bg-white border-2 border-slate-300";
            }

            const itemKey =
              item.kind === "intervention"
                ? `${item.kind}-${item.time}-${item.data.type}-${item.index}`
                : item.kind === "timed_item_group"
                  ? `group-${item.data.parent.kind}-${item.time}`
                  : `${item.kind}-${item.time}`;

            return (
              <div key={itemKey} className="relative">
                {/* Timeline dot */}
                <div
                  className={`absolute top-5 -left-8 h-3 w-3 rounded-full transition-all duration-300 ${getDotStyle()}`}
                  style={{ transform: "translateX(5.5px)" }}
                />

                {/* Render card based on item type */}
                {item.kind === "intervention" &&
                  (isInFlightSleep(item.data) ? (
                    <InFlightSleepCard
                      intervention={item.data}
                      timezone={item.timezone}
                      flightContext={flightContext}
                    />
                  ) : (
                    <InterventionCard
                      intervention={item.data}
                      timezone={item.timezone}
                      flightContext={flightContext}
                      date={daySchedule.date}
                      actual={actuals?.get(
                        getActualKey(daySchedule.day, item.data.type)
                      )}
                      onClick={
                        onInterventionClick &&
                        isEditableIntervention(item.data.type)
                          ? () =>
                              onInterventionClick(
                                item.data,
                                daySchedule.day,
                                daySchedule.date
                              )
                          : undefined
                      }
                    />
                  ))}
                {item.kind === "timed_item_group" && (
                  <GroupedItemCard
                    group={item.data}
                    timezone={item.timezone}
                    origin={origin}
                    destination={destination}
                    flightContext={flightContext}
                    actuals={actuals}
                    onInterventionClick={onInterventionClick}
                    dayOffset={daySchedule.day}
                    date={daySchedule.date}
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
          <div className="relative py-6 text-center text-sm text-slate-400">
            No scheduled interventions for this day
          </div>
        )}
      </div>
    </section>
  );
}
