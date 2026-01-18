"use client";

import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { type ColorScheme, colorSchemes } from "@/lib/preference-colors";

interface PreferenceToggleProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  colorScheme: ColorScheme;
  /** Use solid background instead of semi-transparent */
  compact?: boolean;
}

export function PreferenceToggle({
  icon,
  title,
  description,
  checked,
  onCheckedChange,
  colorScheme,
  compact = false,
}: PreferenceToggleProps): React.JSX.Element {
  const colors = colorSchemes[colorScheme];
  // Remove /80 opacity suffix for compact mode (solid background)
  const bgClass = compact ? colors.bg.replace("/80", "") : colors.bg;

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg p-3",
        bgClass
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
