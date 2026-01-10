"use client";

import * as React from "react";
import { Settings2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Saveable preferences (excludes trip-specific prepDays and scheduleIntensity) */
interface SaveablePreferences {
  wakeTime: string;
  sleepTime: string;
  useMelatonin: boolean;
  useCaffeine: boolean;
  useExercise: boolean;
  napPreference: string;
}

interface PreferencesSaveModalProps {
  open: boolean;
  onClose: (saved: boolean) => void;
  preferences: SaveablePreferences;
}

/** Map form field names to database field names */
function mapFormToDb(form: SaveablePreferences) {
  return {
    defaultWakeTime: form.wakeTime,
    defaultSleepTime: form.sleepTime,
    usesMelatonin: form.useMelatonin,
    usesCaffeine: form.useCaffeine,
    usesExercise: form.useExercise,
    napPreference: form.napPreference,
  };
}

export function PreferencesSaveModal({
  open,
  onClose,
  preferences,
}: PreferencesSaveModalProps) {
  const [isSaving, setIsSaving] = React.useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mapFormToDb(preferences)),
      });

      if (res.ok) {
        onClose(true);
      } else {
        // On error, still close but indicate not saved
        onClose(false);
      }
    } catch {
      onClose(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    onClose(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleSkip()}>
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
              <Settings2 className="h-6 w-6 text-sky-600" />
            </div>
            <DialogTitle className="text-center text-xl tracking-tight">
              Save as your defaults?
            </DialogTitle>
            <DialogDescription className="text-center text-slate-600">
              You changed your schedule preferences. Save these as your defaults
              for future trips?
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-6 gap-3 sm:gap-3">
            <Button
              variant="ghost"
              onClick={handleSkip}
              disabled={isSaving}
              className="flex-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              Not now
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 bg-sky-500 text-white hover:bg-sky-600"
            >
              {isSaving ? "Saving..." : "Save Defaults"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
