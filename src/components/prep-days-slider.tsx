"use client";

import * as React from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { colorSchemes } from "@/lib/preference-colors";

interface PrepDaysSliderProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
}

export function PrepDaysSlider({
  value,
  onValueChange,
  min = 1,
  max = 7,
}: PrepDaysSliderProps): React.JSX.Element {
  const colors = colorSchemes.purple;

  return (
    <div className={cn("rounded-lg p-3", colors.bg)}>
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
            colors.iconBg
          )}
        >
          <Calendar className={cn("h-4 w-4", colors.iconColor)} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">Preparation days</p>
          <p className="text-xs text-slate-500">
            Days before departure to start adapting
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Slider
            value={[value]}
            onValueChange={([val]) => onValueChange(val)}
            min={min}
            max={max}
            step={1}
            className="w-24"
          />
          <span className="w-6 text-center text-sm font-semibold text-purple-700">
            {value}
          </span>
        </div>
      </div>
    </div>
  );
}
