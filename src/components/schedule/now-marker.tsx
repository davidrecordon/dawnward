"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import { formatTimeWithTimezone, type TimeFormat } from "@/lib/intervention-utils";

interface NowMarkerProps {
  time: string;
  timezone?: string;
  /** User preference: time format (12h or 24h) */
  timeFormat?: TimeFormat;
}

export function NowMarker({
  time,
  timezone,
  timeFormat = "12h",
}: NowMarkerProps): React.JSX.Element {
  return (
    <Card
      id="now-marker"
      className="relative scroll-mt-10 overflow-hidden border-amber-200/50 bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 shadow-lg"
    >
      {/* Animated glow effect */}
      <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-amber-200/20 via-orange-200/30 to-rose-200/20" />

      <CardContent className="relative flex items-center gap-4 py-4">
        {/* Pulsing beacon */}
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
          <div className="absolute h-11 w-11 animate-ping rounded-full bg-amber-400/30" />
          <div className="absolute h-9 w-9 animate-pulse rounded-full bg-amber-400/40" />
          <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg ring-2 shadow-amber-500/25 ring-amber-300/50">
            <MapPin className="h-5 w-5 text-white" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-amber-900">You are here</p>
          <p className="text-sm text-amber-700">Current time in your journey</p>
        </div>

        <Badge className="shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 font-semibold text-white shadow-sm hover:from-amber-500 hover:to-orange-500">
          {formatTimeWithTimezone(time, timezone, undefined, timeFormat)}
        </Badge>
      </CardContent>
    </Card>
  );
}
