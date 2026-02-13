"use client";

import * as React from "react";
import type { DisplayPreferences } from "@/types/user-preferences";
import { detectUser24HourPreference } from "@/lib/locale-utils";

const DisplayPreferencesContext =
  React.createContext<DisplayPreferences | null>(null);

interface ProviderProps {
  children: React.ReactNode;
  use24HourFormat?: boolean;
  showDualTimezone?: boolean;
  /** When true, auto-detect 24-hour format from browser locale (for anonymous users) */
  detectLocale?: boolean;
}

/**
 * Provider for display preferences. Wrap schedule views with this provider,
 * passing values from the server (database) or using defaults for anonymous users.
 *
 * When `detectLocale` is true, the provider will detect the user's locale
 * preference on the client and use it for the 24-hour format setting.
 */
export function DisplayPreferencesProvider({
  children,
  use24HourFormat = false,
  showDualTimezone = false,
  detectLocale = false,
}: ProviderProps) {
  const [detectedFormat, setDetectedFormat] = React.useState(use24HourFormat);

  React.useEffect(() => {
    if (detectLocale) {
      setDetectedFormat(detectUser24HourPreference());
    }
  }, [detectLocale]);

  // Use detected format when detectLocale is enabled, otherwise use the prop
  const effectiveFormat = detectLocale ? detectedFormat : use24HourFormat;

  const value = React.useMemo<DisplayPreferences>(
    () => ({
      use24HourFormat: effectiveFormat,
      showDualTimezone,
    }),
    [effectiveFormat, showDualTimezone]
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
