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
}

export function PreferenceToggle({
  icon,
  title,
  description,
  checked,
  onCheckedChange,
  colorScheme,
}: PreferenceToggleProps): React.JSX.Element {
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
