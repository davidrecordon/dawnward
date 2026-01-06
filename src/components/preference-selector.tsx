"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ColorScheme = "emerald" | "orange" | "sky" | "purple";

const colorSchemes: Record<
  ColorScheme,
  { bg: string; iconBg: string; iconColor: string; buttonActive: string }
> = {
  emerald: {
    bg: "bg-emerald-50/80",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    buttonActive: "bg-emerald-500 text-white",
  },
  orange: {
    bg: "bg-orange-50/80",
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
    buttonActive: "bg-orange-500 text-white",
  },
  sky: {
    bg: "bg-sky-50/80",
    iconBg: "bg-sky-100",
    iconColor: "text-sky-600",
    buttonActive: "bg-sky-500 text-white",
  },
  purple: {
    bg: "bg-purple-50/80",
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
    buttonActive: "bg-purple-500 text-white",
  },
};

interface Option<T extends string> {
  value: T;
  label: string;
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
}: PreferenceSelectorProps<T>) {
  const colors = colorSchemes[colorScheme];

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
          <p className="text-xs text-slate-500">{description}</p>
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
