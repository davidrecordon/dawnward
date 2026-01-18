"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plane, Settings2 } from "lucide-react";
import type { ScheduleResponse } from "@/types/schedule";
import type { Airport } from "@/types/airport";

interface ScheduleHeaderProps {
  schedule: {
    request: {
      origin: Airport;
      destination: Airport;
    };
    schedule: ScheduleResponse;
  };
  isPreTrip?: boolean;
  scheduleStartDate?: string;
  isOwner?: boolean;
  isLoggedIn?: boolean;
  onCustomizeClick?: () => void;
}

export function ScheduleHeader({
  schedule,
  isOwner,
  isLoggedIn,
  onCustomizeClick,
}: ScheduleHeaderProps) {
  const { request, schedule: sched } = schedule;

  const shiftSign = sched.direction === "advance" ? "-" : "+";
  const directionLabel = sched.direction === "advance" ? "earlier" : "later";
  const shiftBadgeText = `${shiftSign}${Math.abs(sched.total_shift_hours).toFixed(0)}h ${directionLabel}`;

  // Badge color based on direction
  const badgeClass =
    sched.direction === "advance"
      ? "bg-sky-100 text-sky-700 hover:bg-sky-100"
      : "bg-violet-100 text-violet-700 hover:bg-violet-100";

  const showCustomizeButton = isOwner && isLoggedIn && onCustomizeClick;

  return (
    <Card className="overflow-hidden border-white/50 bg-white/90 shadow-sm backdrop-blur-sm">
      {/* Decorative top gradient */}
      <div className="h-1 bg-gradient-to-r from-sky-400 via-indigo-400 to-violet-400" />

      <CardContent className="py-5">
        <div className="flex items-center justify-between gap-6">
          {/* Left column - trip info */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold tracking-tight text-slate-800">
                {request.origin.code}
              </span>
              <div className="flex items-center gap-1.5 text-slate-400">
                <div className="h-px w-8 bg-slate-300" />
                <Plane className="h-4 w-4" />
                <div className="h-px w-8 bg-slate-300" />
              </div>
              <span className="text-2xl font-bold tracking-tight text-slate-800">
                {request.destination.code}
              </span>
              <Badge className={badgeClass}>{shiftBadgeText}</Badge>
            </div>
            <p className="text-sm text-slate-500">
              <span className="font-medium text-slate-600">
                {sched.estimated_adaptation_days} days
              </span>{" "}
              to adapt • {request.origin.city} to {request.destination.city}
            </p>
          </div>

          {/* Right column - customize button for owners */}
          {showCustomizeButton && (
            <Button
              variant="outline"
              className="bg-white/70"
              onClick={onCustomizeClick}
            >
              <Settings2 className="mr-2 h-4 w-4" />
              Customize Trip
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
