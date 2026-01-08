"use client";

import * as React from "react";
import { Calendar } from "lucide-react";

import { TripForm } from "@/components/trip-form";
import { TripPreviewCard } from "@/components/trip-preview-card";
import { defaultFormState, type TripFormState } from "@/types/trip-form";
import { getFormState, saveFormState } from "@/lib/schedule-storage";

export function TripPlanner() {
  const [formState, setFormState] =
    React.useState<TripFormState>(defaultFormState);
  const [isHydrated, setIsHydrated] = React.useState(false);

  // Load saved form state on mount, merging with defaults for any missing fields
  React.useEffect(() => {
    const saved = getFormState();
    if (saved) {
      // Merge with defaults to handle old data missing new fields (e.g., napPreference)
      setFormState({ ...defaultFormState, ...saved });
    }
    setIsHydrated(true);
  }, []);

  // Save form state when it changes (after hydration)
  React.useEffect(() => {
    if (isHydrated) {
      saveFormState(formState);
    }
  }, [formState, isHydrated]);

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_340px]">
      {/* Left column: Form */}
      <TripForm formState={formState} onFormChange={setFormState} />

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

        {/* Calendar Sync */}
        <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white/50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100">
            <Calendar className="h-6 w-6 text-orange-500" />
          </div>
          <p className="font-medium">Sync to Google Calendar</p>
          <p className="mb-3 text-sm text-slate-500">
            Get reminders pushed directly to your calendar
          </p>
          <button className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-50">
            Connect Calendar
          </button>
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
  );
}
