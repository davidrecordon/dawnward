"use client";

import * as React from "react";
import { Calendar } from "lucide-react";
import { TimeSelect } from "@/components/ui/time-select";
import { cn } from "@/lib/utils";

interface DateTimeSelectProps {
  value: string; // "YYYY-MM-DDTHH:MM" ISO format
  onChange: (value: string) => void;
  className?: string;
  hasError?: boolean;
}

/**
 * Format a date string (YYYY-MM-DD) for display.
 * Returns short format like "Jan 19, 2026"
 */
function formatDateForDisplay(dateStr: string): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DateTimeSelect({
  value,
  onChange,
  className,
  hasError,
}: DateTimeSelectProps) {
  const dateInputRef = React.useRef<HTMLInputElement>(null);

  // Parse the ISO datetime string into date and time parts
  const datePart = value ? value.split("T")[0] || "" : "";
  const timePart = value ? value.split("T")[1] || "" : "";

  const handleDateClick = () => {
    // Use showPicker() for Chrome desktop compatibility
    // Falls back to focus() for browsers that don't support it
    if (dateInputRef.current) {
      try {
        dateInputRef.current.showPicker();
      } catch {
        dateInputRef.current.focus();
      }
    }
  };

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
      {/* Date input wrapper - click anywhere to open picker */}
      <div className="relative flex-1 cursor-pointer" onClick={handleDateClick}>
        {/* Visible styled display that looks like an input */}
        <div
          className={cn(
            "border-input flex h-9 w-full items-center gap-2 rounded-md border bg-white px-3 text-sm shadow-xs",
            "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
            hasError && "border-[#F4A574] ring-[#F4A574]/20"
          )}
        >
          <Calendar className="text-muted-foreground h-4 w-4 shrink-0 opacity-50" />
          {datePart ? (
            <span className="truncate">{formatDateForDisplay(datePart)}</span>
          ) : (
            <span className="text-muted-foreground truncate">Select date</span>
          )}
        </div>
        {/* Hidden native date input - showPicker() called via wrapper click */}
        <input
          ref={dateInputRef}
          type="date"
          value={datePart}
          onChange={handleDateChange}
          className="pointer-events-none absolute inset-0 border-0 bg-transparent opacity-0"
          aria-label="Select date"
          tabIndex={-1}
        />
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
