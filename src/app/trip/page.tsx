"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Calendar, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFormState } from "@/lib/schedule-storage";
import {
  getCurrentDayNumber,
  isBeforeSchedule,
  isAfterSchedule,
} from "@/lib/time-utils";
import { getDayLabel, formatShortDate } from "@/lib/intervention-utils";
import { mergePhasesByDate } from "@/lib/schedule-utils";
import { DaySection } from "@/components/schedule/day-section";
import { ScheduleHeader } from "@/components/schedule/schedule-header";
import {
  PostTripCard,
  ScheduleNotFoundCard,
} from "@/components/schedule/journey-states";
import type { ScheduleResponse } from "@/types/schedule";
import type { TripFormState } from "@/types/trip-form";
import type { Airport } from "@/types/airport";

// The request with guaranteed non-null airports (validated before API call)
interface ResolvedRequest extends Omit<
  TripFormState,
  "origin" | "destination"
> {
  origin: Airport;
  destination: Airport;
}

interface GeneratedSchedule {
  request: ResolvedRequest;
  schedule: ScheduleResponse;
}

export default function TripPage() {
  const [data, setData] = useState<GeneratedSchedule | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function generateSchedule() {
      const formState = getFormState();

      if (!formState || !formState.origin || !formState.destination) {
        setError(
          "No trip details found. Please go back and fill out the form."
        );
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/schedule/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin_tz: formState.origin.tz,
            dest_tz: formState.destination.tz,
            departure_datetime: formState.departureDateTime,
            arrival_datetime: formState.arrivalDateTime,
            prep_days: formState.prepDays,
            wake_time: formState.wakeTime,
            sleep_time: formState.sleepTime,
            uses_melatonin: formState.useMelatonin,
            uses_caffeine: formState.useCaffeine,
            uses_exercise: formState.useExercise,
            nap_preference: formState.napPreference,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to generate schedule");
        }

        const result: { id: string; schedule: ScheduleResponse } =
          await response.json();

        // At this point we know origin and destination are not null (checked above)
        setData({
          request: {
            ...formState,
            origin: formState.origin!,
            destination: formState.destination!,
          },
          schedule: result.schedule,
        });
      } catch (err) {
        console.error("Schedule generation error:", err);
        setError(
          err instanceof Error ? err.message : "Failed to generate schedule"
        );
      } finally {
        setIsLoading(false);
      }
    }

    generateSchedule();
  }, []);

  // Auto-scroll to "now" marker if we're in the middle of the trip
  useEffect(() => {
    if (!data || isLoading) return;

    const preTrip = isBeforeSchedule(data);
    const postTrip = isAfterSchedule(data);

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
  }, [data, isLoading]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
          <p className="text-slate-600">Generating your schedule...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="space-y-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back Home
          </Link>
          <ScheduleNotFoundCard message={error} />
        </div>
      </div>
    );
  }

  const { request, schedule: sched } = data;
  const currentDayNumber = getCurrentDayNumber(data);
  const isPreTrip = isBeforeSchedule(data);
  const isPostTrip = isAfterSchedule(data);
  const firstDayDate = sched.interventions[0]?.date;

  // Merge phases that share the same date (V2 scheduler can have multiple phases per day)
  const mergedDays = mergePhasesByDate(sched.interventions);

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
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back Home
        </Link>

        {/* Sign-in prompt banner */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 p-4 text-white shadow-lg shadow-indigo-500/20">
          {/* Decorative shapes */}
          <div className="absolute top-0 right-0 h-32 w-32 translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10" />
          <div className="absolute bottom-0 left-0 h-24 w-24 -translate-x-1/2 translate-y-1/2 rounded-full bg-white/5" />

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
              className="border-0 bg-white/20 text-white backdrop-blur-sm hover:bg-white/30"
            >
              Sign in
            </Button>
          </div>
        </div>

        {/* Trip header */}
        <ScheduleHeader
          schedule={data}
          isPreTrip={isPreTrip}
          scheduleStartDate={firstDayDate}
        />

        {/* Day navigation buttons */}
        <div className="-mb-4 flex flex-wrap justify-center gap-2 pb-2">
          {mergedDays.map((daySchedule) => {
            const isCurrentDay = daySchedule.day === currentDayNumber;
            return (
              <button
                key={daySchedule.day}
                onClick={() => {
                  document
                    .getElementById(`day-${daySchedule.day}`)
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                className={`group flex-shrink-0 cursor-pointer rounded-lg px-4 py-2 text-center transition-all duration-200 ${
                  isCurrentDay
                    ? "bg-white shadow-md ring-2 ring-sky-500/40"
                    : "bg-white/60 hover:-translate-y-0.5 hover:bg-white hover:shadow-md active:translate-y-0"
                }`}
              >
                <div
                  className={`text-xs font-semibold transition-colors ${
                    isCurrentDay
                      ? "text-sky-600"
                      : "text-slate-600 group-hover:text-slate-900"
                  }`}
                >
                  {getDayLabel(daySchedule.day, daySchedule.hasSameDayArrival)}
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
          {mergedDays.map((daySchedule) => (
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
          <Button className="flex-1 bg-sky-500 shadow-lg shadow-sky-500/20 hover:bg-sky-600">
            Sign in to Save
          </Button>
        </div>
      </div>
    </div>
  );
}
