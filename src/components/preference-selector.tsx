"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { type ColorScheme, colorSchemes } from "@/lib/preference-colors";

interface Option<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface PreferenceSelectorProps<T extends string> {
  icon: React.ReactNode;
  title: string;
  description: string;
  value: T;
  onValueChange: (value: T) => void;
  options: Option<T>[];
  colorScheme: ColorScheme;
}

export function PreferenceSelector<T extends string>({
  icon,
  title,
  description,
  value,
  onValueChange,
  options,
  colorScheme,
}: PreferenceSelectorProps<T>): React.JSX.Element {
  const colors = colorSchemes[colorScheme];
  const selectedOption = options.find((opt) => opt.value === value);
  // Use dynamic description from selected option if available, otherwise use static description
  const displayDescription = selectedOption?.description || description;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg p-3 sm:flex-row sm:items-center sm:justify-between",
        colors.bg
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            colors.iconBg
          )}
        >
          <span className={colors.iconColor}>{icon}</span>
        </div>
        <div>
          <p className="text-sm font-medium">{title}</p>
          {displayDescription && (
            <p className="text-xs text-slate-500">{displayDescription}</p>
          )}
        </div>
      </div>
      <div className="flex rounded-lg bg-white/80 p-1 shadow-sm">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onValueChange(option.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              value === option.value
                ? colors.buttonActive
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
