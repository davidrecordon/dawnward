"use client";

import { Check, Pencil, PlaneLanding, PlaneTakeoff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getInterventionStyle,
  formatTime,
  formatFlightOffset,
  formatDualTimezones,
  type TimeFormat,
} from "@/lib/intervention-utils";
import { useTimeFormat } from "@/components/display-preferences-context";
import type { Intervention, InterventionActual } from "@/types/schedule";
import {
  getDisplayTime,
  isPostArrivalPhase,
  isPreFlightPhase,
} from "@/types/schedule";

interface InterventionCardProps {
  intervention: Intervention;
  /** Card variant: default shows full card, nested shows compact version without time */
  variant?: "default" | "nested";
  /** Optional click handler for recording actuals */
  onClick?: () => void;
  /** Recorded actual for this intervention (shows inline changes) */
  actual?: InterventionActual;
  /** Date of the intervention (YYYY-MM-DD) - used to determine if "as_planned" should show completed styling */
  date?: string;
  /** User preference: always show both origin and destination timezones */
  showDualTimezone?: boolean;
}

interface TimeDisplayProps {
  actual: InterventionActual | undefined;
  isPast: boolean;
  isPreFlight: boolean;
  displayTime: string;
  dualTimes: { originTime: string; destTime: string } | null;
  primaryTime: string | null;
  secondaryTime: string | null;
  originalTime?: string;
  timeFormat: TimeFormat;
}

/**
 * Renders the time display for an intervention card.
 * Handles different states: modified, skipped, completed (as_planned), and default.
 */
function TimeDisplay({
  actual,
  isPast,
  isPreFlight,
  displayTime,
  dualTimes,
  primaryTime,
  secondaryTime,
  originalTime,
  timeFormat,
}: TimeDisplayProps): React.JSX.Element {
  const SecondaryIcon = isPreFlight ? PlaneLanding : PlaneTakeoff;

  // Modified: strikethrough original + actual time badge
  if (actual?.status === "modified" && actual.actualTime) {
    return (
      <>
        <span className="text-xs text-slate-400 tabular-nums line-through">
          {dualTimes ? dualTimes.originTime : formatTime(displayTime, timeFormat)}
        </span>
        <Badge
          variant="secondary"
          className="shrink-0 bg-sky-100 font-medium text-sky-600"
        >
          {formatTime(actual.actualTime, timeFormat)}
        </Badge>
      </>
    );
  }

  // Skipped: just show badge
  if (actual?.status === "skipped") {
    return (
      <Badge
        variant="secondary"
        className="shrink-0 bg-slate-100 font-medium text-slate-400"
      >
        Skipped
      </Badge>
    );
  }

  // As planned (past): show completed styling with checkmark
  if (actual?.status === "as_planned" && isPast) {
    if (dualTimes) {
      return (
        <div className="shrink-0 text-right">
          <div className="flex items-center justify-end gap-1 text-sm font-medium text-emerald-600 tabular-nums">
            {primaryTime}
            <Check className="h-3.5 w-3.5" />
          </div>
          <div className="flex items-center justify-end gap-1 text-xs text-emerald-500/70">
            <span className="tabular-nums">{secondaryTime}</span>
            <SecondaryIcon className="h-3 w-3 opacity-60" />
          </div>
        </div>
      );
    }
    return (
      <Badge
        variant="secondary"
        className="shrink-0 bg-emerald-50 font-medium text-emerald-600"
      >
        {formatTime(displayTime, timeFormat)}
        <Check className="ml-1 h-3 w-3" />
      </Badge>
    );
  }

  // Default: show time (dual or single)
  if (dualTimes) {
    return (
      <div className="shrink-0 text-right">
        <div className="text-sm font-medium text-slate-700 tabular-nums">
          {primaryTime}
        </div>
        <div className="flex items-center justify-end gap-1 text-xs text-slate-400">
          <span className="tabular-nums">{secondaryTime}</span>
          <SecondaryIcon className="h-3 w-3 opacity-60" />
        </div>
        {originalTime && (
          <div className="text-[10px] text-slate-400 italic">
            target: {formatTime(originalTime, timeFormat)}
          </div>
        )}
      </div>
    );
  }

  // Show original time hint if time was capped
  if (originalTime) {
    return (
      <div className="shrink-0 text-right">
        <Badge
          variant="secondary"
          className="bg-white/70 font-medium text-slate-600"
        >
          {formatTime(displayTime, timeFormat)}
        </Badge>
        <div className="mt-0.5 text-[10px] text-slate-400 italic">
          target: {formatTime(originalTime, timeFormat)}
        </div>
      </div>
    );
  }

  return (
    <Badge
      variant="secondary"
      className="shrink-0 bg-white/70 font-medium text-slate-600"
    >
      {formatTime(displayTime, timeFormat)}
    </Badge>
  );
}

export function InterventionCard({
  intervention,
  variant = "default",
  onClick,
  actual,
  date,
  showDualTimezone = false,
}: InterventionCardProps): React.JSX.Element {
  const timeFormat = useTimeFormat();
  const style = getInterventionStyle(intervention.type);
  const Icon = style.icon;
  const isNested = variant === "nested";

  // Check if this is an in-flight item with offset info
  const hasFlightOffset = intervention.flight_offset_hours != null;

  // Get the display time (origin_time for prep phases, dest_time for post-arrival)
  const displayTime = getDisplayTime(intervention);

  // Determine if the intervention is in the past (for "as_planned" completed styling)
  // Use origin_date and origin_time for accurate comparison
  const isPast = (() => {
    if (!date) return false;
    const interventionDateTime = new Date(`${date}T${displayTime}`);
    return interventionDateTime < new Date();
  })();

  // Phase type helpers
  const isPreFlight = isPreFlightPhase(intervention.phase_type);
  const isPostArrival = isPostArrivalPhase(intervention.phase_type);

  // Get dual timezone times if enabled AND not post-arrival (user has arrived)
  const dualTimes = isPostArrival
    ? null
    : formatDualTimezones(intervention, showDualTimezone, timeFormat);

  // Swap primary/secondary times based on phase
  const primaryTime = dualTimes
    ? isPreFlight
      ? dualTimes.originTime
      : dualTimes.destTime
    : null;
  const secondaryTime = dualTimes
    ? isPreFlight
      ? dualTimes.destTime
      : dualTimes.originTime
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
            <TimeDisplay
              actual={actual}
              isPast={isPast}
              isPreFlight={isPreFlight}
              displayTime={displayTime}
              dualTimes={dualTimes}
              primaryTime={primaryTime}
              secondaryTime={secondaryTime}
              originalTime={intervention.original_time}
              timeFormat={timeFormat}
            />
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
