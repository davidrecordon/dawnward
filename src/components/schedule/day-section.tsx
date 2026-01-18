"use client";

import { useMemo } from "react";
import { ChevronUp } from "lucide-react";
import {
  getDayLabel,
  getDayLabelColor,
  isEditableIntervention,
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
import { DaySummaryCard } from "./day-summary-card";
import { calculateFlightDuration } from "@/lib/timezone-utils";
import { getActualKey } from "@/lib/actuals-utils";
import { getDisplayTime } from "@/types/schedule";
import type {
  DaySchedule,
  Intervention,
  TimedItemGroup,
  ActualsMap,
  PhaseType,
} from "@/types/schedule";
import { isInTransitPhase, isPreFlightPhase } from "@/types/schedule";
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
  /** User preference: always show both origin and destination timezones */
  showDualTimezone?: boolean;
  /** Whether this day section is expanded (true) or showing summary (false) */
  isExpanded?: boolean;
  /** Callback when expand/collapse is toggled */
  onExpandChange?: () => void;
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
    }
  | {
      kind: "timed_item_group";
      time: string;
      data: TimedItemGroup;
    }
  | { kind: "departure"; time: string; origin_tz: string }
  | { kind: "arrival"; time: string; dest_tz: string }
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
  showDualTimezone = false,
  isExpanded = true,
  onExpandChange,
  onInterventionClick,
}: DaySectionProps) {
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

  // Memoize expensive item construction, sorting, and transition logic
  const { itemsWithTransitions, hasMultipleTimezones } = useMemo(() => {
    // Build combined items array (TimedItem before transitions are inserted)
    const items: TimedItem[] = [];

    // Build pre-grouping items array with all interventions, flights, and now marker
    const preGroupItems: GroupableItem[] = [];

    // Add all interventions - they now carry their own timezone context from Python enrichment
    daySchedule.items.forEach((intervention) => {
      preGroupItems.push({
        kind: "intervention",
        time: getDisplayTime(intervention),
        data: intervention,
      });
    });

    // Add flight events if on this day
    if (daySchedule.date === departureDate) {
      preGroupItems.push({
        kind: "departure",
        time: departureTime,
        origin_tz: origin.tz,
      });
    }
    if (daySchedule.date === arrivalDate) {
      preGroupItems.push({
        kind: "arrival",
        time: arrivalTime,
        dest_tz: destination.tz,
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
        });
      } else if (item.kind === "departure") {
        items.push({
          kind: "departure",
          time: item.time,
          origin_tz: item.origin_tz,
        });
      } else if (item.kind === "arrival") {
        items.push({
          kind: "arrival",
          time: item.time,
          dest_tz: item.dest_tz,
        });
      } else if (item.kind === "now") {
        items.push({ kind: "now", time: item.time, timezone: item.timezone });
      }
    });

    // Get phase type for an item (for sorting)
    const getPhaseType = (item: TimedItem): PhaseType | undefined => {
      if (item.kind === "intervention") return item.data.phase_type;
      if (item.kind === "timed_item_group") {
        const { parent } = item.data;
        return parent.kind === "intervention"
          ? parent.data.phase_type
          : "post_arrival";
      }
      if (item.kind === "departure") return "pre_departure";
      if (item.kind === "arrival") return "post_arrival";
      return undefined;
    };

    // Check if item is in-transit
    const isItemInTransit = (item: TimedItem): boolean => {
      return isInTransitPhase(getPhaseType(item));
    };

    // Sort items with phase-aware logic
    // Flight events act as phase boundaries: departure ends pre-departure, arrival starts post-arrival
    items.sort((a, b) => {
      const phaseA = getPhaseType(a);
      const phaseB = getPhaseType(b);

      // Departure comes before in-transit interventions
      if (
        a.kind === "departure" &&
        isInterventionLike(b.kind) &&
        isItemInTransit(b)
      ) {
        return -1;
      }
      if (
        b.kind === "departure" &&
        isInterventionLike(a.kind) &&
        isItemInTransit(a)
      ) {
        return 1;
      }

      // Different phases: preserve phase order (pre_departure → in_transit → post_arrival)
      if (phaseA !== phaseB) {
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

      // Same phase: sort by time with late-night awareness
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

    // Get display timezone for an item (for transition detection)
    const getItemDisplayTimezone = (item: TimedItem): string | undefined => {
      if (item.kind === "intervention") {
        return isPreFlightPhase(item.data.phase_type)
          ? item.data.origin_tz
          : item.data.dest_tz;
      }
      if (item.kind === "timed_item_group") {
        const { parent } = item.data;
        if (parent.kind === "intervention") {
          return isPreFlightPhase(parent.data.phase_type)
            ? parent.data.origin_tz
            : parent.data.dest_tz;
        }
        return parent.dest_tz;
      }
      if (item.kind === "departure") return item.origin_tz;
      if (item.kind === "arrival") return item.dest_tz;
      if (item.kind === "now") return item.timezone;
      return undefined;
    };

    // Insert timezone transitions when timezone changes between consecutive items
    const itemsWithTransitions: ScheduleItem[] = [];
    let lastTimezone: string | undefined;

    for (const item of items) {
      const itemTz = getItemDisplayTimezone(item);

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
  ]);

  // Summary view: render DaySummaryCard when not expanded
  if (!isExpanded) {
    return (
      <DaySummaryCard
        daySchedule={daySchedule}
        origin={origin}
        destination={destination}
        departureDate={departureDate}
        departureTime={departureTime}
        arrivalDate={arrivalDate}
        arrivalTime={arrivalTime}
        isExpanded={false}
        onExpandChange={() => onExpandChange?.()}
      />
    );
  }

  // Expanded/Timeline view: render detailed timeline
  return (
    <section id={`day-${daySchedule.day}`} className="relative scroll-mt-15">
      {/* Sticky day header - clickable to collapse */}
      <div className="sticky top-0 z-20 pt-4 pb-3">
        <button
          onClick={onExpandChange}
          className="w-full cursor-pointer overflow-hidden rounded-lg border border-white/50 bg-white/90 text-left shadow-sm backdrop-blur-sm transition-colors hover:bg-slate-50/50"
          aria-expanded={true}
          aria-controls={`day-${daySchedule.day}-content`}
          aria-label="Collapse day details"
        >
          {/* Decorative top gradient */}
          <div className="h-0.5 bg-gradient-to-r from-sky-400 via-indigo-400 to-violet-400" />

          {/* Header content */}
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-baseline gap-3">
              <span
                className={`text-sm font-bold tracking-wide uppercase ${getDayLabelColor(daySchedule.day)}`}
              >
                {getDayLabel(daySchedule.day, daySchedule.hasSameDayArrival)}
              </span>
              <span className="text-slate-400">•</span>
              <span className="font-medium text-slate-600">
                {formatLongDate(daySchedule.date)}
              </span>
            </div>
            <ChevronUp className="h-5 w-5 text-slate-400" />
          </div>
        </button>
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
                      totalFlightHours={totalFlightHours}
                      showDualTimezone={showDualTimezone}
                    />
                  ) : (
                    <InterventionCard
                      intervention={item.data}
                      date={daySchedule.date}
                      actual={actuals?.get(
                        getActualKey(daySchedule.day, item.data.type)
                      )}
                      showDualTimezone={showDualTimezone}
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
                    origin={origin}
                    destination={destination}
                    actuals={actuals}
                    showDualTimezone={showDualTimezone}
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
                    timezone={item.origin_tz}
                  />
                )}
                {item.kind === "arrival" && (
                  <FlightCard
                    type="arrival"
                    time={item.time}
                    origin={origin}
                    destination={destination}
                    timezone={item.dest_tz}
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
