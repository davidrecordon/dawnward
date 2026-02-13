"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Settings2,
  User,
  X,
} from "lucide-react";
import { useMediaQuery, MD_BREAKPOINT_QUERY } from "@/hooks/use-media-query";
import { Button } from "@/components/ui/button";
import { ScheduleHeader } from "@/components/schedule/schedule-header";
import {
  PostTripCard,
  ScheduleNotFoundCard,
} from "@/components/schedule/journey-states";
import { MinimalShiftTips } from "@/components/schedule/minimal-shift-tips";

// Lazy-load DaySection since it's heavy and rendered multiple times
const DaySection = dynamic(
  () => import("@/components/schedule/day-section").then((m) => m.DaySection),
  {
    loading: () => (
      <div className="animate-pulse rounded-lg bg-white/50 p-4">
        <div className="h-20 rounded bg-slate-200/50" />
      </div>
    ),
  }
);
import { SignInPrompt } from "@/components/auth/sign-in-prompt";
import { ShareButton } from "@/components/share-button";
import { CalendarSyncButton } from "@/components/calendar-sync-button";
import { EditPreferencesModal } from "@/components/trip/edit-preferences-modal";
import { RecordActualSheet } from "@/components/trip/record-actual-sheet";
import { useDisplayPreferences } from "@/components/display-preferences-context";
import { getDayLabel, formatShortDate } from "@/lib/intervention-utils";
import { mergePhasesByDate } from "@/lib/schedule-utils";
import { getActualKey, buildActualsMap } from "@/lib/actuals-utils";
import {
  getCurrentDateInTimezone,
  getCurrentDayNumber,
  isAfterSchedule,
} from "@/lib/time-utils";
import type {
  Intervention,
  ScheduleResponse,
  InterventionActual,
  ActualsMap,
} from "@/types/schedule";
import type { TripData } from "@/types/trip-data";

/** How long to show the summary banner before auto-dismissing (ms) */
const SUMMARY_BANNER_DISMISS_MS = 5000;

