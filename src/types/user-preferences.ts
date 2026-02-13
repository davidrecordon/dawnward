/**
 * Display preferences for schedule rendering.
 * Used by DisplayPreferencesContext and page components.
 */
export interface DisplayPreferences {
  use24HourFormat: boolean;
  showDualTimezone: boolean;
}

/**
 * Database user preferences shape.
 */
interface DbDisplayPreferences {
  use24HourFormat?: boolean | null;
  showDualTimezone?: boolean | null;
}

/**
 * Extract display preferences from database user preferences.
 * Safely validates and provides defaults for any missing/invalid values.
 */
export function extractDisplayPreferences(
  userPrefs: DbDisplayPreferences | null | undefined
): DisplayPreferences {
  return {
    use24HourFormat: userPrefs?.use24HourFormat ?? false,
    showDualTimezone: userPrefs?.showDualTimezone ?? false,
  };
}

/**
 * User preference fields that can be synced between settings and trip form.
 */
export interface UserPreferences {
  defaultWakeTime: string;
  defaultSleepTime: string;
  defaultPrepDays: number;
  usesMelatonin: boolean;
  usesCaffeine: boolean;
  usesExercise: boolean;
  napPreference: string;
  scheduleIntensity: string;
  // Display preferences
  showDualTimezone: boolean;
  use24HourFormat: boolean;
  // Account metadata (only present when fetched from API)
  createdAt?: string;
}

/**
 * Maps database field names to trip form field names.
 * Database uses "defaults" prefix, form uses direct names.
 */
export function mapDbToFormPreferences(db: UserPreferences) {
  return {
    wakeTime: db.defaultWakeTime,
    sleepTime: db.defaultSleepTime,
    prepDays: db.defaultPrepDays,
    useMelatonin: db.usesMelatonin,
    useCaffeine: db.usesCaffeine,
    useExercise: db.usesExercise,
    napPreference: db.napPreference,
    scheduleIntensity: db.scheduleIntensity,
  };
}

/**
 * Maps trip form field names to database field names.
 */
export function mapFormToDbPreferences(form: {
  wakeTime: string;
  sleepTime: string;
  prepDays: number;
  useMelatonin: boolean;
  useCaffeine: boolean;
  useExercise: boolean;
  napPreference: string;
  scheduleIntensity: string;
}): UserPreferences {
  return {
    defaultWakeTime: form.wakeTime,
    defaultSleepTime: form.sleepTime,
    defaultPrepDays: form.prepDays,
    usesMelatonin: form.useMelatonin,
    usesCaffeine: form.useCaffeine,
    usesExercise: form.useExercise,
    napPreference: form.napPreference,
    scheduleIntensity: form.scheduleIntensity,
    // Display preferences not in trip form - use defaults
    showDualTimezone: false,
    use24HourFormat: false,
  };
}
