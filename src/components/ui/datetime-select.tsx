"use client";

import * as React from "react";
import { Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { TimeSelect } from "@/components/ui/time-select";
import { cn } from "@/lib/utils";

interface DateTimeSelectProps {
  value: string; // "YYYY-MM-DDTHH:MM" ISO format
  onChange: (value: string) => void;
  className?: string;
  hasError?: boolean;
}

export function DateTimeSelect({
  value,
  onChange,
  className,
  hasError,
}: DateTimeSelectProps) {
  // Parse the ISO datetime string into date and time parts
  const datePart = value ? value.split("T")[0] || "" : "";
  const timePart = value ? value.split("T")[1] || "" : "";

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    if (newDate && timePart) {
      onChange(`${newDate}T${timePart}`);
    } else if (newDate) {
      // Default to noon if no time selected yet
      onChange(`${newDate}T12:00`);
    } else {
      onChange("");
    }
  };

  const handleTimeChange = (newTime: string) => {
    if (datePart && newTime) {
      onChange(`${datePart}T${newTime}`);
    } else if (newTime) {
      // If no date selected, use today as default
      const today = new Date().toISOString().split("T")[0];
      onChange(`${today}T${newTime}`);
    }
  };

  return (
    <div className={cn("flex gap-2", className)}>
      {/* Wrapper for date input with iOS placeholder fix */}
      <div className="relative flex-1">
        <Input
          type="date"
          value={datePart}
          onChange={handleDateChange}
          className={cn(
            "w-full bg-white",
            // On iOS, empty date inputs show blank - make text transparent when empty
            // so placeholder overlay is visible
            !datePart && "text-transparent",
            hasError && "border-[#F4A574] ring-[#F4A574]/20"
          )}
          aria-invalid={hasError}
        />
        {/* Placeholder overlay for iOS - hidden when date is selected */}
        {!datePart && (
          <div className="text-muted-foreground pointer-events-none absolute inset-0 flex items-center gap-2 px-3 text-sm">
            <Calendar className="h-4 w-4 shrink-0 opacity-50" />
            <span>Select date</span>
          </div>
        )}
      </div>
      <TimeSelect
        value={timePart}
        onChange={handleTimeChange}
        placeholder="Time"
        className="w-32"
        hasError={hasError}
      />
    </div>
  );
}
