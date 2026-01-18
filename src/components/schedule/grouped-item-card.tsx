"use client";

import type { TimedItemGroup, Intervention, ActualsMap } from "@/types/schedule";
import type { Airport } from "@/types/airport";
import { isEditableIntervention } from "@/lib/intervention-utils";
import { getActualKey } from "@/lib/actuals-utils";
import { InterventionCard } from "./intervention-card";
import { FlightCard } from "./flight-card";

interface FlightContext {
  originTimezone: string;
  destTimezone: string;
  departureDateTime: string;
}

interface GroupedItemCardProps {
  group: TimedItemGroup;
  /** Optional timezone to display on the parent card */
  timezone?: string;
  /** Origin airport (for arrival parent's FlightCard) */
  origin: Airport;
  /** Destination airport (for arrival parent's FlightCard) */
  destination: Airport;
  /** Flight context for in-transit dual timezone display */
  flightContext?: FlightContext;
  /** Recorded actuals map for displaying inline changes */
  actuals?: ActualsMap;
  /** Callback when an intervention card is clicked (for recording actuals) */
  onInterventionClick?: (
    intervention: Intervention,
    dayOffset: number,
    date: string,
    nestedChildren?: Intervention[]
  ) => void;
  /** Day offset for this group */
  dayOffset: number;
  /** Date string (YYYY-MM-DD) for this group */
  date: string;
}

/**
 * Renders a parent item (wake_target or arrival) with nested children.
 * Creates a visual hierarchy with connecting lines.
 *
 * Connector colors match parent theme:
 * - wake_target: amber (sunrise)
 * - arrival: sky blue (flight)
 */
export function GroupedItemCard({
  group,
  timezone,
  origin,
  destination,
  flightContext,
  actuals,
  onInterventionClick,
  dayOffset,
  date,
}: GroupedItemCardProps): React.JSX.Element {
  const { parent, children, time } = group;
  const isArrival = parent.kind === "arrival";
  const connectorColor = isArrival ? "bg-sky-200" : "bg-amber-200";

  return (
    <div className="relative">
      {/* Parent card */}
      {isArrival ? (
        <FlightCard
          type="arrival"
          time={time}
          origin={origin}
          destination={destination}
          timezone={parent.timezone}
        />
      ) : (
        <InterventionCard
          intervention={parent.data}
          timezone={timezone}
          flightContext={flightContext}
          date={date}
          actual={actuals?.get(getActualKey(dayOffset, parent.data.type))}
          onClick={
            onInterventionClick && isEditableIntervention(parent.data.type)
              ? () => onInterventionClick(parent.data, dayOffset, date, children)
              : undefined
          }
        />
      )}

      {/* Children container with connecting lines */}
      {children.length > 0 && (
        <div className="relative mt-2 ml-6">
          <div className="space-y-2">
            {children.map((child, index) => {
              const isFirst = index === 0;
              const isLast = index === children.length - 1;

              return (
                <div
                  key={`${child.type}-${child.time}-${index}`}
                  className="relative"
                >
                  {/* Vertical connector up (first child extends to parent) */}
                  <div
                    className={`absolute top-0 left-4 h-1/2 w-0.5 -translate-x-1/2 ${connectorColor}`}
                    style={
                      isFirst
                        ? { marginTop: "-0.5rem", height: "calc(50% + 0.5rem)" }
                        : undefined
                    }
                  />

                  {/* Vertical connector down (skip for last child) */}
                  {!isLast && (
                    <div
                      className={`absolute top-1/2 bottom-0 left-4 w-0.5 -translate-x-1/2 ${connectorColor}`}
                      style={{ marginBottom: "-0.5rem" }}
                    />
                  )}

                  {/* Horizontal connector to child */}
                  <div
                    className={`absolute top-1/2 left-4 h-0.5 w-4 -translate-y-1/2 ${connectorColor}`}
                  />

                  {/* Child card */}
                  <div className="pl-8">
                    <InterventionCard
                      intervention={child}
                      variant="nested"
                      flightContext={flightContext}
                      date={date}
                      actual={actuals?.get(getActualKey(dayOffset, child.type))}
                      onClick={
                        onInterventionClick &&
                        isEditableIntervention(child.type)
                          ? () => onInterventionClick(child, dayOffset, date)
                          : undefined
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
