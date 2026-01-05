"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Calendar, Check, Loader2, Plane, PlaneLanding, PlaneTakeoff } from "lucide-react";
import {
  getSchedule,
  toggleItemCompletion,
  getItemKey,
} from "@/lib/schedule-storage";
import {
  getInterventionStyle,
  formatTime,
  getDayLabel,
  formatShortDate,
} from "@/lib/intervention-utils";
import type { StoredSchedule } from "@/types/schedule";

export default function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [schedule, setSchedule] = useState<StoredSchedule | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeDay, setActiveDay] = useState<number>(0);
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    const stored = getSchedule();
    // Only load if the stored schedule's id matches the URL id
    // This prevents stale data if they regenerate a schedule
    if (stored && stored.id === id) {
      setSchedule(stored);
      setCompletedItems(new Set(stored.completedItems));
      // Set active day to first day in schedule
      if (stored.schedule.interventions.length > 0) {
        setActiveDay(stored.schedule.interventions[0].day);
      }
    }
    setIsLoading(false);
  }, [id]);

  const handleToggleItem = (day: number, time: string, type: string) => {
    const itemKey = getItemKey(day, time, type);
    const updated = toggleItemCompletion(itemKey);
    setCompletedItems(new Set(updated));
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
        </div>
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="space-y-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back Home
          </Link>
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="py-12 text-center">
              <h2 className="text-lg font-semibold text-slate-800">
                Schedule Not Found
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                This schedule may have been deleted or the link is invalid.
              </p>
              <Button asChild className="mt-4">
                <Link href="/">Create a New Schedule</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const { request, schedule: sched } = schedule;
  const activeDaySchedule = sched.interventions.find(
    (d) => d.day === activeDay
  );

  // Calculate today's progress
  const todayItems = activeDaySchedule?.items || [];
  const todayCompletedCount = todayItems.filter((item) =>
    completedItems.has(getItemKey(activeDay, item.time, item.type))
  ).length;

  // Format shift badge
  const shiftSign = sched.direction === "advance" ? "-" : "+";
  const shiftBadgeText = `${shiftSign}${Math.abs(sched.total_shift_hours).toFixed(0)}h ${sched.direction}`;

  // Parse departure and arrival times
  const departureDate = request.departureDateTime.split("T")[0]; // "YYYY-MM-DD"
  const departureTime = request.departureDateTime.split("T")[1]; // "HH:MM"
  const arrivalDate = request.arrivalDateTime.split("T")[0];
  const arrivalTime = request.arrivalDateTime.split("T")[1];

  // Find which schedule days correspond to departure and arrival
  const departureDayNum = sched.interventions.find(d => d.date === departureDate)?.day;
  const arrivalDayNum = sched.interventions.find(d => d.date === arrivalDate)?.day;

  // Check if current day shows departure or arrival
  const showDeparture = activeDay === departureDayNum;
  const showArrival = activeDay === arrivalDayNum;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="space-y-6">
        {/* Back button */}
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back Home
        </Link>

        {/* Sign-in prompt banner */}
        <div className="rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Save your schedule</p>
              <p className="text-sm text-white/80">
                Sign in to sync to Google Calendar and access from any device
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="bg-white/20 hover:bg-white/30 text-white border-0"
            >
              Sign in
            </Button>
          </div>
        </div>

        {/* Trip header */}
        <Card className="bg-white/90 backdrop-blur-sm">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xl font-semibold">
                    {request.origin.code} → {request.destination.code}
                  </span>
                  <Badge variant="secondary">{shiftBadgeText}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {sched.estimated_adaptation_days} days to adapt •{" "}
                  {request.origin.city} to {request.destination.city}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Day tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {sched.interventions.map((daySchedule) => {
            const isActive = daySchedule.day === activeDay;
            return (
              <button
                key={daySchedule.day}
                onClick={() => setActiveDay(daySchedule.day)}
                className={`flex-shrink-0 rounded-lg px-4 py-2 text-center transition-all ${
                  isActive
                    ? "bg-white shadow-sm"
                    : "bg-white/70 hover:bg-white/90"
                }`}
              >
                <div className="text-xs font-medium">
                  {getDayLabel(daySchedule.day)}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {formatShortDate(daySchedule.date)}
                </div>
              </button>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Today&apos;s progress</span>
            <span className="font-medium">
              {todayCompletedCount} / {todayItems.length}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-sky-500 transition-all duration-300"
              style={{
                width:
                  todayItems.length > 0
                    ? `${(todayCompletedCount / todayItems.length) * 100}%`
                    : "0%",
              }}
            />
          </div>
        </div>

        {/* Intervention cards (with flight events in chronological order) */}
        <div className="space-y-3">
          {(() => {
            // Build a combined list of items with flight events
            type ScheduleItem =
              | { kind: "intervention"; time: string; data: typeof activeDaySchedule extends { items: (infer T)[] } | undefined ? T : never; index: number }
              | { kind: "departure"; time: string }
              | { kind: "arrival"; time: string };

            const items: ScheduleItem[] = [];

            // Add interventions
            activeDaySchedule?.items.forEach((intervention, index) => {
              items.push({ kind: "intervention", time: intervention.time, data: intervention, index });
            });

            // Add flight events if on this day
            if (showDeparture) {
              items.push({ kind: "departure", time: departureTime });
            }
            if (showArrival) {
              items.push({ kind: "arrival", time: arrivalTime });
            }

            // Sort by time
            items.sort((a, b) => a.time.localeCompare(b.time));

            return items.map((item, idx) => {
              if (item.kind === "departure") {
                return (
                  <Card key="flight-departure" className="bg-sky-50 border-sky-200">
                    <CardContent className="flex items-center gap-4 py-4">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                        <Plane className="h-5 w-5 text-sky-500" />
                      </div>
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100">
                        <PlaneTakeoff className="h-6 w-6 text-sky-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">Departure from {request.origin.code}</p>
                        <p className="text-sm text-muted-foreground">
                          {request.origin.city} → {request.destination.city}
                        </p>
                      </div>
                      <Badge className="shrink-0 bg-sky-500 hover:bg-sky-500">
                        {formatTime(departureTime)}
                      </Badge>
                    </CardContent>
                  </Card>
                );
              }

              if (item.kind === "arrival") {
                return (
                  <Card key="flight-arrival" className="bg-sky-50 border-sky-200">
                    <CardContent className="flex items-center gap-4 py-4">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                        <Plane className="h-5 w-5 text-sky-500" />
                      </div>
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-100">
                        <PlaneLanding className="h-6 w-6 text-sky-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">Arrival at {request.destination.code}</p>
                        <p className="text-sm text-muted-foreground">
                          Welcome to {request.destination.city}
                        </p>
                      </div>
                      <Badge className="shrink-0 bg-sky-500 hover:bg-sky-500">
                        {formatTime(arrivalTime)}
                      </Badge>
                    </CardContent>
                  </Card>
                );
              }

              // Intervention card
              const intervention = item.data;
              const style = getInterventionStyle(intervention.type);
              const Icon = style.icon;
              const itemKey = getItemKey(activeDay, intervention.time, intervention.type);
              const isCompleted = completedItems.has(itemKey);

              return (
                <Card
                  key={`${intervention.time}-${intervention.type}-${item.index}`}
                  className={`transition-all duration-200 ${
                    isCompleted
                      ? "bg-green-50/50 border-green-200 opacity-60"
                      : "bg-white/90 backdrop-blur-sm"
                  }`}
                >
                  <CardContent className="flex items-center gap-4 py-4">
                    <button
                      onClick={() =>
                        handleToggleItem(activeDay, intervention.time, intervention.type)
                      }
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        isCompleted
                          ? "border-green-500 bg-green-500 text-white"
                          : "border-slate-300 hover:border-green-400"
                      }`}
                    >
                      {isCompleted && <Check className="h-4 w-4" />}
                    </button>
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${style.bgColor}`}
                    >
                      <Icon className={`h-6 w-6 ${style.textColor}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`font-medium ${isCompleted ? "line-through text-slate-500" : ""}`}>
                        {intervention.title}
                      </p>
                      <p className="text-sm text-muted-foreground">{intervention.description}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {formatTime(intervention.time)}
                    </Badge>
                  </CardContent>
                </Card>
              );
            });
          })()}

          {(!activeDaySchedule || activeDaySchedule.items.length === 0) && !showDeparture && !showArrival && (
            <Card className="bg-white/90 backdrop-blur-sm">
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">
                  No interventions scheduled for this day.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1">
            <Calendar className="mr-2 h-4 w-4" />
            Add to Calendar
          </Button>
          <Button className="flex-1 bg-sky-500 hover:bg-sky-600">
            Sign in to Save
          </Button>
        </div>
      </div>
    </div>
  );
}
