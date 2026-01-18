import { describe, it, expect } from "vitest";
import {
  mapDbToFormPreferences,
  mapFormToDbPreferences,
} from "../user-preferences";

describe("User Preferences Mapping", () => {
  describe("mapDbToFormPreferences", () => {
    it("maps database field names to form field names", () => {
      const dbPrefs = {
        defaultWakeTime: "07:00",
        defaultSleepTime: "23:00",
        defaultPrepDays: 3,
        usesMelatonin: true,
        usesCaffeine: false,
        usesExercise: true,
        napPreference: "all_days",
        scheduleIntensity: "aggressive",
        showDualTimezone: false,
      };

      const formPrefs = mapDbToFormPreferences(dbPrefs);

      expect(formPrefs).toEqual({
        wakeTime: "07:00",
        sleepTime: "23:00",
        prepDays: 3,
        useMelatonin: true,
        useCaffeine: false,
        useExercise: true,
        napPreference: "all_days",
        scheduleIntensity: "aggressive",
      });
    });

    it("preserves all preference values", () => {
      const dbPrefs = {
        defaultWakeTime: "06:30",
        defaultSleepTime: "22:00",
        defaultPrepDays: 5,
        usesMelatonin: false,
        usesCaffeine: true,
        usesExercise: false,
        napPreference: "no",
        scheduleIntensity: "gentle",
        showDualTimezone: true,
      };

      const formPrefs = mapDbToFormPreferences(dbPrefs);

      expect(formPrefs.wakeTime).toBe("06:30");
      expect(formPrefs.sleepTime).toBe("22:00");
      expect(formPrefs.prepDays).toBe(5);
      expect(formPrefs.useMelatonin).toBe(false);
      expect(formPrefs.useCaffeine).toBe(true);
      expect(formPrefs.useExercise).toBe(false);
      expect(formPrefs.napPreference).toBe("no");
      expect(formPrefs.scheduleIntensity).toBe("gentle");
    });
  });

  describe("mapFormToDbPreferences", () => {
    it("maps form field names to database field names", () => {
      const formPrefs = {
        wakeTime: "07:00",
        sleepTime: "23:00",
        prepDays: 3,
        useMelatonin: true,
        useCaffeine: false,
        useExercise: true,
        napPreference: "all_days",
        scheduleIntensity: "aggressive",
      };

      const dbPrefs = mapFormToDbPreferences(formPrefs);

      expect(dbPrefs).toEqual({
        defaultWakeTime: "07:00",
        defaultSleepTime: "23:00",
        defaultPrepDays: 3,
        usesMelatonin: true,
        usesCaffeine: false,
        usesExercise: true,
        napPreference: "all_days",
        scheduleIntensity: "aggressive",
        showDualTimezone: false,
      });
    });

    it("is the inverse of mapDbToFormPreferences for form fields", () => {
      const original = {
        defaultWakeTime: "08:00",
        defaultSleepTime: "22:30",
        defaultPrepDays: 4,
        usesMelatonin: true,
        usesCaffeine: true,
        usesExercise: false,
        napPreference: "flight_only",
        scheduleIntensity: "balanced",
        showDualTimezone: false, // Display preference defaults to false
      };

      const formPrefs = mapDbToFormPreferences(original);
      const backToDb = mapFormToDbPreferences(formPrefs);

      // Form fields round-trip correctly; showDualTimezone defaults to false
      expect(backToDb).toEqual(original);
    });
  });
});
