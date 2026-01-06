"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Calendar, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSchedule } from "@/lib/schedule-storage";
import {
  getCurrentDayNumber,
  isBeforeSchedule,
  isAfterSchedule,
} from "@/lib/time-utils";
import { getDayLabel, formatShortDate } from "@/lib/intervention-utils";
import { DaySection } from "@/components/schedule/day-section";
import { ScheduleHeader } from "@/components/schedule/schedule-header";
import {
  PostTripCard,
  ScheduleNotFoundCard,
} from "@/components/schedule/journey-states";
import type { StoredSchedule } from "@/types/schedule";

export default function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [schedule, setSchedule] = useState<StoredSchedule | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = getSchedule();
    if (stored && stored.id === id) {
      setSchedule(stored);
    }
    setIsLoading(false);
  }, [id]);

  // Auto-scroll to "now" marker if we're in the middle of the trip
  useEffect(() => {
    if (!schedule || isLoading) return;

    const preTrip = isBeforeSchedule(schedule);
    const postTrip = isAfterSchedule(schedule);

    // Only scroll if we're currently in the trip (not before or after)
    if (!preTrip && !postTrip) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        const nowMarker = document.getElementById("now-marker");
        if (nowMarker) {
          nowMarker.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [schedule, isLoading]);

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
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back Home
          </Link>
          <ScheduleNotFoundCard />
        </div>
      </div>
    );
  }

  const { request, schedule: sched } = schedule;
  const currentDayNumber = getCurrentDayNumber(schedule);
  const isPreTrip = isBeforeSchedule(schedule);
  const isPostTrip = isAfterSchedule(schedule);
  const firstDayDate = sched.interventions[0]?.date;

  // Parse departure and arrival times
  const departureDate = request.departureDateTime.split("T")[0];
  const departureTime = request.departureDateTime.split("T")[1];
  const arrivalDate = request.arrivalDateTime.split("T")[0];
  const arrivalTime = request.arrivalDateTime.split("T")[1];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="space-y-6">
        {/* Back button */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back Home
        </Link>

        {/* Sign-in prompt banner */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 p-4 text-white shadow-lg shadow-indigo-500/20">
          {/* Decorative shapes */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

          <div className="relative flex items-center justify-between">
            <div>
              <p className="font-semibold">Save your schedule</p>
              <p className="text-sm text-white/80">
                Sign in to sync to Google Calendar and access from any device
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm"
            >
              Sign in
            </Button>
          </div>
        </div>

        {/* Trip header */}
        <ScheduleHeader
          schedule={schedule}
          isPreTrip={isPreTrip}
          scheduleStartDate={firstDayDate}
        />

        {/* Day navigation buttons */}
        <div className="flex flex-wrap justify-center gap-2 pb-2 -mb-4">
          {sched.interventions.map((daySchedule) => {
            const isCurrentDay = daySchedule.day === currentDayNumber;
            return (
              <button
                key={daySchedule.day}
                onClick={() => {
                  document
                    .getElementById(`day-${daySchedule.day}`)
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                className={`group flex-shrink-0 rounded-lg px-4 py-2 text-center transition-all duration-200 cursor-pointer ${
                  isCurrentDay
                    ? "bg-white shadow-md ring-2 ring-sky-500/40"
                    : "bg-white/60 hover:bg-white hover:shadow-md hover:-translate-y-0.5 active:translate-y-0"
                }`}
              >
                <div
                  className={`text-xs font-semibold transition-colors ${
                    isCurrentDay
                      ? "text-sky-600"
                      : "text-slate-600 group-hover:text-slate-900"
                  }`}
                >
                  {getDayLabel(daySchedule.day)}
                </div>
                <div
                  className={`text-[10px] transition-colors ${
                    isCurrentDay
                      ? "text-sky-500"
                      : "text-slate-400 group-hover:text-slate-600"
                  }`}
                >
                  {formatShortDate(daySchedule.date)}
                </div>
              </button>
            );
          })}
        </div>

        {/* Journey timeline - all days */}
        <div role="region" aria-label="Schedule timeline" className="space-y-2">
          {sched.interventions.map((daySchedule) => (
            <DaySection
              key={daySchedule.day}
              daySchedule={daySchedule}
              origin={request.origin}
              destination={request.destination}
              departureDate={departureDate}
              departureTime={departureTime}
              arrivalDate={arrivalDate}
              arrivalTime={arrivalTime}
              isCurrentDay={daySchedule.day === currentDayNumber}
            />
          ))}
        </div>

        {/* Post-trip celebration */}
        {isPostTrip && <PostTripCard />}

        {/* Footer actions */}
        <div className="flex gap-3 pt-4">
          <Button variant="outline" className="flex-1 bg-white/70">
            <Calendar className="mr-2 h-4 w-4" />
            Add to Calendar
          </Button>
          <Button className="flex-1 bg-sky-500 hover:bg-sky-600 shadow-lg shadow-sky-500/20">
            Sign in to Save
          </Button>
        </div>
      </div>
    </div>
  );
}
