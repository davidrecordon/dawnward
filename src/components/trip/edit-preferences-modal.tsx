"use client";

import * as React from "react";
import { Activity, Coffee, Moon, Pill, Gauge, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PreferenceToggle } from "@/components/preference-toggle";
import { PreferenceSelector } from "@/components/preference-selector";
import type { ScheduleResponse } from "@/types/schedule";

type ScheduleIntensity = "gentle" | "balanced" | "aggressive";

interface TripPreferences {
  usesCaffeine: boolean;
  usesMelatonin: boolean;
  usesExercise: boolean;
  napPreference: string;
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
  const [usesExercise, setUsesExercise] = React.useState(
    currentPreferences.usesExercise
  );
  const [napPreference, setNapPreference] = React.useState(
    currentPreferences.napPreference
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
      setUsesExercise(currentPreferences.usesExercise);
      setNapPreference(currentPreferences.napPreference);
      setScheduleIntensity(
        currentPreferences.scheduleIntensity as ScheduleIntensity
      );
      setError(null);
    }
  }, [open, currentPreferences]);

  const hasChanges =
    usesCaffeine !== currentPreferences.usesCaffeine ||
    usesMelatonin !== currentPreferences.usesMelatonin ||
    usesExercise !== currentPreferences.usesExercise ||
    napPreference !== currentPreferences.napPreference ||
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
          usesExercise,
          napPreference,
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
        usesExercise,
        napPreference,
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
              Customize This Trip
            </DialogTitle>
            <DialogDescription className="text-center text-slate-600">
              Changing preferences will regenerate your schedule with new
              recommendations.
            </DialogDescription>
          </DialogHeader>

          {/* Preference toggles */}
          <div className="mt-6 space-y-3">
            <PreferenceToggle
              icon={<Pill className="h-4 w-4" />}
              title="Include melatonin"
              description="Low-dose supplements for sleep timing"
              checked={usesMelatonin}
              onCheckedChange={setUsesMelatonin}
              colorScheme="emerald"
              compact
            />
            <PreferenceToggle
              icon={<Coffee className="h-4 w-4" />}
              title="Include caffeine"
              description="Strategic timing for alertness"
              checked={usesCaffeine}
              onCheckedChange={setUsesCaffeine}
              colorScheme="orange"
              compact
            />
            <PreferenceToggle
              icon={<Activity className="h-4 w-4" />}
              title="Include exercise"
              description="Timed physical activity for circadian shift"
              checked={usesExercise}
              onCheckedChange={setUsesExercise}
              colorScheme="sky"
              compact
            />
            <PreferenceSelector
              icon={<Moon className="h-4 w-4" />}
              title="Recommend naps"
              description="Strategic napping to reduce sleep debt"
              value={napPreference}
              onValueChange={setNapPreference}
              options={[
                { value: "no", label: "No" },
                { value: "flight_only", label: "On the flight" },
                { value: "all_days", label: "On all days" },
              ]}
              colorScheme="violet"
              variant="compact"
            />
            <PreferenceSelector
              icon={<Gauge className="h-4 w-4" />}
              title="Schedule intensity"
              description="How aggressively to shift your schedule"
              value={scheduleIntensity}
              onValueChange={setScheduleIntensity}
              options={intensityOptions}
              colorScheme="sky"
              variant="compact"
            />
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
