"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Activity, Calendar, ChevronRight, Coffee, MapPin, Moon, Pill } from "lucide-react";
import { formatDateTimeLocal } from "@/lib/time-utils";
import type { Airport } from "@/types/airport";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { AirportSelect } from "@/components/airport-select";
import { PreferenceToggle } from "@/components/preference-toggle";
import { PreferenceSelector } from "@/components/preference-selector";
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
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const submitButtonRef = React.useRef<HTMLButtonElement>(null);

  // Handle "Show me" example demo
  const handleShowExample = async () => {
    // Prevent duplicate submissions
    if (isSubmitting) return;

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
    submitButtonRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    await new Promise((resolve) => setTimeout(resolve, 300));

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

  const handleSubmit = () => {
    if (!validate()) {
      return;
    }

    // Ensure we have airports (validation should catch this, but TypeScript needs it)
    if (!formState.origin || !formState.destination) {
      return;
    }

    // Navigate to trip page - schedule will be generated there from saved form state
    router.push("/trip");
  };

  return (
    <Card className="relative overflow-hidden bg-white/90 backdrop-blur-sm border border-slate-200/50">
      {/* "Show me" ribbon - top right corner */}
      <button
        onClick={handleShowExample}
        className="absolute -right-[1px] -top-[1px] z-10"
        aria-label="Show me an example"
        disabled={isSubmitting}
      >
        <div className="w-28 h-28 pointer-events-none">
          <div
            className="absolute top-[18px] -right-[32px] w-36 bg-gradient-to-r from-amber-400 to-orange-400
                       text-white text-xs font-semibold py-1.5 text-center rotate-45
                       shadow-md hover:from-amber-500 hover:to-orange-500 transition-colors
                       pointer-events-auto cursor-pointer"
          >
            Show me
          </div>
        </div>
      </button>

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
              description="Coffee or tea timing recommendations"
              checked={formState.useCaffeine}
              onCheckedChange={(checked) => updateField("useCaffeine", checked)}
              colorScheme="orange"
            />

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
          ref={submitButtonRef}
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-70"
          size="lg"
        >
          Generate My Schedule
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
