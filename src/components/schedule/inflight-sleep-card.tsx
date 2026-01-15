"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CloudMoon, Plane } from "lucide-react";
import {
  formatTimeWithTimezone,
  formatFlightOffset,
  formatFlightPhase,
  formatInFlightDualTimezones,
} from "@/lib/intervention-utils";
import type { Intervention } from "@/types/schedule";

interface FlightContext {
  originTimezone: string;
  destTimezone: string;
  departureDateTime: string;
  totalFlightHours?: number;
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
      <CardContent className="py-4">
        {/* Header with sleep icon and flight offset badge */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100/80 ring-2 ring-white/50">
              <CloudMoon className="h-4 w-4 text-violet-500" />
            </div>
            <span className="font-medium text-slate-800">In-Flight Sleep</span>
          </div>
          <Badge
            variant="secondary"
            className="shrink-0 bg-violet-100/70 font-medium text-violet-600"
          >
            {formatFlightOffset(flightOffset)}
          </Badge>
        </div>

        {/* Description */}
        <div className="mb-3">
          <p className="text-sm leading-relaxed text-slate-600">
            {intervention.description ||
              "Your body clock makes sleep easier during this window. Aim for restful sleep if possible."}
          </p>
          {durationHours && (
            <p className="mt-1 text-xs text-slate-500">
              Recommended: ~{durationHours.toFixed(0)} hours
            </p>
          )}
        </div>

        {/* Time display - dual timezone for in-flight */}
        <div className="rounded-lg bg-white/60 px-3 py-2">
          {dualTimes ? (
            <>
              <div className="text-sm font-medium tabular-nums text-slate-700">
                {dualTimes.originTime}
              </div>
              <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                <span className="tabular-nums">{dualTimes.destTime}</span>
                <Plane className="h-3 w-3 -rotate-45 text-violet-400" />
              </div>
            </>
          ) : (
            <p className="text-sm font-medium text-slate-700">
              {formatTimeWithTimezone(intervention.time, timezone)}
            </p>
          )}
          {flightContext?.totalFlightHours && (
            <p className="mt-1.5 text-xs text-slate-500">
              {formatFlightPhase(flightOffset, flightContext.totalFlightHours)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
