"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ChevronRight,
  Coffee,
  Gauge,
  Loader2,
  MapPin,
  Moon,
  Pill,
  Settings,
} from "lucide-react";
import { formatDateTimeLocal } from "@/lib/time-utils";
import {
  calculateFlightDuration,
  calculateTimeShift,
  getRecommendedPrepDays,
  getShiftDirectionLabel,
  MINIMAL_SHIFT_THRESHOLD_HOURS,
} from "@/lib/timezone-utils";
import type { Airport } from "@/types/airport";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { AirportSelect } from "@/components/airport-select";
import { PreferenceToggle } from "@/components/preference-toggle";
import { PreferenceSelector } from "@/components/preference-selector";
import { PrepDaysSlider } from "@/components/prep-days-slider";
import { FormError } from "@/components/form-error";
import { DateTimeSelect } from "@/components/ui/datetime-select";
import { TimeSelect } from "@/components/ui/time-select";
import type { TripFormState } from "@/types/trip-form";

interface TripFormProps {
  formState: TripFormState;
  onFormChange: (state: TripFormState) => void;
  onSubmit?: () => void;
  isSubmitting?: boolean;
  isSignedIn?: boolean;
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
    <p className="animate-in fade-in slide-in-from-top-1 mt-1.5 text-sm text-[#F4A574] duration-200">
      {message}
    </p>
  );
}

