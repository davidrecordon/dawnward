"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Activity, Calendar, ChevronRight, Coffee, Loader2, MapPin, Pill } from "lucide-react";
import { saveSchedule, getSchedule } from "@/lib/schedule-storage";
import type { ScheduleResponse, StoredSchedule } from "@/types/schedule";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { AirportSelect } from "@/components/airport-select";
import { PreferenceToggle } from "@/components/preference-toggle";
import { FormError } from "@/components/form-error";
import { DateTimeSelect } from "@/components/ui/datetime-select";
import { TimeSelect } from "@/components/ui/time-select";
import type { TripFormState } from "@/types/trip-form";

interface TripFormProps {
  formState: TripFormState;
  onFormChange: (state: TripFormState) => void;
}

interface FormErrors {
  origin?: string;
  destination?: string;
  departureDateTime?: string;
  arrivalDateTime?: string;
  form?: string;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-sm text-[#F4A574] animate-in fade-in slide-in-from-top-1 duration-200">
      {message}
    </p>
  );
}

export function TripForm({ formState, onFormChange }: TripFormProps) {
  const router = useRouter();
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [isLoading, setIsLoading] = React.useState(false);

  const updateField = <K extends keyof TripFormState>(
    field: K,
    value: TripFormState[K]
  ) => {
    onFormChange({ ...formState, [field]: value });

    // Clear the error for this field when user makes a change
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    // Clear form-level errors too when related fields change
    if (
      errors.form &&
      ["origin", "destination", "departureDateTime", "arrivalDateTime"].includes(
        field
      )
    ) {
      setErrors((prev) => ({ ...prev, form: undefined }));
    }
  };

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    // Field-level validation
    if (!formState.origin) {
      newErrors.origin = "Please select a departure airport";
    }
    if (!formState.destination) {
      newErrors.destination = "Please select an arrival airport";
    }
    if (!formState.departureDateTime) {
      newErrors.departureDateTime = "Please select when you depart";
    }
    if (!formState.arrivalDateTime) {
      newErrors.arrivalDateTime = "Please select when you arrive";
    }

    // Cross-field validation
    if (
      formState.origin &&
      formState.destination &&
      formState.origin.code === formState.destination.code
    ) {
      newErrors.form = "Your origin and destination can't be the same airport";
    }

    if (formState.departureDateTime && formState.arrivalDateTime) {
      const dep = new Date(formState.departureDateTime);
      const arr = new Date(formState.arrivalDateTime);
      if (arr <= dep) {
        newErrors.form = "Your arrival time needs to be after departure";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) {
      return;
    }

    // Ensure we have airports (validation should catch this, but TypeScript needs it)
    if (!formState.origin || !formState.destination) {
      return;
    }

    // Check if we already have a schedule with the same inputs (skip in dev for testing)
    if (process.env.NODE_ENV !== "development") {
      const existingSchedule = getSchedule();
      if (existingSchedule) {
        const req = existingSchedule.request;
        const inputsMatch =
          req.origin.code === formState.origin.code &&
          req.destination.code === formState.destination.code &&
          req.departureDateTime === formState.departureDateTime &&
          req.arrivalDateTime === formState.arrivalDateTime &&
          req.prepDays === formState.prepDays &&
          req.wakeTime === formState.wakeTime &&
          req.sleepTime === formState.sleepTime &&
          req.usesMelatonin === formState.useMelatonin &&
          req.usesCaffeine === formState.useCaffeine &&
          req.usesExercise === formState.useExercise;

        if (inputsMatch) {
          // Same inputs - just navigate to existing schedule
          router.push(`/trip/${existingSchedule.id}`);
          return;
        }
      }
    }

    setIsLoading(true);
    setErrors({});

    try {
      const response = await fetch("/api/schedule/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin_tz: formState.origin.tz,
          dest_tz: formState.destination.tz,
          departure_datetime: formState.departureDateTime,
          arrival_datetime: formState.arrivalDateTime,
          prep_days: formState.prepDays,
          wake_time: formState.wakeTime,
          sleep_time: formState.sleepTime,
          uses_melatonin: formState.useMelatonin,
          uses_caffeine: formState.useCaffeine,
          uses_exercise: formState.useExercise,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate schedule");
      }

      const data: { id: string; schedule: ScheduleResponse } = await response.json();

      // Save to localStorage
      const storedSchedule: StoredSchedule = {
        id: data.id,
        createdAt: new Date().toISOString(),
        request: {
          origin: formState.origin,
          destination: formState.destination,
          departureDateTime: formState.departureDateTime,
          arrivalDateTime: formState.arrivalDateTime,
          prepDays: formState.prepDays,
          wakeTime: formState.wakeTime,
          sleepTime: formState.sleepTime,
          usesMelatonin: formState.useMelatonin,
          usesCaffeine: formState.useCaffeine,
          usesExercise: formState.useExercise,
        },
        schedule: data.schedule,
      };

      saveSchedule(storedSchedule);

      // Navigate to trip detail page
      router.push(`/trip/${data.id}`);
    } catch (error) {
      console.error("Schedule generation error:", error);
      setErrors({
        form: error instanceof Error ? error.message : "Failed to generate schedule",
      });
      setIsLoading(false);
    }
  };

  return (
    <Card className="bg-white/90 backdrop-blur-sm border border-slate-200/50">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-xl">
          <MapPin className="h-5 w-5 text-sky-500" />
          Plan Your Trip
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Enter your flight details to generate a personalized schedule
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Form-level error banner */}
        {errors.form && (
          <FormError
            message={errors.form}
            onDismiss={() => setErrors((prev) => ({ ...prev, form: undefined }))}
          />
        )}

        {/* Airport selects */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Departing from</Label>
            <AirportSelect
              value={formState.origin}
              onSelect={(airport) => updateField("origin", airport)}
              placeholder="Select origin..."
              hasError={!!errors.origin}
            />
            <FieldError message={errors.origin} />
          </div>
          <div className="space-y-2">
            <Label>Arriving at</Label>
            <AirportSelect
              value={formState.destination}
              onSelect={(airport) => updateField("destination", airport)}
              placeholder="Select destination..."
              hasError={!!errors.destination}
            />
            <FieldError message={errors.destination} />
          </div>
        </div>

        {/* Datetime pickers */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Departure</Label>
            <DateTimeSelect
              value={formState.departureDateTime}
              onChange={(value) => updateField("departureDateTime", value)}
              hasError={!!errors.departureDateTime}
            />
            <FieldError message={errors.departureDateTime} />
          </div>
          <div className="space-y-2">
            <Label>Arrival</Label>
            <DateTimeSelect
              value={formState.arrivalDateTime}
              onChange={(value) => updateField("arrivalDateTime", value)}
              hasError={!!errors.arrivalDateTime}
            />
            <FieldError message={errors.arrivalDateTime} />
          </div>
        </div>

        <hr className="border-slate-200" />

        {/* Preferences */}
        <div className="space-y-4">
          <h3 className="font-medium text-sm flex items-center gap-2 text-muted-foreground">
            Your Preferences
          </h3>

          <div className="space-y-3">
            <PreferenceToggle
              icon={<Pill className="h-4 w-4" />}
              title="Use melatonin"
              description="Low-dose timed supplements"
              checked={formState.useMelatonin}
              onCheckedChange={(checked) => updateField("useMelatonin", checked)}
              colorScheme="emerald"
            />

            <PreferenceToggle
              icon={<Coffee className="h-4 w-4" />}
              title="Strategic caffeine"
              description="Coffee timing recommendations"
              checked={formState.useCaffeine}
              onCheckedChange={(checked) => updateField("useCaffeine", checked)}
              colorScheme="orange"
            />

            <PreferenceToggle
              icon={<Activity className="h-4 w-4" />}
              title="Include exercise"
              description="Physical activity can help shift rhythms"
              checked={formState.useExercise}
              onCheckedChange={(checked) => updateField("useExercise", checked)}
              colorScheme="sky"
            />

            {/* Prep days slider */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-sky-500" />
                  <Label className="text-sm font-medium">Days before departure</Label>
                </div>
                <span className="text-sm font-semibold text-sky-600">
                  {formState.prepDays} {formState.prepDays === 1 ? "day" : "days"}
                </span>
              </div>
              <Slider
                value={[formState.prepDays]}
                onValueChange={([value]) => updateField("prepDays", value)}
                min={1}
                max={7}
                step={1}
                className="[&_[data-slot=slider-track]]:bg-slate-200 [&_[data-slot=slider-range]]:bg-sky-500 [&_[data-slot=slider-thumb]]:border-sky-500"
              />
              <p className="text-xs text-muted-foreground">
                Start adapting earlier for a gentler transition (auto-adjusts if trip is sooner)
              </p>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Wake/Sleep times */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Usual wake time</Label>
              <TimeSelect
                value={formState.wakeTime}
                onChange={(value) => updateField("wakeTime", value)}
                placeholder="Select wake time"
              />
            </div>
            <div className="space-y-2">
              <Label>Usual sleep time</Label>
              <TimeSelect
                value={formState.sleepTime}
                onChange={(value) => updateField("sleepTime", value)}
                placeholder="Select sleep time"
              />
            </div>
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={isLoading}
          className="w-full bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-70"
          size="lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating Schedule...
            </>
          ) : (
            <>
              Generate My Schedule
              <ChevronRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
