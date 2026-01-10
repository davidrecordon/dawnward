"use client";

import * as React from "react";
import { Activity, Coffee, Gauge, Moon, Pill, Clock } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PreferenceToggle } from "@/components/preference-toggle";
import { PreferenceSelector } from "@/components/preference-selector";
import { PrepDaysSlider } from "@/components/prep-days-slider";
import { TimeSelect } from "@/components/ui/time-select";
import { useSaveStatus } from "@/components/save-status-context";

interface UserPreferences {
  defaultWakeTime: string;
  defaultSleepTime: string;
  defaultPrepDays: number;
  usesMelatonin: boolean;
  usesCaffeine: boolean;
  usesExercise: boolean;
  napPreference: string;
  scheduleIntensity: string;
}

interface SettingsFormProps {
  initialPreferences: UserPreferences;
}

export function SettingsForm({ initialPreferences }: SettingsFormProps) {
  const [preferences, setPreferences] =
    React.useState<UserPreferences>(initialPreferences);
  const { setStatus } = useSaveStatus();
  const initialRef = React.useRef(initialPreferences);

  const updateField = <K extends keyof UserPreferences>(
    field: K,
    value: UserPreferences[K]
  ) => {
    setPreferences((prev) => ({ ...prev, [field]: value }));
  };

  // Auto-save with debounce when preferences change
  React.useEffect(() => {
    // Only save if preferences actually changed from initial
    if (JSON.stringify(preferences) === JSON.stringify(initialRef.current)) {
      return;
    }

    setStatus("saving");

    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch("/api/user/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(preferences),
        });

        if (res.ok) {
          setStatus("saved");
          // Reset to idle after showing "saved" briefly
          setTimeout(() => setStatus("idle"), 1500);
        } else {
          setStatus("idle");
        }
      } catch {
        setStatus("idle");
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [preferences, setStatus]);

  return (
    <div className="space-y-6">
      {/* Sleep Schedule */}
      <Card className="bg-white/90 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">Sleep Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Clock className="h-4 w-4 text-slate-500" />
                Usual wake time
              </div>
              <TimeSelect
                value={preferences.defaultWakeTime}
                onChange={(val) => updateField("defaultWakeTime", val)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Moon className="h-4 w-4 text-slate-500" />
                Usual bedtime
              </div>
              <TimeSelect
                value={preferences.defaultSleepTime}
                onChange={(val) => updateField("defaultSleepTime", val)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Options */}
      <Card className="bg-white/90 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">Schedule Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <PreferenceSelector
            icon={<Moon className="h-4 w-4" />}
            title="Nap preference"
            description="Strategic napping in your schedule"
            value={preferences.napPreference}
            onValueChange={(val) => updateField("napPreference", val)}
            options={[
              { value: "no", label: "No" },
              { value: "flight_only", label: "On flight" },
              { value: "all_days", label: "All days" },
            ]}
            colorScheme="purple"
          />

          <PreferenceSelector
            icon={<Gauge className="h-4 w-4" />}
            title="Schedule intensity"
            description="How aggressively to shift your rhythm"
            value={preferences.scheduleIntensity}
            onValueChange={(val) => updateField("scheduleIntensity", val)}
            options={[
              { value: "gentle", label: "Gentle" },
              { value: "balanced", label: "Balanced" },
              { value: "aggressive", label: "Aggressive" },
            ]}
            colorScheme="sky"
          />

          <PrepDaysSlider
            value={preferences.defaultPrepDays}
            onValueChange={(value) => updateField("defaultPrepDays", value)}
          />
        </CardContent>
      </Card>

      {/* Intervention Preferences */}
      <Card className="bg-white/90 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-lg">Intervention Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <PreferenceToggle
            icon={<Pill className="h-4 w-4" />}
            title="Include melatonin"
            description="Low-dose timed supplements (0.5mg)"
            checked={preferences.usesMelatonin}
            onCheckedChange={(val) => updateField("usesMelatonin", val)}
            colorScheme="emerald"
          />

          <PreferenceToggle
            icon={<Coffee className="h-4 w-4" />}
            title="Strategic caffeine"
            description="Optimal coffee and tea timing"
            checked={preferences.usesCaffeine}
            onCheckedChange={(val) => updateField("usesCaffeine", val)}
            colorScheme="orange"
          />

          <PreferenceToggle
            icon={<Activity className="h-4 w-4" />}
            title="Include exercise"
            description="Workout windows to support adaptation"
            checked={preferences.usesExercise}
            onCheckedChange={(val) => updateField("usesExercise", val)}
            colorScheme="sky"
          />
        </CardContent>
      </Card>
    </div>
  );
}
