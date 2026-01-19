"use client";

import * as React from "react";
import type {
  DisplayPreferences,
  ScheduleViewMode,
} from "@/types/user-preferences";

const DisplayPreferencesContext =
  React.createContext<DisplayPreferences | null>(null);

interface ProviderProps {
  children: React.ReactNode;
  use24HourFormat?: boolean;
  showDualTimezone?: boolean;
  scheduleViewMode?: ScheduleViewMode;
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
