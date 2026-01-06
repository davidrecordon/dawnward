"use client";

import * as React from "react";
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
  const [datePart, timePart] = React.useMemo(() => {
    if (!value) return ["", ""];
    const parts = value.split("T");
    return [parts[0] || "", parts[1] || ""];
  }, [value]);

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
      <Input
        type="date"
        value={datePart}
        onChange={handleDateChange}
        className={cn(
          "flex-1 bg-white",
          hasError && "border-[#F4A574] ring-[#F4A574]/20"
        )}
        aria-invalid={hasError}
      />
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
