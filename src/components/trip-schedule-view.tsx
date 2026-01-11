"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Calendar, Loader2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DaySection } from "@/components/schedule/day-section";
import { ScheduleHeader } from "@/components/schedule/schedule-header";
import {
  PostTripCard,
  ScheduleNotFoundCard,
} from "@/components/schedule/journey-states";
import { SignInPrompt } from "@/components/auth/sign-in-prompt";
import { ShareButton } from "@/components/share-button";
import { CalendarComingSoonModal } from "@/components/calendar-coming-soon-modal";
import { getDayLabel, formatShortDate } from "@/lib/intervention-utils";
import { mergePhasesByDate } from "@/lib/schedule-utils";
import {
  getCurrentDayNumber,
  isBeforeSchedule,
  isAfterSchedule,
} from "@/lib/time-utils";
import type { ScheduleResponse } from "@/types/schedule";
import type { TripData } from "@/types/trip-data";

interface TripScheduleViewProps {
  tripId: string;
  tripData: TripData;
  isOwner: boolean;
  isLoggedIn: boolean;
  sharerName: string | null;
}

// Minimal airport info for display
interface MinimalAirport {
  code: string;
  name: string;
  city: string;
  country: string;
  tz: string;
}

function timezoneToAirport(
  tz: string,
  routeLabel: string | null,
  position: "origin" | "dest"
): MinimalAirport {
  // Try to extract airport code from route label (e.g., "SFO → NRT")
  if (routeLabel) {
    const parts = routeLabel.split(" → ");
    const code = position === "origin" ? parts[0] : parts[1];
    if (code && code.length === 3) {
      return { code, name: code, city: code, country: "", tz };
    }
  }
  // Fall back to timezone city name
  const tzParts = tz.split("/");
  const city = tzParts[tzParts.length - 1].replace(/_/g, " ");
  return { code: "", name: city, city, country: "", tz };
}

/**
 * Shorten a full name for privacy: "David Recordon" → "David R."
 */
function shortenName(name: string | null): string {
  if (!name) return "a Dawnward user";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1][0];
  return `${firstName} ${lastInitial}.`;
}

