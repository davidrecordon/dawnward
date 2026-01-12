"use client";

import * as React from "react";
import { Plane } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { Airport } from "@/types/airport";
import type { TripLeg } from "@/types/trip-form";
import {
  calculateTimeShift,
  formatTimeShift,
  calculateFlightDuration,
  formatDuration,
} from "@/lib/timezone-utils";

interface TripPreviewCardProps {
  origin: Airport | null;
  destination: Airport | null;
  departureDateTime: string;
  arrivalDateTime: string;
  prepDays: number;
  leg2?: TripLeg | null;
}

export function TripPreviewCard({
  origin,
  destination,
  departureDateTime,
  arrivalDateTime,
  prepDays,
  leg2,
}: TripPreviewCardProps) {
  // Final destination is leg2 destination if it exists, otherwise leg1 destination
  const finalDestination = leg2?.destination || destination;

  // Calculate time shift (from origin to final destination)
  const timeShift = React.useMemo(() => {
    if (!origin || !finalDestination) return null;
    return calculateTimeShift(origin.tz, finalDestination.tz);
  }, [origin, finalDestination]);

  // Calculate flight duration for leg 1
  const leg1Duration = React.useMemo(() => {
    if (!origin || !destination || !departureDateTime || !arrivalDateTime) {
      return null;
    }
    return calculateFlightDuration(
      departureDateTime,
      arrivalDateTime,
      origin.tz,
      destination.tz
    );
  }, [origin, destination, departureDateTime, arrivalDateTime]);

  // Calculate flight duration for leg 2
  const leg2Duration = React.useMemo(() => {
    if (
      !leg2?.origin ||
      !leg2?.destination ||
      !leg2?.departureDateTime ||
      !leg2?.arrivalDateTime
    ) {
      return null;
    }
    return calculateFlightDuration(
      leg2.departureDateTime,
      leg2.arrivalDateTime,
      leg2.origin.tz,
      leg2.destination.tz
    );
  }, [leg2]);

  // Calculate layover duration (time between leg1 arrival and leg2 departure)
  const layoverDuration = React.useMemo(() => {
    if (!arrivalDateTime || !leg2?.departureDateTime || !destination) {
      return null;
    }
    // Convert leg1 arrival to UTC, leg2 departure to UTC, get difference
    const leg1Arr = new Date(arrivalDateTime);
    const leg2Dep = new Date(leg2.departureDateTime);
    const diffMs = leg2Dep.getTime() - leg1Arr.getTime();
    if (diffMs <= 0) return null;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return { hours, minutes };
  }, [arrivalDateTime, leg2?.departureDateTime, destination]);

  // For display, use leg1 duration when no leg2, otherwise show total flight time
  const duration = React.useMemo(() => {
    if (!leg1Duration) return null;
    if (!leg2Duration) return leg1Duration;
    // Sum flight times (not including layover)
    const totalMinutes =
      leg1Duration.hours * 60 +
      leg1Duration.minutes +
      leg2Duration.hours * 60 +
      leg2Duration.minutes;
    return {
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
    };
  }, [leg1Duration, leg2Duration]);

  return (
    <Card className="border border-slate-200/50 bg-white/90 backdrop-blur-sm">
      <CardContent className="pt-6">
        <div className="mb-4 text-center">
          {/* Route display - single leg or multi-leg */}
          <div className="mb-2 flex items-center justify-center gap-2">
            <span className="text-2xl font-bold">{origin?.code || "---"}</span>
            <Plane className="h-5 w-5 -rotate-45 text-sky-500" />
            {leg2?.destination ? (
              <>
                <span className="text-lg font-medium text-slate-400">
                  {destination?.code || "---"}
                </span>
                <Plane className="h-4 w-4 -rotate-45 text-sky-400" />
                <span className="text-2xl font-bold">
                  {leg2.destination.code}
                </span>
              </>
            ) : (
              <span className="text-2xl font-bold">
                {destination?.code || "---"}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            {timeShift !== null
              ? `${formatTimeShift(timeShift)} time shift`
              : "Select airports to see time shift"}
          </p>
          {/* Layover info */}
          {layoverDuration && destination && (
            <p className="mt-1 text-xs text-slate-400">
              {formatDuration(layoverDuration.hours, layoverDuration.minutes)}{" "}
              layover in {destination.code}
            </p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-2xl font-bold text-sky-600">{prepDays}</p>
            <p className="text-xs text-slate-500">
              {prepDays === 1 ? "Day" : "Days"} before
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-2xl font-bold text-orange-600">
              {duration
                ? formatDuration(duration.hours, duration.minutes)
                : "---"}
            </p>
            <p className="text-xs text-slate-500">
              {leg2 ? "Total flight" : "Flight time"}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-2xl font-bold text-purple-600">1</p>
            <p className="text-xs text-slate-500">Day after</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
