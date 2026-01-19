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
import { formatTime } from "@/lib/intervention-utils";

// 12 hours * 4 intervals (every 15 min) = 48 options for AM, 48 for PM
const TIME_OPTIONS_PER_PERIOD = 48;

interface TimeSelectProps {
  value: string; // "HH:MM" 24-hour format
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  hasError?: boolean;
  /** If true, use 24-hour time format (default: false = 12-hour) */
  use24Hour?: boolean;
}

/**
 * Generate time options in 15-minute increments.
 * @param use24Hour - If true, use 24-hour format; otherwise 12-hour
 */
function generateTimeOptions(
  use24Hour: boolean
): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];

  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const value = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
      const label = formatTime(value, use24Hour);
      options.push({ value, label });
    }
  }

  return options;
}

// Pre-computed options for both formats
const TIME_OPTIONS_12H = generateTimeOptions(false);
const TIME_OPTIONS_24H = generateTimeOptions(true);

export function TimeSelect({
  value,
  onChange,
  placeholder = "Select time",
  className,
  hasError,
  use24Hour = false,
}: TimeSelectProps) {
  const timeOptions = use24Hour ? TIME_OPTIONS_24H : TIME_OPTIONS_12H;

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
        {!use24Hour ? (
          <>
            <SelectGroup>
              <SelectLabel>AM</SelectLabel>
              {timeOptions.slice(0, TIME_OPTIONS_PER_PERIOD).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>PM</SelectLabel>
              {timeOptions.slice(TIME_OPTIONS_PER_PERIOD).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        ) : (
          <SelectGroup>
            {timeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}
