"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getInterventionStyle,
  formatTime,
  getTimezoneAbbr,
} from "@/lib/intervention-utils";
import type { Intervention } from "@/types/schedule";

interface InterventionCardProps {
  intervention: Intervention;
  /** Optional timezone to display (shown on Flight Day and Arrival day) */
  timezone?: string;
}

/**
 * Format flight offset hours for display
 * e.g., 4.5 → "~4.5 hours into flight"
 */
function formatFlightOffset(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    if (minutes == 0) {
      return `As soon as you can`;
    }
    return `~${minutes} minutes into flight`;
  }
  return `~${hours} hours into flight`;
}

export function InterventionCard({
  intervention,
  timezone,
}: InterventionCardProps) {
  const style = getInterventionStyle(intervention.type);
  const Icon = style.icon;

  // Format time with optional timezone abbreviation
  const timeDisplay = timezone
    ? `${formatTime(intervention.time)} ${getTimezoneAbbr(timezone)}`
    : formatTime(intervention.time);

  // Check if this is an in-flight item with offset info
  const hasFlightOffset =
    intervention.flight_offset_hours !== undefined &&
    intervention.flight_offset_hours !== null;

  return (
    <Card className="border-white/50 bg-white/80 shadow-sm backdrop-blur-sm transition-all duration-300 hover:translate-x-1 hover:shadow-md">
      <CardContent className="flex items-center gap-4 py-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${style.bgColor} ring-2 ring-white/50`}
        >
          <Icon className={`h-5 w-5 ${style.textColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-800">{intervention.title}</p>
          <p className="text-sm leading-relaxed text-slate-500">
            {intervention.description}
          </p>
          {/* Show flight offset for in-transit items */}
          {hasFlightOffset && (
            <p className="mt-1 text-xs font-medium text-sky-500">
              {formatFlightOffset(intervention.flight_offset_hours!)}
            </p>
          )}
        </div>
        <Badge
          variant="secondary"
          className="shrink-0 bg-white/70 font-medium text-slate-600"
        >
          {timeDisplay}
        </Badge>
      </CardContent>
    </Card>
  );
}
