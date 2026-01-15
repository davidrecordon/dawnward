"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface TimeSelectProps {
  value: string; // "HH:MM" 24-hour format
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  hasError?: boolean;
}

/**
 * Generate time options with AM first, then PM, in 15-minute increments.
 * Returns array of { value: "HH:MM", label: "H:MM AM/PM" }
 */
function generateTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];

  // Generate AM times (00:00 - 11:45)
  for (let hour = 0; hour < 12; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const value = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
      const displayHour = hour === 0 ? 12 : hour;
      const label = `${displayHour}:${minute.toString().padStart(2, "0")} AM`;
      options.push({ value, label });
    }
  }

  // Generate PM times (12:00 - 23:45)
  for (let hour = 12; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const value = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
      const displayHour = hour === 12 ? 12 : hour - 12;
      const label = `${displayHour}:${minute.toString().padStart(2, "0")} PM`;
      options.push({ value, label });
    }
  }

  return options;
}

const TIME_OPTIONS = generateTimeOptions();

export function TimeSelect({
  value,
  onChange,
  placeholder = "Select time",
  className,
  hasError,
}: TimeSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          "w-full bg-white",
          hasError && "border-[#F4A574] ring-[#F4A574]/20",
          className
        )}
        aria-invalid={hasError}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-60">
        <SelectGroup>
          <SelectLabel>AM</SelectLabel>
          {TIME_OPTIONS.slice(0, 48).map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>PM</SelectLabel>
          {TIME_OPTIONS.slice(48).map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
