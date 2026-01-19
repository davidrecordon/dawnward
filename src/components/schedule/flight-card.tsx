"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plane, PlaneTakeoff, PlaneLanding } from "lucide-react";
import { formatTimeWithTimezone, type TimeFormat } from "@/lib/intervention-utils";
import type { Airport } from "@/types/airport";

interface FlightCardProps {
  type: "departure" | "arrival";
  time: string;
  origin: Airport;
  destination: Airport;
  /** Timezone for the time display (origin tz for departure, destination tz for arrival) */
  timezone?: string;
  /** User preference: time format (12h or 24h) */
  timeFormat?: TimeFormat;
}

export function FlightCard({
  type,
  time,
  origin,
  destination,
  timezone,
  timeFormat = "12h",
}: FlightCardProps): React.JSX.Element {
  const isDeparture = type === "departure";
  const Icon = isDeparture ? PlaneTakeoff : PlaneLanding;
  const title = isDeparture
    ? `Departure from ${origin.code}`
    : `Arrival at ${destination.code}`;
  const subtitle = isDeparture
    ? `${origin.city} → ${destination.city}`
    : `Welcome to ${destination.city}`;

  return (
    <Card className="border-sky-200/50 bg-gradient-to-r from-sky-50 to-sky-100/80 shadow-sm transition-all duration-300 hover:translate-x-1 hover:shadow-md">
      <CardContent className="flex items-center gap-4 py-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500 ring-2 ring-sky-300/50">
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sky-900">{title}</p>
            <Plane className="h-3.5 w-3.5 text-sky-400" />
          </div>
          <p className="text-sm text-sky-600">{subtitle}</p>
        </div>
        <Badge className="shrink-0 bg-sky-500 font-medium text-white hover:bg-sky-500">
          {formatTimeWithTimezone(time, timezone, undefined, timeFormat)}
        </Badge>
      </CardContent>
    </Card>
  );
}
