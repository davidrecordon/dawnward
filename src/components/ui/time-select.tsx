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
import { formatTime, type TimeFormat } from "@/lib/intervention-utils";

interface TimeSelectProps {
  value: string; // "HH:MM" 24-hour format
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  hasError?: boolean;
  /** Time display format: "12h" (default) or "24h" */
  timeFormat?: TimeFormat;
}

/**
 * Generate time options in 15-minute increments.
 * @param format - Display format: "12h" or "24h"
 */
function generateTimeOptions(
  format: TimeFormat
): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];

  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const value = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
      const label = formatTime(value, format);
      options.push({ value, label });
    }
  }

  return options;
}

// Pre-computed options for both formats
const TIME_OPTIONS_12H = generateTimeOptions("12h");
const TIME_OPTIONS_24H = generateTimeOptions("24h");

export function TimeSelect({
  value,
  onChange,
  placeholder = "Select time",
  className,
  hasError,
  timeFormat = "12h",
}: TimeSelectProps) {
  const timeOptions =
    timeFormat === "24h" ? TIME_OPTIONS_24H : TIME_OPTIONS_12H;

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
        {timeFormat === "12h" ? (
          <>
            <SelectGroup>
              <SelectLabel>AM</SelectLabel>
              {timeOptions.slice(0, 48).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>PM</SelectLabel>
              {timeOptions.slice(48).map((option) => (
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
