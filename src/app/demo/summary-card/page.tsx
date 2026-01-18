"use client";

import { useState } from "react";
import Link from "next/link";
import { DaySummaryCard, formatDayForText } from "@/components/schedule/day-summary-card";
import type { DaySchedule, Intervention, PhaseType } from "@/types/schedule";
import type { Airport } from "@/types/airport";

// Mock airports
const SFO: Airport = {
  code: "SFO",
  name: "San Francisco International Airport",
  city: "San Francisco",
  country: "US",
  tz: "America/Los_Angeles",
};

const LHR: Airport = {
  code: "LHR",
  name: "London Heathrow Airport",
  city: "London",
  country: "GB",
  tz: "Europe/London",
};

// Helper to create interventions
function createIntervention(
  type: Intervention["type"],
  originTime: string,
  destTime: string,
  phaseType: PhaseType,
  flightOffset?: number
): Intervention {
  return {
    type,
    title: type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: "Full description here",
    origin_time: originTime,
    dest_time: destTime,
    origin_date: "2026-01-20",
    dest_date: "2026-01-20",
    origin_tz: SFO.tz,
    dest_tz: LHR.tz,
    phase_type: phaseType,
    show_dual_timezone: phaseType === "in_transit",
    ...(flightOffset !== undefined && { flight_offset_hours: flightOffset }),
  };
}

// Mock schedule data
const prepDay: DaySchedule = {
  day: -2,
  date: "2026-01-18",
  items: [
    createIntervention("wake_target", "06:00", "14:00", "preparation"),
    createIntervention("caffeine_cutoff", "13:00", "21:00", "preparation"),
    createIntervention("melatonin", "14:00", "22:00", "preparation"),
    createIntervention("sleep_target", "21:00", "05:00", "preparation"),
  ],
};

const flightDay: DaySchedule = {
  day: 0,
  date: "2026-01-20",
  items: [
    // Before boarding
    createIntervention("wake_target", "05:00", "13:00", "pre_departure"),
    createIntervention("light_seek", "05:30", "13:30", "pre_departure"),
    // In-transit
    createIntervention("nap_window", "14:00", "22:00", "in_transit", 2),
    createIntervention("light_avoid", "16:00", "00:00", "in_transit", 4),
    createIntervention("light_seek", "20:00", "04:00", "in_transit", 8),
    // After landing
    createIntervention("light_seek", "15:45", "15:45", "post_arrival"),
    createIntervention("melatonin", "21:00", "21:00", "post_arrival"),
    createIntervention("sleep_target", "21:30", "21:30", "post_arrival"),
  ],
};

const arrivalDay: DaySchedule = {
  day: 1,
  date: "2026-01-21",
  items: [
    createIntervention("wake_target", "07:00", "07:00", "adaptation"),
    createIntervention("light_seek", "07:30", "07:30", "adaptation"),
    createIntervention("caffeine_ok", "08:00", "08:00", "adaptation"),
    createIntervention("caffeine_cutoff", "14:00", "14:00", "adaptation"),
    createIntervention("melatonin", "21:00", "21:00", "adaptation"),
    createIntervention("sleep_target", "21:30", "21:30", "adaptation"),
  ],
};

const adaptDay: DaySchedule = {
  day: 2,
  date: "2026-01-22",
  items: [
    createIntervention("wake_target", "07:00", "07:00", "adaptation"),
    createIntervention("light_seek", "07:30", "07:30", "adaptation"),
    createIntervention("caffeine_cutoff", "14:00", "14:00", "adaptation"),
    createIntervention("sleep_target", "22:00", "22:00", "adaptation"),
  ],
};

export default function SummaryCardDemo() {
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());

  const toggleExpanded = (day: number) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  };

  const days = [prepDay, flightDay, arrivalDay, adaptDay];

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-100 via-amber-50 to-violet-100 p-4 md:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800">DaySummaryCard Demo</h1>
          <p className="mt-1 text-slate-600">
            SFO → LHR • 8 hour shift (advance) • Click headers to expand
          </p>
        </div>

        {/* Cards */}
        <div className="space-y-4">
          {days.map((day) => (
            <DaySummaryCard
              key={day.day}
              daySchedule={day}
              origin={SFO}
              destination={LHR}
              departureDate="2026-01-20"
              departureTime="11:30"
              arrivalDate="2026-01-20"
              arrivalTime="19:45"
              isExpanded={expandedDays.has(day.day)}
              onExpandChange={() => toggleExpanded(day.day)}
              renderExpanded={() => (
                <div className="rounded-lg bg-slate-50 p-4">
                  <p className="text-sm text-slate-500">
                    [Detailed DaySection would render here]
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    This is a placeholder. In production, this would render the full
                    InterventionCard components with timeline.
                  </p>
                </div>
              )}
            />
          ))}
        </div>

        {/* Text output demo */}
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold text-slate-700">
            Email/Calendar Text Format
          </h2>
          <pre className="whitespace-pre-wrap rounded bg-slate-50 p-3 font-mono text-sm text-slate-600">
            {formatDayForText(prepDay)}
          </pre>
        </div>

        {/* Back link */}
        <div className="text-center">
          <Link
            href="/"
            className="text-sm text-sky-600 hover:text-sky-700 hover:underline"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