export function TripScheduleView({
  tripId,
  tripData,
  isOwner,
  isLoggedIn,
  sharerName,
}: TripScheduleViewProps) {
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCalendarModal, setShowCalendarModal] = useState(false);

  useEffect(() => {
    async function generateSchedule() {
      try {
        const response = await fetch("/api/schedule/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin_tz: tripData.originTz,
            dest_tz: tripData.destTz,
            departure_datetime: tripData.departureDatetime,
            arrival_datetime: tripData.arrivalDatetime,
            prep_days: tripData.prepDays,
            wake_time: tripData.wakeTime,
            sleep_time: tripData.sleepTime,
            uses_melatonin: tripData.usesMelatonin,
            uses_caffeine: tripData.usesCaffeine,
            uses_exercise: tripData.usesExercise,
            nap_preference: tripData.napPreference,
            schedule_intensity: tripData.scheduleIntensity,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to generate schedule");
        }

        const result = await response.json();
        setSchedule(result.schedule);
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
  }, [tripData]);

  // Auto-scroll to "now" marker
  useEffect(() => {
    if (!schedule || isLoading) return;

    const timer = setTimeout(() => {
      const nowMarker = document.getElementById("now-marker");
      if (nowMarker) {
        nowMarker.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [schedule, isLoading]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
          <p className="text-slate-600">Loading schedule...</p>
        </div>
      </div>
    );
  }

  if (error || !schedule) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="space-y-6">
          <Link
            href={isLoggedIn ? "/trips" : "/"}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            {isLoggedIn ? "My Trips" : "Back Home"}
          </Link>
          <ScheduleNotFoundCard message={error} />
        </div>
      </div>
    );
  }

  // Build display data
  const origin = timezoneToAirport(
    tripData.originTz,
    tripData.routeLabel,
    "origin"
  );
  const destination = timezoneToAirport(
    tripData.destTz,
    tripData.routeLabel,
    "dest"
  );

  const departureDate = tripData.departureDatetime.split("T")[0];
  const departureTime = tripData.departureDatetime.split("T")[1];
  const arrivalDate = tripData.arrivalDatetime.split("T")[0];
  const arrivalTime = tripData.arrivalDatetime.split("T")[1];

  const data = {
    request: {
      origin,
      destination,
      departureDateTime: tripData.departureDatetime,
      arrivalDateTime: tripData.arrivalDatetime,
      wakeTime: tripData.wakeTime,
      sleepTime: tripData.sleepTime,
      prepDays: tripData.prepDays,
      useMelatonin: tripData.usesMelatonin,
      useCaffeine: tripData.usesCaffeine,
      useExercise: tripData.usesExercise,
      napPreference: tripData.napPreference,
      scheduleIntensity: tripData.scheduleIntensity,
    },
    schedule,
  };

  const currentDayNumber = getCurrentDayNumber(data);
  const isPreTrip = isBeforeSchedule(data);
  const isPostTrip = isAfterSchedule(data);
  const firstDayDate = schedule.interventions[0]?.date;
  const mergedDays = mergePhasesByDate(schedule.interventions);

  // Form state for share button (matches TripFormState interface)
  const formStateForShare = {
    origin,
    destination,
    departureDateTime: tripData.departureDatetime,
    arrivalDateTime: tripData.arrivalDatetime,
    wakeTime: tripData.wakeTime,
    sleepTime: tripData.sleepTime,
    prepDays: tripData.prepDays,
    useMelatonin: tripData.usesMelatonin,
    useCaffeine: tripData.usesCaffeine,
    useExercise: tripData.usesExercise,
    napPreference: tripData.napPreference,
    scheduleIntensity: tripData.scheduleIntensity,
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="space-y-6">
        {/* Back button */}
        <Link
          href={isLoggedIn ? "/trips" : "/"}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          {isLoggedIn ? "My Trips" : "Back Home"}
        </Link>

        {/* Attribution banner - only for non-owners viewing shared trips */}
        {!isOwner && tripData.code && (
          <div className="flex items-center gap-2 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-700">
            <User className="h-4 w-4" />
            <span>
              {tripData.routeLabel ? `${tripData.routeLabel} · ` : ""}
              Schedule shared by {shortenName(sharerName)}
            </span>
          </div>
        )}

        {/* Top CTA - only for non-owners */}
        {!isOwner && (
          <Link
            href="/"
            className="flex items-center justify-between rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 transition-shadow hover:shadow-md"
          >
            <span className="text-sm font-medium text-slate-700">
              Planning your own trip?
            </span>
            <span className="flex items-center gap-1 text-sm font-medium text-amber-700">
              Create your schedule
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        )}

        {/* Sign-in prompt for anonymous users viewing their own trip */}
        {isOwner && !isLoggedIn && (
          <SignInPrompt callbackUrl={`/trip/${tripId}`} />
        )}

        {/* Schedule header */}
        <ScheduleHeader
          schedule={data}
          isPreTrip={isPreTrip}
          scheduleStartDate={firstDayDate}
        />

        {/* Day navigation */}
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

        {/* Schedule timeline */}
        <div role="region" aria-label="Schedule timeline" className="space-y-2">
          {mergedDays.map((daySchedule) => (
            <DaySection
              key={daySchedule.day}
              daySchedule={daySchedule}
              origin={origin}
              destination={destination}
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

        {/* Footer actions - only for owners */}
        {isOwner && (
          <div className="flex gap-3 pt-4">
            <ShareButton formState={formStateForShare} tripId={tripId} />
            <Button
              variant="outline"
              className="flex-1 bg-white/70"
              onClick={() => setShowCalendarModal(true)}
            >
              <Calendar className="mr-2 h-4 w-4" />
              Add to Calendar
            </Button>
          </div>
        )}

        {/* Bottom CTA - only for non-owners */}
        {!isOwner && (
          <div className="rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 p-6">
            <h3 className="font-semibold text-slate-900">
              Planning your own trip?
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Create a personalized jet lag schedule for your upcoming travel.
            </p>
            <Link href="/">
              <Button className="mt-4 bg-amber-600 hover:bg-amber-700">
                Create Your Schedule
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}

        {/* Calendar Coming Soon Modal */}
        <CalendarComingSoonModal
          open={showCalendarModal}
          onClose={() => setShowCalendarModal(false)}
          isSignedIn={isLoggedIn}
        />
      </div>
    </div>
  );
}
