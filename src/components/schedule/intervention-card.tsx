"use client";

import { Check, Pencil, Plane } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getInterventionStyle,
  formatTimeWithTimezone,
  formatFlightOffset,
  formatInFlightDualTimezones,
} from "@/lib/intervention-utils";
import type { Intervention, InterventionActual } from "@/types/schedule";

interface FlightContext {
  originTimezone: string;
  destTimezone: string;
  departureDateTime: string;
}

interface InterventionCardProps {
  intervention: Intervention;
  /** Timezone for this intervention's time display */
  timezone?: string;
  /** Flight context for in-transit dual timezone display */
  flightContext?: FlightContext;
  /** Card variant: default shows full card, nested shows compact version without time */
  variant?: "default" | "nested";
  /** Optional click handler for recording actuals */
  onClick?: () => void;
  /** Recorded actual for this intervention (shows inline changes) */
  actual?: InterventionActual;
  /** Date of the intervention (YYYY-MM-DD) - used to determine if "as_planned" should show completed styling */
  date?: string;
}

export function InterventionCard({
  intervention,
  timezone,
  flightContext,
  variant = "default",
  onClick,
  actual,
  date,
}: InterventionCardProps): React.JSX.Element {
  const style = getInterventionStyle(intervention.type);
  const Icon = style.icon;
  const isNested = variant === "nested";

  // Check if this is an in-flight item with offset info
  const hasFlightOffset = intervention.flight_offset_hours != null;

  // Determine if the intervention is in the past (for "as_planned" completed styling)
  // Only show "completed" green styling if the intervention's datetime has passed
  const isPast = (() => {
    if (!date) return false;
    const interventionDateTime = new Date(`${date}T${intervention.time}`);
    return interventionDateTime < new Date();
  })();

  // Show dual timezones for in-transit items with flight offset and different timezones
  const showDualTimezone =
    intervention.is_in_transit &&
    hasFlightOffset &&
    flightContext &&
    flightContext.originTimezone !== flightContext.destTimezone;

  // Calculate dual timezone times from departure + flight offset
  const dualTimes = showDualTimezone
    ? formatInFlightDualTimezones(
        flightContext.departureDateTime,
        intervention.flight_offset_hours!,
        flightContext.originTimezone,
        flightContext.destTimezone
      )
    : null;

  return (
    <Card
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={
        isNested
          ? `group border-white/50 bg-white/70 shadow-sm backdrop-blur-sm ${onClick ? "cursor-pointer" : ""}`
          : `group border-white/50 bg-white/80 shadow-sm backdrop-blur-sm transition-all duration-300 hover:translate-x-1 hover:shadow-md ${onClick ? "cursor-pointer" : ""}`
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
        </div>
        {/* Time display with inline actuals and dual timezone support */}
        {!isNested && (
          <div className="flex flex-col items-end gap-0.5">
            {actual?.status === "modified" && actual.actualTime ? (
              // Modified: strikethrough original + actual time badge
              <>
                <span className="text-xs tabular-nums text-slate-400 line-through">
                  {dualTimes
                    ? dualTimes.originTime
                    : formatTimeWithTimezone(intervention.time, timezone)}
                </span>
                <Badge
                  variant="secondary"
                  className="shrink-0 bg-sky-100 font-medium text-sky-600"
                >
                  {formatTimeWithTimezone(actual.actualTime, timezone)}
                </Badge>
              </>
            ) : actual?.status === "skipped" ? (
              // Skipped: just show badge
              <Badge
                variant="secondary"
                className="shrink-0 bg-slate-100 font-medium text-slate-400"
              >
                Skipped
              </Badge>
            ) : actual?.status === "as_planned" && isPast ? (
              // As planned (past): show completed styling with checkmark
              dualTimes ? (
                <div className="shrink-0 text-right">
                  <div className="flex items-center justify-end gap-1 text-sm font-medium tabular-nums text-emerald-600">
                    {dualTimes.originTime}
                    <Check className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex items-center justify-end gap-1 text-xs text-emerald-500/70">
                    <span className="tabular-nums">{dualTimes.destTime}</span>
                    <Plane className="h-3 w-3 -rotate-45" />
                  </div>
                </div>
              ) : (
                <Badge
                  variant="secondary"
                  className="shrink-0 bg-emerald-50 font-medium text-emerald-600"
                >
                  {formatTimeWithTimezone(intervention.time, timezone)}
                  <Check className="ml-1 h-3 w-3" />
                </Badge>
              )
            ) : // Default: show time (dual or single)
            dualTimes ? (
              <div className="shrink-0 text-right">
                <div className="text-sm font-medium tabular-nums text-slate-700">
                  {dualTimes.originTime}
                </div>
                <div className="flex items-center justify-end gap-1 text-xs text-slate-500">
                  <span className="tabular-nums">{dualTimes.destTime}</span>
                  <Plane className="h-3 w-3 -rotate-45 text-sky-400" />
                </div>
              </div>
            ) : (
              <Badge
                variant="secondary"
                className="shrink-0 bg-white/70 font-medium text-slate-600"
              >
                {formatTimeWithTimezone(intervention.time, timezone)}
              </Badge>
            )}
          </div>
        )}
        {/* Edit indicator for clickable cards */}
        {onClick && (
          <div
            className={`flex shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors group-hover:bg-slate-100 group-hover:text-slate-500 ${isNested ? "h-7 w-7" : "h-8 w-8"}`}
          >
            <Pencil className={isNested ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
