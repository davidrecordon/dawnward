"use client";

import * as React from "react";
import { Activity, ChevronRight, Coffee, MapPin, Pill } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AirportSelect } from "@/components/airport-select";
import { PreferenceToggle } from "@/components/preference-toggle";
import { FormError } from "@/components/form-error";
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
  const [errors, setErrors] = React.useState<FormErrors>({});

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

    console.log("Form submission:", formState);
    // TODO: Call API route to generate schedule
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
            <Input
              type="datetime-local"
              value={formState.departureDateTime}
              onChange={(e) => updateField("departureDateTime", e.target.value)}
              className="bg-white"
              aria-invalid={!!errors.departureDateTime}
            />
            <FieldError message={errors.departureDateTime} />
          </div>
          <div className="space-y-2">
            <Label>Arrival</Label>
            <Input
              type="datetime-local"
              value={formState.arrivalDateTime}
              onChange={(e) => updateField("arrivalDateTime", e.target.value)}
              className="bg-white"
              aria-invalid={!!errors.arrivalDateTime}
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
          </div>

          <hr className="border-slate-200" />

          {/* Wake/Sleep times */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Usual wake time</Label>
              <Input
                type="time"
                value={formState.wakeTime}
                onChange={(e) => updateField("wakeTime", e.target.value)}
                className="bg-white"
              />
            </div>
            <div className="space-y-2">
              <Label>Usual sleep time</Label>
              <Input
                type="time"
                value={formState.sleepTime}
                onChange={(e) => updateField("sleepTime", e.target.value)}
                className="bg-white"
              />
            </div>
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          className="w-full bg-sky-500 hover:bg-sky-600 text-white"
          size="lg"
        >
          Generate My Schedule
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
