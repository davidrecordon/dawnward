"use client";

import * as React from "react";
import {
  type TimeFormat,
  DEFAULT_TIME_FORMAT,
} from "@/lib/time-format";

/**
 * Display preferences that affect how the UI renders.
 * These are user preferences fetched from the database for logged-in users.
 */
interface DisplayPreferences {
  timeFormat: TimeFormat;
  showDualTimezone: boolean;
  scheduleViewMode: "summary" | "timeline";
}

const DisplayPreferencesContext =
  React.createContext<DisplayPreferences | null>(null);

interface ProviderProps {
  children: React.ReactNode;
  /** Time format preference (12h or 24h) */
  timeFormat?: TimeFormat;
  /** Whether to show dual timezone display */
  showDualTimezone?: boolean;
  /** Default view mode for schedule (summary or timeline) */
  scheduleViewMode?: "summary" | "timeline";
}

/**
 * Provider for display preferences. Wrap schedule views with this provider,
 * passing values from the server (database) or using defaults for anonymous users.
 */
export function DisplayPreferencesProvider({
  children,
  timeFormat = DEFAULT_TIME_FORMAT,
  showDualTimezone = false,
  scheduleViewMode = "summary",
}: ProviderProps) {
  const value = React.useMemo<DisplayPreferences>(
    () => ({ timeFormat, showDualTimezone, scheduleViewMode }),
    [timeFormat, showDualTimezone, scheduleViewMode]
  );

  return (
    <DisplayPreferencesContext.Provider value={value}>
      {children}
    </DisplayPreferencesContext.Provider>
  );
}

/**
 * Hook to access all display preferences.
 * Returns defaults if not wrapped in a provider (graceful degradation).
 */
export function useDisplayPreferences(): DisplayPreferences {
  const context = React.useContext(DisplayPreferencesContext);
  if (!context) {
    return {
      timeFormat: DEFAULT_TIME_FORMAT,
      showDualTimezone: false,
      scheduleViewMode: "summary",
    };
  }
  return context;
}

/**
 * Convenience hook for just the time format preference.
 */
export function useTimeFormat(): TimeFormat {
  return useDisplayPreferences().timeFormat;
}
