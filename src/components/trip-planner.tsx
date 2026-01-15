"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Calendar } from "lucide-react";

import { TripForm } from "@/components/trip-form";
import { TripPreviewCard } from "@/components/trip-preview-card";
import { PreferencesSaveModal } from "@/components/preferences-save-modal";
import { defaultFormState, type TripFormState } from "@/types/trip-form";
import { getFormState, saveFormState } from "@/lib/schedule-storage";
import type { UserPreferences } from "@/types/user-preferences";

/** Save trip to database and return the trip ID */
async function saveTripToDb(formState: TripFormState): Promise<string> {
  const response = await fetch("/api/trips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin_tz: formState.origin?.tz,
      dest_tz: formState.destination?.tz,
      departure_datetime: formState.departureDateTime,
      arrival_datetime: formState.arrivalDateTime,
      prep_days: formState.prepDays,
      wake_time: formState.wakeTime,
      sleep_time: formState.sleepTime,
      uses_melatonin: formState.useMelatonin,
      uses_caffeine: formState.useCaffeine,
      uses_exercise: formState.useExercise,
      nap_preference: formState.napPreference,
      schedule_intensity: formState.scheduleIntensity,
      route_label:
        formState.origin?.code && formState.destination?.code
          ? `${formState.origin.code} → ${formState.destination.code}`
          : undefined,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to save trip");
  }

  const { id } = await response.json();
  return id;
}

/** All preference field keys (for loading from user settings) */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used for PreferenceKey type derivation
const PREFERENCE_FIELDS = [
  "wakeTime",
  "sleepTime",
  "prepDays",
  "useMelatonin",
  "useCaffeine",
  "useExercise",
  "napPreference",
  "scheduleIntensity",
] as const;

/** Preference fields that can be saved as defaults (excludes trip-specific settings) */
const SAVEABLE_PREFERENCE_FIELDS = [
  "wakeTime",
  "sleepTime",
  "useMelatonin",
  "useCaffeine",
  "useExercise",
  "napPreference",
] as const;

type PreferenceKey = (typeof PREFERENCE_FIELDS)[number];
type SaveablePreferenceKey = (typeof SAVEABLE_PREFERENCE_FIELDS)[number];

/** Extract only preference fields from form state (for loading) */
function extractPreferences(
  form: TripFormState
): Pick<TripFormState, PreferenceKey> {
  return {
    wakeTime: form.wakeTime,
    sleepTime: form.sleepTime,
    prepDays: form.prepDays,
    useMelatonin: form.useMelatonin,
    useCaffeine: form.useCaffeine,
    useExercise: form.useExercise,
    napPreference: form.napPreference,
    scheduleIntensity: form.scheduleIntensity,
  };
}

/** Extract saveable preferences (excludes trip-specific prepDays and scheduleIntensity) */
function extractSaveablePreferences(
  form: TripFormState
): Pick<TripFormState, SaveablePreferenceKey> {
  return {
    wakeTime: form.wakeTime,
    sleepTime: form.sleepTime,
    useMelatonin: form.useMelatonin,
    useCaffeine: form.useCaffeine,
    useExercise: form.useExercise,
    napPreference: form.napPreference,
  };
}

/** Check if any saveable preference has changed from the original */
function haveSaveablePreferencesChanged(
  current: Pick<TripFormState, PreferenceKey>,
  original: Pick<TripFormState, PreferenceKey> | null
): boolean {
  if (!original) return false;
  return SAVEABLE_PREFERENCE_FIELDS.some(
    (key) => current[key] !== original[key]
  );
}

/** Map database preferences to form state preferences */
function mapDbToForm(db: UserPreferences): Pick<TripFormState, PreferenceKey> {
  return {
    wakeTime: db.defaultWakeTime,
    sleepTime: db.defaultSleepTime,
    prepDays: db.defaultPrepDays,
    useMelatonin: db.usesMelatonin,
    useCaffeine: db.usesCaffeine,
    useExercise: db.usesExercise,
    napPreference: db.napPreference as TripFormState["napPreference"],
    scheduleIntensity:
      db.scheduleIntensity as TripFormState["scheduleIntensity"],
  };
}

