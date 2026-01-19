"use client";

import * as React from "react";

/**
 * Display preferences that affect how the UI renders.
 * These are user preferences fetched from the database for logged-in users.
 */
interface DisplayPreferences {
  use24HourFormat: boolean;
  showDualTimezone: boolean;
  scheduleViewMode: "summary" | "timeline";
}

const DisplayPreferencesContext =
  React.createContext<DisplayPreferences | null>(null);

interface ProviderProps {
  children: React.ReactNode;
  /** Whether to use 24-hour time format (default: false = 12-hour) */
  use24HourFormat?: boolean;
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
  use24HourFormat = false,
  showDualTimezone = false,
  scheduleViewMode = "summary",
}: ProviderProps) {
  const value = React.useMemo<DisplayPreferences>(
    () => ({ use24HourFormat, showDualTimezone, scheduleViewMode }),
    [use24HourFormat, showDualTimezone, scheduleViewMode]
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
      use24HourFormat: false,
      showDualTimezone: false,
      scheduleViewMode: "summary",
    };
  }
  return context;
}

/**
 * Convenience hook for just the 24-hour format preference.
 */
export function useUse24HourFormat(): boolean {
  return useDisplayPreferences().use24HourFormat;
}
