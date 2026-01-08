"use client";

import * as React from "react";
import { Plane } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { Airport } from "@/types/airport";
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
}

export function TripPreviewCard({
  origin,
  destination,
  departureDateTime,
  arrivalDateTime,
  prepDays,
}: TripPreviewCardProps) {
  // Calculate time shift
  const timeShift = React.useMemo(() => {
    if (!origin || !destination) return null;
    return calculateTimeShift(origin.tz, destination.tz);
  }, [origin, destination]);

  // Calculate flight duration
  const duration = React.useMemo(() => {
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

  return (
    <Card className="border border-slate-200/50 bg-white/90 backdrop-blur-sm">
      <CardContent className="pt-6">
        <div className="mb-4 text-center">
          <div className="mb-2 flex items-center justify-center gap-3">
            <span className="text-2xl font-bold">{origin?.code || "---"}</span>
            <Plane className="h-5 w-5 -rotate-45 text-sky-500" />
            <span className="text-2xl font-bold">
              {destination?.code || "---"}
            </span>
          </div>
          <p className="text-sm text-slate-500">
            {timeShift !== null
              ? `${formatTimeShift(timeShift)} time shift`
              : "Select airports to see time shift"}
          </p>
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
            <p className="text-xs text-slate-500">Flight time</p>
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