export function TripPlanner() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [formState, setFormState] =
    React.useState<TripFormState>(defaultFormState);
  const [isHydrated, setIsHydrated] = React.useState(false);
  const [showSaveModal, setShowSaveModal] = React.useState(false);
  const [hasShownModal, setHasShownModal] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Track the user's saved preferences (null if not signed in or not loaded)
  const [savedPreferences, setSavedPreferences] = React.useState<Pick<
    TripFormState,
    PreferenceKey
  > | null>(null);

  // Load saved form state on mount, merging with defaults for any missing fields
  React.useEffect(() => {
    const saved = getFormState();
    if (saved) {
      // Merge with defaults to handle old data missing new fields (e.g., napPreference)
      setFormState({ ...defaultFormState, ...saved });
    }
    setIsHydrated(true);
  }, []);

  // Fetch user preferences when signed in
  // Use session?.user?.id as primitive dependency to avoid re-runs on object recreation
  const userId = session?.user?.id;
  React.useEffect(() => {
    async function fetchPreferences() {
      if (status !== "authenticated" || !userId) return;

      try {
        const res = await fetch("/api/user/preferences");
        if (res.ok) {
          const data: UserPreferences = await res.json();
          const prefs = mapDbToForm(data);
          setSavedPreferences(prefs);

          // Merge user preferences with form state (preferences override, trip details preserved)
          setFormState((prev) => ({
            ...prev,
            ...prefs,
          }));
        }
      } catch {
        // Silently fail - use defaults
      }
    }

    if (isHydrated && status === "authenticated") {
      fetchPreferences();
    }
  }, [isHydrated, status, userId]);

  // Save form state when it changes (after hydration)
  React.useEffect(() => {
    if (isHydrated) {
      saveFormState(formState);
    }
  }, [formState, isHydrated]);

  // Save trip to database and navigate to schedule view
  const navigateToSchedule = React.useCallback(async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const tripId = await saveTripToDb(formState);
      router.push(`/trip/${tripId}`);
    } catch (error) {
      console.error("Failed to save trip:", error);
      setIsSubmitting(false);
    }
  }, [formState, router, isSubmitting]);

  // Handle form submission - check if saveable preferences changed
  const handleSubmit = () => {
    // If user is signed in and saveable preferences changed, show save modal
    if (
      status === "authenticated" &&
      savedPreferences &&
      !hasShownModal &&
      haveSaveablePreferencesChanged(
        extractPreferences(formState),
        savedPreferences
      )
    ) {
      setShowSaveModal(true);
      return;
    }

    // Otherwise, save to DB and navigate
    navigateToSchedule();
  };

  // Handle modal close (either save or skip)
  const handleModalClose = (saved: boolean) => {
    setShowSaveModal(false);
    setHasShownModal(true);

    if (saved) {
      // Update saved preferences so we don't show modal again for same values
      setSavedPreferences(extractPreferences(formState));
    }

    // Save to DB and navigate to schedule view
    navigateToSchedule();
  };

  return (
    <>
      <div className="grid gap-6 md:grid-cols-[1fr_340px]">
        {/* Left column: Form */}
        <TripForm
          formState={formState}
          onFormChange={setFormState}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          isSignedIn={status === "authenticated"}
        />

        {/* Right column: Preview cards */}
        <div className="space-y-6">
          {/* Trip Preview */}
          <TripPreviewCard
            origin={formState.origin}
            destination={formState.destination}
            departureDateTime={formState.departureDateTime}
            arrivalDateTime={formState.arrivalDateTime}
            prepDays={formState.prepDays}
          />

          {/* Calendar Sync Preview */}
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white/50 p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100">
              <Calendar className="h-6 w-6 text-orange-500" />
            </div>
            <p className="font-medium">Google Calendar Sync</p>
            <p className="text-sm text-slate-500">
              After generating your schedule, you can sync it to Google Calendar
              for automatic reminders
            </p>
          </div>

          {/* How it works */}
          <div className="rounded-xl border border-purple-100 bg-white/60 p-4">
            <p className="mb-1 text-sm font-medium text-purple-700">
              How it works
            </p>
            <p className="text-xs leading-relaxed text-slate-500">
              Dawnward uses the Forger-Jewett-Kronauer circadian model to
              calculate optimal light exposure, melatonin timing, and caffeine
              windows based on your specific flight and sleep patterns.
            </p>
          </div>
        </div>
      </div>

      {/* Save Preferences Modal */}
      <PreferencesSaveModal
        open={showSaveModal}
        onClose={handleModalClose}
        preferences={extractSaveablePreferences(formState)}
      />
    </>
  );
}
