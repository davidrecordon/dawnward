"use client";

import { signIn } from "next-auth/react";
import { Calendar, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CALENDAR_SCOPES } from "@/auth.config";

interface CalendarPreviewCardProps {
  isLoggedIn: boolean;
  hasCalendarScope: boolean;
}

export function CalendarPreviewCard({
  isLoggedIn,
  hasCalendarScope,
}: CalendarPreviewCardProps) {
  const handleSetupCalendar = () => {
    signIn("google", {
      callbackUrl: window.location.pathname,
      scope: CALENDAR_SCOPES,
    });
  };

  // State 3: Connected
  if (isLoggedIn && hasCalendarScope) {
    return (
      <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/50 p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100">
          <Check className="h-6 w-6 text-emerald-600" />
        </div>
        <p className="font-medium text-emerald-700">Calendar connected</p>
        <p className="text-sm text-emerald-600/70">
          Your schedule will sync to Google Calendar after you generate it
        </p>
      </div>
    );
  }

  // State 2: Logged in but no calendar scope
  if (isLoggedIn && !hasCalendarScope) {
    return (
      <div className="rounded-xl border-2 border-dashed border-orange-200 bg-orange-50/50 p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100">
          <Calendar className="h-6 w-6 text-orange-500" />
        </div>
        <p className="font-medium">Get calendar reminders</p>
        <p className="mb-3 text-sm text-slate-500">
          Add your schedule to Google Calendar for automatic alerts
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSetupCalendar}
          className="border-orange-200 bg-white hover:bg-orange-50"
        >
          <Calendar className="mr-2 h-4 w-4" />
          Set up calendar
        </Button>
      </div>
    );
  }

  // State 1: Not logged in - sign in with calendar scope
  const handleSignInWithCalendar = () => {
    signIn("google", {
      callbackUrl: window.location.pathname,
      scope: CALENDAR_SCOPES,
    });
  };

  return (
    <div className="rounded-xl border-2 border-dashed border-orange-200 bg-orange-50/50 p-6 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100">
        <Calendar className="h-6 w-6 text-orange-500" />
      </div>
      <p className="font-medium">Get calendar reminders</p>
      <p className="mb-3 text-sm text-slate-500">
        Sign in to sync your schedule to Google Calendar
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={handleSignInWithCalendar}
        className="border-orange-200 bg-white hover:bg-orange-50"
      >
        <Calendar className="mr-2 h-4 w-4" />
        Sign in to enable
      </Button>
    </div>
  );
}
