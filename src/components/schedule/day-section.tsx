"use client";

import { getDayLabel } from "@/lib/intervention-utils";
import { formatLongDate, getCurrentTime } from "@/lib/time-utils";
import { InterventionCard } from "./intervention-card";
import { FlightCard } from "./flight-card";
import { NowMarker } from "./now-marker";
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

type ScheduleItem =
  | { kind: "intervention"; time: string; data: Intervention; index: number }
  | { kind: "departure"; time: string }
  | { kind: "arrival"; time: string }
  | { kind: "now"; time: string };

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
  // Build combined items array
  const items: ScheduleItem[] = [];

  // Add interventions
  daySchedule.items.forEach((intervention, index) => {
    items.push({
      kind: "intervention",
      time: intervention.time,
      data: intervention,
      index,
    });
  });

  // Add flight events if on this day
  if (daySchedule.date === departureDate) {
    items.push({ kind: "departure", time: departureTime });
  }
  if (daySchedule.date === arrivalDate) {
    items.push({ kind: "arrival", time: arrivalTime });
  }

  // Add "now" marker if this is today
  if (isCurrentDay) {
    const now = getCurrentTime();
    items.push({ kind: "now", time: now });
  }

  // Sort by time
  items.sort((a, b) => a.time.localeCompare(b.time));

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
              {getDayLabel(daySchedule.day)}
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
          {items.map((item) => {
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
                  <InterventionCard intervention={item.data} />
                )}
                {item.kind === "departure" && (
                  <FlightCard
                    type="departure"
                    time={item.time}
                    origin={origin}
                    destination={destination}
                  />
                )}
                {item.kind === "arrival" && (
                  <FlightCard
                    type="arrival"
                    time={item.time}
                    origin={origin}
                    destination={destination}
                  />
                )}
                {item.kind === "now" && <NowMarker time={item.time} />}
              </div>
            );
          })}
        </div>

        {/* Empty day message */}
        {items.length === 0 && (
          <div className="relative py-6 text-center text-slate-400 text-sm">
            No scheduled interventions for this day
          </div>
        )}
      </div>
    </section>
  );
}
