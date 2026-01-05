"use client";

import * as React from "react";
import { Calendar } from "lucide-react";

import { TripForm } from "@/components/trip-form";
import { TripPreviewCard } from "@/components/trip-preview-card";
import { defaultFormState, type TripFormState } from "@/types/trip-form";

export function TripPlanner() {
  const [formState, setFormState] = React.useState<TripFormState>(defaultFormState);

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
        <div className="bg-white/50 rounded-xl border-2 border-dashed border-slate-200 p-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100">
            <Calendar className="h-6 w-6 text-orange-500" />
          </div>
          <p className="font-medium">Sync to Google Calendar</p>
          <p className="text-sm text-slate-500 mb-3">
            Get reminders pushed directly to your calendar
          </p>
          <button className="px-4 py-1.5 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
            Connect Calendar
          </button>
        </div>

        {/* How it works */}
        <div className="p-4 rounded-xl bg-white/60 border border-purple-100">
          <p className="text-sm font-medium text-purple-700 mb-1">How it works</p>
          <p className="text-xs text-slate-500 leading-relaxed">
            Dawnward uses the Forger-Jewett-Kronauer circadian model to
            calculate optimal light exposure, melatonin timing, and caffeine
            windows based on your specific flight and sleep patterns.
          </p>
        </div>
      </div>
    </div>
  );
}
