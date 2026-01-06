"use client";

import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type ColorScheme = "emerald" | "orange" | "sky";

const colorSchemes: Record<
  ColorScheme,
  { bg: string; iconBg: string; iconColor: string }
> = {
  emerald: {
    bg: "bg-emerald-50/80",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
  },
  orange: {
    bg: "bg-orange-50/80",
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
  },
  sky: {
    bg: "bg-sky-50/80",
    iconBg: "bg-sky-100",
    iconColor: "text-sky-600",
  },
};

interface PreferenceToggleProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  colorScheme: ColorScheme;
}

export function PreferenceToggle({
  icon,
  title,
  description,
  checked,
  onCheckedChange,
  colorScheme,
}: PreferenceToggleProps) {
  const colors = colorSchemes[colorScheme];

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg p-3",
        colors.bg
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full",
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
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={title}
      />
    </div>
  );
}
