"use client";

import { Card, CardContent } from "@/components/ui/card";
import { CloudMoon, PlaneTakeoff } from "lucide-react";
import {
  formatTimeWithTimezone,
  formatFlightOffset,
  formatInFlightDualTimezones,
} from "@/lib/intervention-utils";
import type { Intervention } from "@/types/schedule";

interface FlightContext {
  originTimezone: string;
  destTimezone: string;
  departureDateTime: string;
}

interface InFlightSleepCardProps {
  intervention: Intervention;
  /** Optional timezone to display (destination timezone) */
  timezone?: string;
  /** Flight context for dual timezone display */
  flightContext?: FlightContext;
}

/**
 * Enhanced card for in-flight sleep windows on ultra-long-haul flights.
 * Uses soft lavender tones to distinguish from flight cards and emphasize sleep.
 * Layout matches intervention-card.tsx: icon left, content middle, times right.
 */
export function InFlightSleepCard({
  intervention,
  timezone,
  flightContext,
}: InFlightSleepCardProps): React.JSX.Element {
  const flightOffset = intervention.flight_offset_hours ?? 0;
  const durationHours = intervention.duration_min
    ? intervention.duration_min / 60
    : undefined;

  // Show dual timezones when in-transit with flight offset and different timezones
  const showDualTimezone =
    intervention.is_in_transit &&
    intervention.flight_offset_hours != null &&
    flightContext &&
    flightContext.originTimezone !== flightContext.destTimezone;

  const dualTimes = showDualTimezone
    ? formatInFlightDualTimezones(
        flightContext.departureDateTime,
        intervention.flight_offset_hours!,
        flightContext.originTimezone,
        flightContext.destTimezone
      )
    : null;

  return (
    <Card className="overflow-hidden border-violet-200/40 bg-gradient-to-r from-violet-50/80 via-slate-50 to-violet-50/60 shadow-sm backdrop-blur-sm transition-all duration-300 hover:translate-x-1 hover:shadow-md">
      <CardContent className="flex items-start gap-4 py-5">
        {/* Left: Icon */}
        <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100/80 ring-2 ring-white/50">
          <CloudMoon className="h-5 w-5 text-violet-500" />
        </div>

        {/* Middle: Content */}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-800">In-Flight Sleep</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {intervention.description ||
              "Your body clock makes sleep easier during this window. Aim for restful sleep if possible."}
          </p>
          {durationHours && (
            <p className="mt-1 text-xs font-medium text-gray-500">
              ~{durationHours.toFixed(0)} hours sleep recommended
            </p>
          )}
          <p className="mt-1 text-xs font-medium text-violet-400">
            {formatFlightOffset(flightOffset)}
          </p>
        </div>

        {/* Right: Time display */}
        <div className="shrink-0 self-center text-right">
          {dualTimes ? (
            <>
              <div className="text-sm font-medium tabular-nums text-slate-700">
                {dualTimes.destTime}
              </div>
              <div className="mt-0.5 flex items-center justify-end gap-1 text-xs text-slate-400">
                <span className="tabular-nums">{dualTimes.originTime}</span>
                <PlaneTakeoff className="h-3 w-3 opacity-60" />
              </div>
            </>
          ) : (
            <div className="text-sm font-medium tabular-nums text-slate-700">
              {formatTimeWithTimezone(intervention.time, timezone)}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
