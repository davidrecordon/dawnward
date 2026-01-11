"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getInterventionStyle,
  formatTimeWithTimezone,
  formatFlightOffset,
  getTimezoneAbbr,
} from "@/lib/intervention-utils";
import type { Intervention } from "@/types/schedule";

interface InterventionCardProps {
  intervention: Intervention;
  /** Optional timezone to display (shown on Flight Day and Arrival day) */
  timezone?: string;
  /** Origin timezone for dual-timezone display on in-flight items */
  originTimezone?: string;
  /** Card variant: default shows full card, nested shows compact version without time */
  variant?: "default" | "nested";
}

export function InterventionCard({
  intervention,
  timezone,
  originTimezone,
  variant = "default",
}: InterventionCardProps): React.JSX.Element {
  const style = getInterventionStyle(intervention.type);
  const Icon = style.icon;
  const isNested = variant === "nested";

  // Check if this is an in-flight item with offset info
  const hasFlightOffset = intervention.flight_offset_hours != null;

  // Show both timezones for in-flight items if origin and destination differ
  const showDualTimezone =
    hasFlightOffset &&
    originTimezone &&
    timezone &&
    originTimezone !== timezone;

  return (
    <Card
      className={
        isNested
          ? "border-white/50 bg-white/70 shadow-sm backdrop-blur-sm"
          : "border-white/50 bg-white/80 shadow-sm backdrop-blur-sm transition-all duration-300 hover:translate-x-1 hover:shadow-md"
      }
    >
      <CardContent
        className={`flex items-center gap-4 ${isNested ? "py-3" : "py-4"}`}
      >
        <div
          className={`flex shrink-0 items-center justify-center rounded-xl ${style.bgColor} ring-2 ring-white/50 ${isNested ? "h-9 w-9" : "h-11 w-11"}`}
        >
          <Icon
            className={`${style.textColor} ${isNested ? "h-4 w-4" : "h-5 w-5"}`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`font-medium text-slate-800 ${isNested ? "text-sm" : ""}`}
          >
            {intervention.title}
          </p>
          <p
            className={`leading-relaxed text-slate-500 ${isNested ? "text-xs" : "text-sm"}`}
          >
            {intervention.description}
          </p>
          {/* Show flight offset for in-transit items */}
          {hasFlightOffset && (
            <p className="mt-1 text-xs font-medium text-sky-500">
              {formatFlightOffset(intervention.flight_offset_hours!)}
            </p>
          )}
          {/* Show dual timezone indicator for in-flight items */}
          {showDualTimezone && (
            <p className="mt-0.5 text-xs text-slate-400">
              {getTimezoneAbbr(originTimezone)} → {getTimezoneAbbr(timezone)}
            </p>
          )}
        </div>
        {/* Hide time badge for nested variant */}
        {!isNested && (
          <Badge
            variant="secondary"
            className="shrink-0 bg-white/70 font-medium text-slate-600"
          >
            {formatTimeWithTimezone(intervention.time, timezone)}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
