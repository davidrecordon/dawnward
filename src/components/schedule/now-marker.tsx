"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import { formatTime } from "@/lib/intervention-utils";

interface NowMarkerProps {
  time: string;
}

export function NowMarker({ time }: NowMarkerProps) {
  return (
    <Card
      id="now-marker"
      className="relative overflow-hidden bg-gradient-to-r from-amber-50 via-orange-50 to-rose-50 border-amber-200/50 shadow-lg scroll-mt-10"
    >
      {/* Animated glow effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-amber-200/20 via-orange-200/30 to-rose-200/20 animate-pulse" />

      <CardContent className="relative flex items-center gap-4 py-4">
        {/* Pulsing beacon */}
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
          <div className="absolute h-11 w-11 rounded-full bg-amber-400/30 animate-ping" />
          <div className="absolute h-9 w-9 rounded-full bg-amber-400/40 animate-pulse" />
          <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 ring-2 ring-amber-300/50 shadow-lg shadow-amber-500/25">
            <MapPin className="h-5 w-5 text-white" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-amber-900">You are here</p>
          <p className="text-sm text-amber-700">Current time in your journey</p>
        </div>

        <Badge className="shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-500 hover:to-orange-500 text-white font-semibold shadow-sm">
          {formatTime(time)}
        </Badge>
      </CardContent>
    </Card>
  );
}
