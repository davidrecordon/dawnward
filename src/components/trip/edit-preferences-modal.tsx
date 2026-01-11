"use client";

import * as React from "react";
import { Coffee, Pill, Gauge, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { ScheduleResponse } from "@/types/schedule";

type ScheduleIntensity = "gentle" | "balanced" | "aggressive";

interface TripPreferences {
  usesCaffeine: boolean;
  usesMelatonin: boolean;
  scheduleIntensity: string;
}

interface EditPreferencesModalProps {
  open: boolean;
  onClose: () => void;
  tripId: string;
  currentPreferences: TripPreferences;
  onPreferencesUpdated: (
    newSchedule: ScheduleResponse,
    updatedPreferences: TripPreferences
  ) => void;
}

const intensityOptions: { value: ScheduleIntensity; label: string }[] = [
  { value: "gentle", label: "Gentle" },
  { value: "balanced", label: "Balanced" },
  { value: "aggressive", label: "Aggressive" },
];

export function EditPreferencesModal({
  open,
  onClose,
  tripId,
  currentPreferences,
  onPreferencesUpdated,
}: EditPreferencesModalProps) {
  const [usesCaffeine, setUsesCaffeine] = React.useState(
    currentPreferences.usesCaffeine
  );
  const [usesMelatonin, setUsesMelatonin] = React.useState(
    currentPreferences.usesMelatonin
  );
  const [scheduleIntensity, setScheduleIntensity] =
    React.useState<ScheduleIntensity>(
      currentPreferences.scheduleIntensity as ScheduleIntensity
    );
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset state when modal opens with new preferences
  React.useEffect(() => {
    if (open) {
      setUsesCaffeine(currentPreferences.usesCaffeine);
      setUsesMelatonin(currentPreferences.usesMelatonin);
      setScheduleIntensity(
        currentPreferences.scheduleIntensity as ScheduleIntensity
      );
      setError(null);
    }
  }, [open, currentPreferences]);

  const hasChanges =
    usesCaffeine !== currentPreferences.usesCaffeine ||
    usesMelatonin !== currentPreferences.usesMelatonin ||
    scheduleIntensity !== currentPreferences.scheduleIntensity;

  const handleSave = async () => {
    if (!hasChanges) {
      onClose();
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/trips/${tripId}/preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usesCaffeine,
          usesMelatonin,
          scheduleIntensity,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update preferences");
      }

      const result = await response.json();
      onPreferencesUpdated(result.schedule, {
        usesCaffeine,
        usesMelatonin,
        scheduleIntensity,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update preferences"
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="overflow-hidden border-0 bg-white p-0 shadow-xl sm:max-w-md"
      >
        {/* Gradient accent bar */}
        <div
          className="h-1.5 w-full"
          style={{
            background:
              "linear-gradient(90deg, #3B9CC9 0%, #7DBB9C 50%, #E8B456 100%)",
          }}
        />

        <div className="px-6 pt-5 pb-6">
          <DialogHeader className="gap-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-50">
              <Gauge className="h-6 w-6 text-sky-600" />
            </div>
            <DialogTitle className="text-center text-xl tracking-tight">
              Edit Schedule Preferences
            </DialogTitle>
            <DialogDescription className="text-center text-slate-600">
              Changing preferences will regenerate your schedule with new
              recommendations.
            </DialogDescription>
          </DialogHeader>

          {/* Preference toggles */}
          <div className="mt-6 space-y-3">
            {/* Melatonin toggle */}
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                  <Pill className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Include melatonin</p>
                  <p className="text-xs text-slate-500">
                    Low-dose supplements for sleep timing
                  </p>
                </div>
              </div>
              <Switch
                checked={usesMelatonin}
                onCheckedChange={setUsesMelatonin}
                aria-label="Include melatonin"
              />
            </div>

            {/* Caffeine toggle */}
            <div className="flex items-center justify-between rounded-lg bg-orange-50 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100">
                  <Coffee className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Include caffeine</p>
                  <p className="text-xs text-slate-500">
                    Strategic timing for alertness
                  </p>
                </div>
              </div>
              <Switch
                checked={usesCaffeine}
                onCheckedChange={setUsesCaffeine}
                aria-label="Include caffeine"
              />
            </div>

            {/* Intensity selector */}
            <div className="rounded-lg bg-sky-50 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100">
                  <Gauge className="h-4 w-4 text-sky-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Schedule intensity</p>
                  <p className="text-xs text-slate-500">
                    How aggressively to shift your schedule
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                {intensityOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setScheduleIntensity(option.value)}
                    className={cn(
                      "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      scheduleIntensity === option.value
                        ? "bg-sky-500 text-white"
                        : "bg-white text-slate-700 hover:bg-sky-100"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <p className="mt-4 text-center text-sm text-red-600">{error}</p>
          )}

          <DialogFooter className="mt-6 gap-3 sm:gap-3">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className="flex-1 bg-sky-500 text-white hover:bg-sky-600"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Schedule"
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
