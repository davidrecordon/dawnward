"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Loader2,
  Settings2,
  User,
  X,
} from "lucide-react";
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
import { EditPreferencesModal } from "@/components/trip/edit-preferences-modal";
import { RecordActualSheet } from "@/components/trip/record-actual-sheet";
import { getDayLabel, formatShortDate } from "@/lib/intervention-utils";
import { mergePhasesByDate } from "@/lib/schedule-utils";
import { getActualKey, buildActualsMap } from "@/lib/actuals-utils";
import {
  getCurrentDayNumber,
  isBeforeSchedule,
  isAfterSchedule,
} from "@/lib/time-utils";
import type {
  Intervention,
  ScheduleResponse,
  InterventionActual,
  ActualsMap,
} from "@/types/schedule";
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
  const [showEditModal, setShowEditModal] = useState(false);

  // Track current preferences (can change after edits)
  const [currentPreferences, setCurrentPreferences] = useState({
    usesCaffeine: tripData.usesCaffeine,
    usesMelatonin: tripData.usesMelatonin,
    scheduleIntensity: tripData.scheduleIntensity,
  });

  // State for recording actuals
  const [selectedIntervention, setSelectedIntervention] = useState<{
    intervention: Intervention;
    dayOffset: number;
    date: string;
  } | null>(null);

  // State for actuals (recorded user data)
  const [actuals, setActuals] = useState<ActualsMap>(new Map());
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);

  // Fetch actuals on mount for authenticated owners
  const fetchActuals = useCallback(async () => {
    if (!isOwner || !isLoggedIn) return;

    try {
      const response = await fetch(`/api/trips/${tripId}/actuals`);
      if (response.ok) {
        const { actuals: fetchedActuals } = await response.json();
        setActuals(buildActualsMap(fetchedActuals));
      }
    } catch (err) {
      console.error("Failed to fetch actuals:", err);
    }
  }, [isOwner, isLoggedIn, tripId]);

  // Handle when an actual is saved - update state and check for recalculation
  const handleActualSaved = async (savedActual: InterventionActual) => {
    // 1. Update actuals map immediately for instant UI feedback
    setActuals((prev) => {
      const next = new Map(prev);
      next.set(
        getActualKey(savedActual.dayOffset, savedActual.interventionType),
        savedActual
      );
      return next;
    });

    // 2. Close the modal
    setSelectedIntervention(null);

    // 3. Check for and auto-apply recalculation
    try {
      const response = await fetch(`/api/trips/${tripId}/recalculate`, {
        method: "POST",
      });

      if (!response.ok) return;

      const result = await response.json();
      if (result.needsRecalculation) {
        // Auto-apply the recalculation
        const applyResponse = await fetch(`/api/trips/${tripId}/recalculate`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newSchedule: result.newSchedule }),
        });

        if (applyResponse.ok) {
          setSchedule(result.newSchedule);
          setSummaryMessage(
            `Schedule updated: ${result.changes.length} intervention(s) adjusted`
          );
        }
      }
    } catch (err) {
      console.error("Recalculation failed:", err);
    }
  };

  // Dismiss the summary banner
  const dismissSummary = useCallback(() => {
    setSummaryMessage(null);
  }, []);

  useEffect(() => {
    async function loadOrGenerateSchedule() {
      try {
        // Use stored schedule if available (prefer currentScheduleJson over initialScheduleJson)
        const storedSchedule =
          tripData.currentScheduleJson || tripData.initialScheduleJson;
        if (storedSchedule) {
          setSchedule(storedSchedule);
          setIsLoading(false);
          return;
        }

        // Generate schedule if not stored
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

        // Save the initial schedule and snapshots for authenticated owners
        if (isOwner && isLoggedIn) {
          try {
            await fetch(`/api/trips/${tripId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                initialScheduleJson: result.schedule,
                snapshots: result.snapshots,
              }),
            });
          } catch (saveErr) {
            // Don't fail the view if save fails - just log it
            console.error("Failed to save initial schedule:", saveErr);
          }
        }
      } catch (err) {
        console.error("Schedule generation error:", err);
        setError(
          err instanceof Error ? err.message : "Failed to generate schedule"
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadOrGenerateSchedule();
  }, [tripData, tripId, isOwner, isLoggedIn]);

  // Fetch actuals once schedule is loaded (for owners)
  useEffect(() => {
    if (schedule && !isLoading && isOwner && isLoggedIn) {
      fetchActuals();
    }
  }, [schedule, isLoading, isOwner, isLoggedIn, fetchActuals]);

  // Auto-dismiss summary message after 5 seconds
  useEffect(() => {
    if (!summaryMessage) return;

    const timer = setTimeout(dismissSummary, 5000);
    return () => clearTimeout(timer);
  }, [summaryMessage, dismissSummary]);

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

  const [departureDate, departureTime] = tripData.departureDatetime.split("T");
  const [arrivalDate, arrivalTime] = tripData.arrivalDatetime.split("T");

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

        {/* Summary banner - shows after actuals are saved and schedule is updated */}
        {summaryMessage && (
          <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <span>{summaryMessage}</span>
            <button
              onClick={dismissSummary}
              className="text-emerald-500 hover:text-emerald-700"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

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
              actuals={actuals}
              onInterventionClick={
                isOwner && isLoggedIn
                  ? (intervention, dayOffset, date) =>
                      setSelectedIntervention({ intervention, dayOffset, date })
                  : undefined
              }
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
            {isLoggedIn && (
              <Button
                variant="outline"
                className="bg-white/70"
                onClick={() => setShowEditModal(true)}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            )}
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

        {/* Edit Preferences Modal - only for authenticated owners */}
        {isOwner && isLoggedIn && (
          <EditPreferencesModal
            open={showEditModal}
            onClose={() => setShowEditModal(false)}
            tripId={tripId}
            currentPreferences={currentPreferences}
            onPreferencesUpdated={(newSchedule, updatedPreferences) => {
              setSchedule(newSchedule);
              setCurrentPreferences(updatedPreferences);
            }}
          />
        )}

        {/* Record Actual Sheet - only for authenticated owners */}
        {isOwner && isLoggedIn && selectedIntervention && (
          <RecordActualSheet
            open={!!selectedIntervention}
            onSave={handleActualSaved}
            onCancel={() => setSelectedIntervention(null)}
            tripId={tripId}
            intervention={selectedIntervention.intervention}
            dayOffset={selectedIntervention.dayOffset}
            date={selectedIntervention.date}
            actual={actuals.get(
              getActualKey(
                selectedIntervention.dayOffset,
                selectedIntervention.intervention.type
              )
            )}
          />
        )}
      </div>
    </div>
  );
}
