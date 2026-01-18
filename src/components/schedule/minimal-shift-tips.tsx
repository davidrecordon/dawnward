"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sun, Coffee, Moon, ChevronDown, ChevronUp, Clock } from "lucide-react";

/** Hours before bedtime to avoid caffeine for optimal sleep */
const CAFFEINE_CUTOFF_HOURS = 8;

interface MinimalShiftTipsProps {
  /** Shift magnitude in hours (1 or 2) */
  shiftMagnitude: number;
  /** Direction of shift */
  direction: "advance" | "delay";
  /** Whether to show the "View full schedule" option */
  showFullScheduleOption?: boolean;
  /** Callback when user wants to see full schedule */
  onShowFullSchedule?: () => void;
  /** Whether full schedule is currently shown */
  isFullScheduleVisible?: boolean;
}

/**
 * Tips card for minimal timezone shifts (0-2 hours).
 *
 * Shows a condensed set of actionable tips instead of a full day-by-day schedule.
 * Includes progressive disclosure to view the full schedule if desired.
 */
export function MinimalShiftTips({
  shiftMagnitude,
  direction,
  showFullScheduleOption = true,
  onShowFullSchedule,
  isFullScheduleVisible = false,
}: MinimalShiftTipsProps) {
  const tips = [
    {
      icon: <Sun className="h-5 w-5 text-amber-500" />,
      title: "Get bright light in the morning",
      description:
        direction === "advance"
          ? "Morning sunlight helps shift your clock earlier"
          : "Morning light stabilizes your rhythm at the destination",
    },
    {
      icon: <Coffee className="h-5 w-5 text-orange-500" />,
      title: `Avoid caffeine within ${CAFFEINE_CUTOFF_HOURS} hours of bedtime`,
      description: "Late caffeine disrupts sleep quality and delays adaptation",
    },
    {
      icon: <Moon className="h-5 w-5 text-violet-500" />,
      title: "Sleep at local time from day one",
      description: `A ${shiftMagnitude}-hour shift resolves naturally within a day`,
    },
    {
      icon: <Clock className="h-5 w-5 text-sky-500" />,
      title: "Eat meals at local times",
      description: "Regular meal timing helps anchor your circadian rhythm",
    },
  ];

  return (
    <Card className="border-emerald-100 bg-gradient-to-br from-emerald-50/50 via-white to-sky-50/50">
      <CardContent className="py-6">
        <div className="mb-4 text-center">
          <h3 className="text-lg font-semibold text-slate-800">
            Quick Tips for Your {shiftMagnitude}-Hour Shift
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Small timezone changes adapt naturally. Here&apos;s what helps:
          </p>
        </div>

        <div className="space-y-3">
          {tips.map((tip, index) => (
            <div
              key={index}
              className="flex items-start gap-3 rounded-lg bg-white/70 p-3"
            >
              <div className="mt-0.5 flex-shrink-0">{tip.icon}</div>
              <div>
                <p className="font-medium text-slate-700">{tip.title}</p>
                <p className="text-sm text-slate-500">{tip.description}</p>
              </div>
            </div>
          ))}
        </div>

        {showFullScheduleOption && onShowFullSchedule && (
          <div className="mt-4 text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={onShowFullSchedule}
              className="text-slate-500 hover:text-slate-700"
            >
              {isFullScheduleVisible ? (
                <>
                  Hide full schedule
                  <ChevronUp className="ml-1.5 h-4 w-4" />
                </>
              ) : (
                <>
                  View full schedule
                  <ChevronDown className="ml-1.5 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
