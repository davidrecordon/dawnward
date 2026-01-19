import { type TimeFormat, DEFAULT_TIME_FORMAT } from "@/lib/time-format";

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
  scheduleViewMode: "summary" | "timeline";
  timeFormat: TimeFormat;
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
    scheduleViewMode: "summary",
    timeFormat: DEFAULT_TIME_FORMAT,
  };
}
