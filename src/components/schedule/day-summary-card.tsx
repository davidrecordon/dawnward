"use client";

import { useState } from "react";
import { ChevronDown, Plane, PlaneLanding } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  getInterventionStyle,
  formatTime,
  formatFlightOffset,
  getDayLabel,
  getDayLabelColor,
  getDayCardGradient,
  FLIGHT_DAY,
} from "@/lib/intervention-utils";
import { formatLongDate, formatShortDate } from "@/lib/time-utils";
import {
  getDisplayTime,
  isInTransitPhase,
  isPreFlightPhase,
  isPostArrivalPhase,
} from "@/types/schedule";
import type { DaySchedule, Intervention } from "@/types/schedule";
import type { Airport } from "@/types/airport";

/**
 * Condensed descriptions for summary view.
 * Shorter, action-oriented versions of full intervention descriptions.
 */
const CONDENSED_DESCRIPTIONS: Record<string, string> = {
  wake_target: "Wake up to help shift your clock",
  light_seek: "Get 30+ min bright light",
  light_avoid: "Avoid bright light, dim screens",
  caffeine_cutoff: "Last caffeine for today",
  caffeine_ok: "Caffeine OK until cutoff",
  melatonin: "Take melatonin to shift rhythm",
  sleep_target: "Aim for sleep by this time",
  nap_window: "Good window for a short nap",
  exercise: "Physical activity helps shift rhythm",
};

function getCondensedDescription(type: string): string {
  return CONDENSED_DESCRIPTIONS[type] ?? "Follow this intervention";
}

/**
 * Get emoji for intervention type (for text/email output)
 */
function getInterventionEmoji(type: string): string {
  const emojiMap: Record<string, string> = {
    wake_target: "☀️",
    light_seek: "☀️",
    light_avoid: "😎",
    caffeine_cutoff: "☕",
    caffeine_ok: "☕",
    melatonin: "💊",
    sleep_target: "🌙",
    nap_window: "😴",
    exercise: "🏃",
  };
  return emojiMap[type] ?? "📋";
}

export interface DaySummaryCardProps {
  daySchedule: DaySchedule;
  origin: Airport;
  destination: Airport;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  /** Called when user wants to see detailed view */
  renderExpanded?: () => React.ReactNode;
  /** Controlled expanded state */
  isExpanded?: boolean;
  /** Called when expand/collapse changes */
  onExpandChange?: (expanded: boolean) => void;
  /** If true, disables expand functionality (for minimal shifts) */
  disableExpand?: boolean;
}

/**
 * A single intervention row in the summary view.
 */
