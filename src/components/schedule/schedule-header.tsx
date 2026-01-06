"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Compass, Plane } from "lucide-react";
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
}

function getRelativeTimeText(startDate: string): string {
  const start = new Date(startDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = start.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays < 7) return `in ${diffDays} days`;
  if (diffDays < 14) return "in about a week";
  if (diffDays < 21) return "in about two weeks";
  if (diffDays < 28) return "in about three weeks";
  return `in ${Math.round(diffDays / 7)} weeks`;
}

export function ScheduleHeader({
  schedule,
  isPreTrip,
  scheduleStartDate,
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

  const relativeTime = scheduleStartDate
    ? getRelativeTimeText(scheduleStartDate)
    : "";

  return (
    <Card className="bg-white/90 backdrop-blur-sm border-white/50 shadow-sm overflow-hidden">
      {/* Decorative top gradient */}
      <div className="h-1 bg-gradient-to-r from-sky-400 via-indigo-400 to-violet-400" />

      <CardContent className="py-5">
        <div className="flex items-center justify-between gap-6">
          {/* Left column - trip info */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-slate-800 tracking-tight">
                {request.origin.code}
              </span>
              <div className="flex items-center gap-1.5 text-slate-400">
                <div className="w-8 h-px bg-slate-300" />
                <Plane className="h-4 w-4" />
                <div className="w-8 h-px bg-slate-300" />
              </div>
              <span className="text-2xl font-bold text-slate-800 tracking-tight">
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

          {/* Right column - contextual message */}
          {isPreTrip && scheduleStartDate && (
            <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 shadow-md shadow-sky-500/20">
                <Compass className="h-5 w-5 text-white" />
              </div>
              <div className="text-right">
                <p className="font-semibold text-slate-700">
                  Your journey awaits
                </p>
                <p className="text-sm text-slate-500">
                  Schedule begins {relativeTime}
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
