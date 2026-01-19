"use client";

import { Card, CardContent } from "@/components/ui/card";
import { CloudMoon, PlaneTakeoff } from "lucide-react";
import {
  formatTime,
  formatFlightOffset,
  formatDualTimezones,
} from "@/lib/intervention-utils";
import { useUse24HourFormat } from "@/components/display-preferences-context";
import type { Intervention } from "@/types/schedule";

interface InFlightSleepCardProps {
  intervention: Intervention;
  /** Total flight duration in hours (for progress bar display) */
  totalFlightHours?: number;
  /** User preference: always show both origin and destination timezones */
  showDualTimezone?: boolean;
}

/**
 * Enhanced card for in-flight sleep windows on ultra-long-haul flights.
 * Uses soft lavender tones to distinguish from flight cards and emphasize sleep.
 * Layout matches intervention-card.tsx: icon left, content middle, times right.
 */
export function InFlightSleepCard({
  intervention,
  showDualTimezone = false,
}: InFlightSleepCardProps): React.JSX.Element {
  const use24Hour = useUse24HourFormat();
  const flightOffset = intervention.flight_offset_hours ?? 0;
  const durationHours = intervention.duration_min
    ? intervention.duration_min / 60
    : undefined;

  // Get dual timezone times - in-flight items always have show_dual_timezone=true from Python
  // User preference can also force dual times on all items
  const dualTimes = formatDualTimezones(intervention, showDualTimezone, use24Hour);

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
              <div className="text-sm font-medium text-slate-700 tabular-nums">
                {dualTimes.destTime}
              </div>
              <div className="mt-0.5 flex items-center justify-end gap-1 text-xs text-slate-400">
                <span className="tabular-nums">{dualTimes.originTime}</span>
                <PlaneTakeoff className="h-3 w-3 opacity-60" />
              </div>
            </>
          ) : (
            <div className="text-sm font-medium text-slate-700 tabular-nums">
              {formatTime(intervention.dest_time, use24Hour)}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