export function TripForm({
  formState,
  onFormChange,
  onSubmit,
  isSubmitting,
  isSignedIn = false,
}: TripFormProps) {
  const router = useRouter();
  const [errors, setErrors] = React.useState<FormErrors>({});

  // Calculate shift info for prep days recommendation
  const shiftInfo = React.useMemo(() => {
    if (!formState.origin || !formState.destination) return null;
    const shiftHours = calculateTimeShift(
      formState.origin.tz,
      formState.destination.tz
    );
    const absShift = Math.abs(Math.round(shiftHours));
    if (absShift === 0) return null;
    return {
      shiftHours,
      absShift,
      direction: getShiftDirectionLabel(shiftHours),
      recommendedPrepDays: getRecommendedPrepDays(shiftHours),
    };
  }, [formState.origin, formState.destination]);
  const submitButtonRef = React.useRef<HTMLButtonElement>(null);

  // Handle "Show me" example demo
  const handleShowExample = async () => {
    // Example airports
    const sfo: Airport = {
      code: "SFO",
      name: "San Francisco International",
      city: "San Francisco",
      country: "US",
      tz: "America/Los_Angeles",
    };

    const lhr: Airport = {
      code: "LHR",
      name: "London Heathrow",
      city: "London",
      country: "GB",
      tz: "Europe/London",
    };

    // Calculate tomorrow at 8:45pm and day after at 3:15pm
    // (times must be on 15-minute increments for TimeSelect)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    tomorrow.setHours(20, 45, 0, 0);

    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 3);
    dayAfter.setHours(15, 15, 0, 0);

    // Update form state with example values
    onFormChange({
      ...formState,
      origin: sfo,
      destination: lhr,
      departureDateTime: formatDateTimeLocal(tomorrow),
      arrivalDateTime: formatDateTimeLocal(dayAfter),
    });

    // Wait for visual effect - let user see the form fill in
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Guard against unmount before clicking
    if (!submitButtonRef.current) return;

    // Scroll to and click generate button
    submitButtonRef.current.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Guard again before final click
    if (!submitButtonRef.current) return;
    submitButtonRef.current.click();
  };

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
      [
        "origin",
        "destination",
        "departureDateTime",
        "arrivalDateTime",
      ].includes(field)
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

    // Use timezone-aware comparison for dateline-crossing flights
    if (
      formState.departureDateTime &&
      formState.arrivalDateTime &&
      formState.origin &&
      formState.destination
    ) {
      const duration = calculateFlightDuration(
        formState.departureDateTime,
        formState.arrivalDateTime,
        formState.origin.tz,
        formState.destination.tz
      );
      if (!duration) {
        newErrors.form = "Your arrival time needs to be after departure";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) {
      return;
    }

    // Ensure we have airports (validation should catch this, but TypeScript needs it)
    if (!formState.origin || !formState.destination) {
      return;
    }

    // Call custom submit handler if provided, otherwise navigate directly
    if (onSubmit) {
      onSubmit();
    } else {
      router.push("/trip");
    }
  };

  return (
    <Card className="relative overflow-hidden border border-slate-200/50 bg-white/90 backdrop-blur-sm">
      {/* "Show me" ribbon - top right corner */}
      <button
        onClick={handleShowExample}
        className="absolute -top-[1px] -right-[1px] z-10"
        aria-label="Show me an example"
      >
        <div className="pointer-events-none h-28 w-28">
          <div className="pointer-events-auto absolute top-[18px] -right-[32px] w-36 rotate-45 cursor-pointer bg-gradient-to-r from-amber-400 to-orange-400 py-1.5 text-center text-xs font-semibold text-white shadow-md transition-colors hover:from-amber-500 hover:to-orange-500">
            Show me
          </div>
        </div>
      </button>

      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-xl">
          <MapPin className="h-5 w-5 text-sky-500" />
          Plan Your Trip
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          Enter your flight details to generate a personalized schedule
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Form-level error banner */}
        {errors.form && (
          <FormError
            message={errors.form}
            onDismiss={() =>
              setErrors((prev) => ({ ...prev, form: undefined }))
            }
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
          <h3 className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
            Your Preferences
          </h3>

          <div className="space-y-3">
            {/* Settings link for signed-in users */}
            {isSignedIn && (
              <Link
                href="/settings"
                className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 transition-colors hover:bg-slate-100"
              >
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-slate-400" />
                  <span className="text-sm text-slate-600">
                    Using your saved preferences
                  </span>
                </div>
                <span className="text-sm font-medium text-sky-600">
                  Edit in Settings →
                </span>
              </Link>
            )}

            {/* Only show melatonin/caffeine/exercise toggles for signed-out users */}
            {!isSignedIn && (
              <>
                <PreferenceToggle
                  icon={<Pill className="h-4 w-4" />}
                  title="Use melatonin"
                  description="Low-dose timed supplements"
                  checked={formState.useMelatonin}
                  onCheckedChange={(checked) =>
                    updateField("useMelatonin", checked)
                  }
                  colorScheme="emerald"
                />

                <PreferenceToggle
                  icon={<Coffee className="h-4 w-4" />}
                  title="Strategic caffeine"
                  description="Coffee or tea timing recommendations"
                  checked={formState.useCaffeine}
                  onCheckedChange={(checked) =>
                    updateField("useCaffeine", checked)
                  }
                  colorScheme="orange"
                />

                <PreferenceToggle
                  icon={<Activity className="h-4 w-4" />}
                  title="Include exercise"
                  description="Physical activity can help shift rhythms"
                  checked={formState.useExercise}
                  onCheckedChange={(checked) =>
                    updateField("useExercise", checked)
                  }
                  colorScheme="sky"
                />
              </>
            )}

            <PreferenceSelector
              icon={<Moon className="h-4 w-4" />}
              title="Recommend naps"
              description="Strategic napping to reduce sleep debt"
              value={formState.napPreference}
              onValueChange={(value) => updateField("napPreference", value)}
              options={[
                { value: "no", label: "No" },
                { value: "flight_only", label: "On the flight" },
                { value: "all_days", label: "On all days" },
              ]}
              colorScheme="purple"
            />

            <PreferenceSelector
              icon={<Gauge className="h-4 w-4" />}
              title="Schedule intensity"
              description={
                formState.scheduleIntensity === "gentle"
                  ? "Easier to follow — stays close to your usual schedule"
                  : formState.scheduleIntensity === "balanced"
                    ? "Good balance of speed and practicality"
                    : "Fastest adaptation — requires flexible schedule"
              }
              value={formState.scheduleIntensity}
              onValueChange={(value) => updateField("scheduleIntensity", value)}
              options={[
                { value: "gentle", label: "Gentle" },
                { value: "balanced", label: "Balanced" },
                { value: "aggressive", label: "Aggressive" },
              ]}
              colorScheme="sky"
            />

            <PrepDaysSlider
              value={formState.prepDays}
              onValueChange={(value) => updateField("prepDays", value)}
            />

            {/* Prep days recommendation hint */}
            {shiftInfo &&
              shiftInfo.absShift > MINIMAL_SHIFT_THRESHOLD_HOURS && (
                <p className="mt-2 text-xs text-slate-500">
                  For a {shiftInfo.absShift}-hour {shiftInfo.direction} shift,
                  we recommend{" "}
                  <button
                    type="button"
                    onClick={() =>
                      updateField("prepDays", shiftInfo.recommendedPrepDays)
                    }
                    className="font-medium text-sky-600 underline decoration-sky-300 underline-offset-2 hover:text-sky-700"
                  >
                    {shiftInfo.recommendedPrepDays} preparation day
                    {shiftInfo.recommendedPrepDays !== 1 ? "s" : ""}
                  </button>
                  .
                </p>
              )}
          </div>

          {/* Only show wake/sleep times for signed-out users */}
          {!isSignedIn && (
            <>
              <hr className="border-slate-200" />

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
            </>
          )}
        </div>

        <Button
          ref={submitButtonRef}
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full bg-sky-500 text-white hover:bg-sky-600"
          size="lg"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
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