/** Delay before scrolling to "now" marker to ensure DOM is rendered (ms) */
const SCROLL_TO_NOW_DELAY_MS = 100;

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
  const code = routeLabel?.split(" → ")[position === "origin" ? 0 : 1];
  if (code?.length === 3) {
    return { code, name: code, city: code, country: "", tz };
  }

  // Fall back to timezone city name
  const city = tz.split("/").pop()!.replace(/_/g, " ");
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
  // Get display preferences from context (provided by page-level wrapper)
  const { showDualTimezone } = useDisplayPreferences();

  // On mobile, default to collapsed summaries; on desktop, expand all days
  const isDesktop = useMediaQuery(MD_BREAKPOINT_QUERY);

  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);

  // Track which days are expanded (viewport-driven: desktop=expanded, mobile=collapsed)
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  // For minimal shifts: track if user wants to see full schedule
  const [showFullScheduleForMinimalShift, setShowFullScheduleForMinimalShift] =
    useState(false);

  // Track current preferences (can change after edits)
  const [currentPreferences, setCurrentPreferences] = useState({
    usesCaffeine: tripData.usesCaffeine,
    usesMelatonin: tripData.usesMelatonin,
    usesExercise: tripData.usesExercise,
    napPreference: tripData.napPreference,
    scheduleIntensity: tripData.scheduleIntensity,
  });

  // State for recording actuals
  const [selectedIntervention, setSelectedIntervention] = useState<{
    intervention: Intervention;
    dayOffset: number;
    date: string;
    nestedChildren?: Intervention[];
  } | null>(null);

  // State for actuals (recorded user data)
  const [actuals, setActuals] = useState<ActualsMap>(new Map());
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);

  // Ref to prevent race conditions during recalculation
  const isRecalculatingRef = useRef(false);

  // Toggle day expansion (for summary view mode)
  const toggleDayExpanded = useCallback((day: number) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }, []);

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

  // Handle when actuals are saved - update state and check for recalculation
  // Accepts array to support parent cascade (parent + children saved together)
  const handleActualSaved = async (savedActuals: InterventionActual[]) => {
    // 1. Update actuals map immediately for instant UI feedback
    setActuals((prev) => {
      const next = new Map(prev);
      for (const actual of savedActuals) {
        next.set(
          getActualKey(actual.dayOffset, actual.interventionType),
          actual
        );
      }
      return next;
    });

    // 2. Close the modal
    setSelectedIntervention(null);

    // 3. Check for and auto-apply recalculation (with race condition protection)
    // Skip if another recalculation is already in progress
    if (isRecalculatingRef.current) {
      console.log("Skipping recalculation - another is in progress");
      return;
    }

    try {
      isRecalculatingRef.current = true;

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
          startTransition(() => {
            setSchedule(result.newSchedule);
          });
          setSummaryMessage(
            `Schedule updated: ${result.changes.length} intervention(s) adjusted`
          );
        }
      }
    } catch (err) {
      console.error("Recalculation failed:", err);
    } finally {
      isRecalculatingRef.current = false;
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
          // Use startTransition for non-urgent schedule update
          startTransition(() => {
            setSchedule(storedSchedule);
          });
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
        // Use startTransition for non-urgent schedule update
        startTransition(() => {
          setSchedule(result.schedule);
        });

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

    // Fetch schedule and actuals in parallel for owners
    // Actuals don't depend on schedule content, only on tripId
    loadOrGenerateSchedule();
    if (isOwner && isLoggedIn) {
      fetchActuals();
    }
  }, [tripData, tripId, isOwner, isLoggedIn, fetchActuals]);

  // Auto-dismiss summary message after 5 seconds
  useEffect(() => {
    if (!summaryMessage) return;

    const timer = setTimeout(dismissSummary, SUMMARY_BANNER_DISMISS_MS);
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
    }, SCROLL_TO_NOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [schedule, isLoading]);

  // Initialize expanded days based on viewport when schedule loads or viewport changes.
  // Desktop: all days expanded; Mobile: only today's day expanded.
  useEffect(() => {
    if (!schedule) return;

    if (isDesktop) {
      const allDays = new Set(schedule.interventions.map((d) => d.day));
      setExpandedDays(allDays);
    } else {
      const today = getCurrentDateInTimezone(tripData.originTz);
      const todaySchedule = schedule.interventions.find(
        (d) => d.date === today
      );
      setExpandedDays(todaySchedule ? new Set([todaySchedule.day]) : new Set());
    }
  }, [schedule, isDesktop, tripData.originTz]);

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
  const isPostTrip = isAfterSchedule(data);
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
          tripId={tripId}
          isOwner={isOwner}
          isLoggedIn={isLoggedIn}
          onCustomizeClick={() => setShowEditModal(true)}
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
            // Don't highlight any day when showing minimal shift tips view
            const isShowingTipsOnly =
              schedule.is_minimal_shift && !showFullScheduleForMinimalShift;
            const isCurrentDay =
              !isShowingTipsOnly && daySchedule.day === currentDayNumber;
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

        {/* Minimal shift tips - shown by default for 0-2 hour shifts */}
        {schedule.is_minimal_shift && !showFullScheduleForMinimalShift && (
          <MinimalShiftTips
            shiftMagnitude={schedule.shift_magnitude}
            direction={schedule.direction}
            showFullScheduleOption={true}
            onShowFullSchedule={() => setShowFullScheduleForMinimalShift(true)}
            isFullScheduleVisible={false}
          />
        )}

        {/* Schedule timeline - hidden by default for minimal shifts */}
        {(!schedule.is_minimal_shift || showFullScheduleForMinimalShift) && (
          <>
            {/* Collapse tips option for minimal shifts viewing full schedule */}
            {schedule.is_minimal_shift && showFullScheduleForMinimalShift && (
              <MinimalShiftTips
                shiftMagnitude={schedule.shift_magnitude}
                direction={schedule.direction}
                showFullScheduleOption={true}
                onShowFullSchedule={() =>
                  setShowFullScheduleForMinimalShift(false)
                }
                isFullScheduleVisible={true}
              />
            )}

            <div
              role="region"
              aria-label="Schedule timeline"
              className="space-y-2"
            >
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
                  showDualTimezone={showDualTimezone}
                  isExpanded={expandedDays.has(daySchedule.day)}
                  onExpandChange={() => toggleDayExpanded(daySchedule.day)}
                  onInterventionClick={
                    isOwner && isLoggedIn
                      ? (intervention, dayOffset, date, nestedChildren) =>
                          setSelectedIntervention({
                            intervention,
                            dayOffset,
                            date,
                            nestedChildren,
                          })
                      : undefined
                  }
                />
              ))}
            </div>
          </>
        )}

        {/* Post-trip celebration */}
        {isPostTrip && <PostTripCard />}

        {/* Footer actions - only for owners */}
        {isOwner && (
          <div className="flex gap-3 pt-4">
            <ShareButton formState={formStateForShare} tripId={tripId} />
            <CalendarSyncButton tripId={tripId} />
            {isLoggedIn && (
              <Button
                variant="outline"
                className="bg-white/70"
                onClick={() => setShowEditModal(true)}
              >
                <Settings2 className="h-4 w-4" />
                Customize Trip
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

        {/* Edit Preferences Modal - only for authenticated owners */}
        {isOwner && isLoggedIn && (
          <EditPreferencesModal
            open={showEditModal}
            onClose={() => setShowEditModal(false)}
            tripId={tripId}
            currentPreferences={currentPreferences}
            onPreferencesUpdated={(newSchedule, updatedPreferences) => {
              startTransition(() => {
                setSchedule(newSchedule);
              });
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
            nestedChildren={selectedIntervention.nestedChildren}
          />
        )}
      </div>
    </div>
  );
}
