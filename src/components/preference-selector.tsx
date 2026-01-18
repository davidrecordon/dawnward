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
  /** Compact variant: stacked layout, full-width buttons, solid background */
  variant?: "default" | "compact";
}

export function PreferenceSelector<T extends string>({
  icon,
  title,
  description,
  value,
  onValueChange,
  options,
  colorScheme,
  variant = "default",
}: PreferenceSelectorProps<T>): React.JSX.Element {
  const colors = colorSchemes[colorScheme];
  const selectedOption = options.find((opt) => opt.value === value);
  // Use dynamic description from selected option if available, otherwise use static description
  const displayDescription = selectedOption?.description || description;

  const isCompact = variant === "compact";
  // Remove /80 opacity suffix for compact mode (solid background)
  const bgClass = isCompact ? colors.bg.replace("/80", "") : colors.bg;

  return (
    <div
      className={cn(
        "rounded-lg p-3",
        isCompact
          ? "flex flex-col gap-3"
          : "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        bgClass
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
      <div
        className={cn(
          "flex",
          isCompact ? "mt-3 gap-2" : "rounded-lg bg-white/80 p-1 shadow-sm"
        )}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onValueChange(option.value)}
            className={cn(
              "rounded-md font-medium transition-colors",
              isCompact ? "flex-1 px-3 py-2 text-sm" : "px-3 py-1.5 text-xs",
              value === option.value
                ? colors.buttonActive
                : isCompact
                  ? "bg-white text-slate-700 hover:bg-slate-100"
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