function SummaryInterventionRow({
  intervention,
  showFlightOffset = false,
}: {
  intervention: Intervention;
  showFlightOffset?: boolean;
}) {
  const style = getInterventionStyle(intervention.type);
  const Icon = style.icon;
  const displayTime = getDisplayTime(intervention);
  const hasFlightOffset = intervention.flight_offset_hours != null;

  return (
    <div className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors duration-200 hover:bg-slate-50/50">
      {/* Icon with colored background */}
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${style.bgColor} ring-1 ring-white/60`}
      >
        <Icon className={`h-4 w-4 ${style.textColor}`} />
      </div>

      {/* Time */}
      <span
        className={`shrink-0 text-sm font-semibold whitespace-nowrap text-slate-700 tabular-nums ${
          showFlightOffset && hasFlightOffset ? "w-[140px]" : "w-[72px]"
        }`}
      >
        {showFlightOffset && hasFlightOffset
          ? formatFlightOffset(intervention.flight_offset_hours!)
          : formatTime(displayTime)}
      </span>

      {/* Description */}
      <span className="text-sm leading-snug text-slate-600">
        {getCondensedDescription(intervention.type)}
      </span>
    </div>
  );
}

/**
 * Sub-section header for flight day
 */
function FlightSubSectionHeader({
  title,
  subtitle,
  variant,
}: {
  title: string;
  subtitle?: string;
  variant: "before" | "transit" | "after";
}) {
  const styles = {
    before: "border-l-amber-400 bg-amber-50/50",
    transit: "border-l-sky-400 bg-sky-50/50",
    after: "border-l-emerald-400 bg-emerald-50/50",
  };

  return (
    <div
      className={`mt-3 mb-1 rounded-r-md border-l-2 py-1.5 pl-3 first:mt-0 ${styles[variant]}`}
    >
      <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
        {title}
      </span>
      {subtitle && (
        <span className="ml-2 text-xs text-slate-400">{subtitle}</span>
      )}
    </div>
  );
}

/**
 * Flight event row (departure or arrival)
 */
function FlightEventRow({
  type,
  time,
  origin,
  destination,
}: {
  type: "departure" | "arrival";
  time: string;
  origin: Airport;
  destination: Airport;
}) {
  const isDeparture = type === "departure";

  return (
    <div className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-slate-50/50">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-100 ring-1 ring-white/60">
        {isDeparture ? (
          <Plane className="h-3.5 w-3.5 -rotate-45 text-sky-600" />
        ) : (
          <PlaneLanding className="h-3.5 w-3.5 text-sky-600" />
        )}
      </div>
      <span className="w-[72px] shrink-0 text-sm font-semibold text-slate-700 tabular-nums">
        {formatTime(time)}
      </span>
      <span className="text-sm text-slate-600">
        {isDeparture
          ? `${origin.code} → ${destination.code} departs`
          : `Arrive at ${destination.code}`}
      </span>
    </div>
  );
}

/**
 * Groups interventions by phase for flight day.
 */
function groupByFlightPhase(items: Intervention[]): {
  beforeBoarding: Intervention[];
  inTransit: Intervention[];
  afterLanding: Intervention[];
} {
  const result = {
    beforeBoarding: [] as Intervention[],
    inTransit: [] as Intervention[],
    afterLanding: [] as Intervention[],
  };

  for (const item of items) {
    if (isInTransitPhase(item.phase_type)) {
      result.inTransit.push(item);
    } else if (isPreFlightPhase(item.phase_type)) {
      result.beforeBoarding.push(item);
    } else if (isPostArrivalPhase(item.phase_type)) {
      result.afterLanding.push(item);
    } else {
      // Defensive: unexpected phase types on flight day go to afterLanding
      console.warn(`Unexpected phase type on flight day: ${item.phase_type}`);
      result.afterLanding.push(item);
    }
  }

  return result;
}

/**
 * Summary content renderer - used both collapsed and when no renderExpanded provided
 */
function SummaryContent({
  daySchedule,
  origin,
  destination,
  departureDate,
  departureTime,
  arrivalDate,
  arrivalTime,
}: {
  daySchedule: DaySchedule;
  origin: Airport;
  destination: Airport;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
}) {
  const isFlightDay = daySchedule.day === FLIGHT_DAY;
  const hasDeparture = daySchedule.date === departureDate;
  // On flight day, always show arrival info (even if arrival is next calendar day)
  const hasArrival = isFlightDay || daySchedule.date === arrivalDate;

  if (daySchedule.items.length === 0 && !hasDeparture && !hasArrival) {
    return (
      <p className="py-3 text-center text-sm text-slate-400">
        No scheduled interventions
      </p>
    );
  }

  // Flight day: show sub-sections
  if (isFlightDay) {
    const groups = groupByFlightPhase(daySchedule.items);

    return (
      <>
        {/* Before Boarding */}
        {(groups.beforeBoarding.length > 0 || hasDeparture) && (
          <>
            <FlightSubSectionHeader title="Before Boarding" variant="before" />
            {groups.beforeBoarding.map((item, i) => (
              <SummaryInterventionRow
                key={`before-${item.type}-${getDisplayTime(item)}-${i}`}
                intervention={item}
              />
            ))}
            {hasDeparture && (
              <FlightEventRow
                type="departure"
                time={departureTime}
                origin={origin}
                destination={destination}
              />
            )}
          </>
        )}

        {/* On the Plane */}
        {groups.inTransit.length > 0 && (
          <>
            <FlightSubSectionHeader
              title="On the Plane"
              subtitle={
                hasDeparture
                  ? `${formatTime(departureTime)} from ${origin.code}`
                  : undefined
              }
              variant="transit"
            />
            {groups.inTransit.map((item, i) => (
              <SummaryInterventionRow
                key={`transit-${item.type}-${getDisplayTime(item)}-${i}`}
                intervention={item}
                showFlightOffset
              />
            ))}
          </>
        )}

        {/* After Landing */}
        {(groups.afterLanding.length > 0 || hasArrival) && (
          <>
            <FlightSubSectionHeader
              title="After Landing"
              subtitle={
                hasArrival
                  ? `${formatTime(arrivalTime)} at ${destination.code}`
                  : undefined
              }
              variant="after"
            />
            {hasArrival && (
              <FlightEventRow
                type="arrival"
                time={arrivalTime}
                origin={origin}
                destination={destination}
              />
            )}
            {groups.afterLanding.map((item, i) => (
              <SummaryInterventionRow
                key={`after-${item.type}-${getDisplayTime(item)}-${i}`}
                intervention={item}
              />
            ))}
          </>
        )}
      </>
    );
  }

  // Regular day: simple list
  return (
    <>
      {daySchedule.items.map((item, i) => (
        <SummaryInterventionRow
          key={`${item.type}-${getDisplayTime(item)}-${i}`}
          intervention={item}
        />
      ))}
    </>
  );
}

/**
 * DaySummaryCard - A condensed schedule view for a single day.
 *
 * Shows interventions in a scannable list format with:
 * - Icon + time + condensed description per intervention
 * - Flight day sub-sections (Before Boarding, On Plane, After Landing)
 * - Expand/collapse to show full detailed view
 */
export function DaySummaryCard({
  daySchedule,
  origin,
  destination,
  departureDate,
  departureTime,
  arrivalDate,
  arrivalTime,
  renderExpanded,
  isExpanded: controlledExpanded,
  onExpandChange,
  disableExpand = false,
}: DaySummaryCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded ?? internalExpanded;
  // Allow expand if either renderExpanded or onExpandChange is provided
  const canExpand =
    !disableExpand &&
    (renderExpanded !== undefined || onExpandChange !== undefined);

  const handleToggle = () => {
    if (!canExpand) return;
    const next = !isExpanded;
    // Only update internal state when in uncontrolled mode
    if (controlledExpanded === undefined) {
      setInternalExpanded(next);
    }
    onExpandChange?.(next);
  };

  // Use shared utilities for consistent styling across components
  const headerColor = getDayLabelColor(daySchedule.day);
  const topGradient = getDayCardGradient(daySchedule.day);

  return (
    <section id={`day-${daySchedule.day}`} className="scroll-mt-15">
      <Card className="overflow-hidden border-white/60 bg-white/90 shadow-sm backdrop-blur-sm transition-shadow duration-200 hover:shadow-md">
        {/* Top gradient accent */}
        <div className={`h-1 ${topGradient}`} />

        {/* Header */}
        <button
          onClick={handleToggle}
          disabled={!canExpand}
          className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors ${
            canExpand ? "cursor-pointer hover:bg-slate-50/50" : "cursor-default"
          }`}
          aria-expanded={canExpand ? isExpanded : undefined}
          aria-controls={
            canExpand ? `day-${daySchedule.day}-content` : undefined
          }
          aria-label={
            canExpand
              ? isExpanded
                ? "Collapse day details"
                : "Expand day details"
              : undefined
          }
        >
          <div className="flex items-baseline gap-2">
            <span
              className={`text-sm font-bold tracking-wide uppercase ${headerColor}`}
            >
              {getDayLabel(daySchedule.day, daySchedule.hasSameDayArrival)}
            </span>
            <span className="text-slate-300">•</span>
            <span className="hidden font-medium text-slate-600 sm:inline">
              {formatLongDate(daySchedule.date)}
            </span>
            <span className="inline font-medium text-slate-600 sm:hidden">
              {formatShortDate(daySchedule.date)}
            </span>
          </div>

          {canExpand && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all duration-200 ${
                isExpanded
                  ? "bg-slate-100 text-slate-600"
                  : "bg-sky-50 text-sky-700 ring-1 ring-sky-200/60 ring-inset hover:bg-sky-100 hover:ring-sky-300/60"
              }`}
            >
              {isExpanded ? (
                <>
                  <span>Hide</span>
                  <ChevronDown className="h-3.5 w-3.5 rotate-180 transition-transform duration-200" />
                </>
              ) : (
                <>
                  <span>View details</span>
                  <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200" />
                </>
              )}
            </span>
          )}
        </button>

        {/* Content */}
        <div id={`day-${daySchedule.day}-content`}>
          {isExpanded && renderExpanded ? (
            // Expanded: render detailed view
            <div className="border-t border-slate-100 px-4 py-4">
              {renderExpanded()}
            </div>
          ) : (
            // Summary view
            <CardContent className="border-t border-slate-100 pt-2 pb-4">
              <SummaryContent
                daySchedule={daySchedule}
                origin={origin}
                destination={destination}
                departureDate={departureDate}
                departureTime={departureTime}
                arrivalDate={arrivalDate}
                arrivalTime={arrivalTime}
              />
            </CardContent>
          )}
        </div>
      </Card>
    </section>
  );
}

/**
 * Format a day's interventions as plain text (for emails/calendar).
 */
export function formatDayForText(daySchedule: DaySchedule): string {
  return daySchedule.items
    .map((item) => {
      const emoji = getInterventionEmoji(item.type);
      const time = formatTime(getDisplayTime(item));
      const desc = getCondensedDescription(item.type);
      return `${emoji}  ${time}   ${desc}`;
    })
    .join("\n");
}
