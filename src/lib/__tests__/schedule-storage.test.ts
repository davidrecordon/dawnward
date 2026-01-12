import { describe, it, expect, beforeEach } from "vitest";
import {
  getFormState,
  saveFormState,
  clearFormState,
} from "../schedule-storage";
import type { TripFormState } from "@/types/trip-form";

const mockFormState: TripFormState = {
  origin: {
    code: "SFO",
    name: "San Francisco International",
    city: "San Francisco",
    country: "US",
    tz: "America/Los_Angeles",
  },
  destination: {
    code: "LHR",
    name: "London Heathrow",
    city: "London",
    country: "GB",
    tz: "Europe/London",
  },
  departureDateTime: "2026-01-20T20:00",
  arrivalDateTime: "2026-01-21T14:00",
  prepDays: 3,
  wakeTime: "07:00",
  sleepTime: "23:00",
  useMelatonin: true,
  useCaffeine: true,
  useExercise: false,
  napPreference: "flight_only",
  scheduleIntensity: "balanced",
  leg2: null,
};

describe("form state storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("getFormState", () => {
    it("returns null when no form state exists", () => {
      expect(getFormState()).toBeNull();
    });

    it("returns saved form state", () => {
      saveFormState(mockFormState);
      const result = getFormState();

      expect(result).not.toBeNull();
      expect(result!.origin!.code).toBe("SFO");
      expect(result!.prepDays).toBe(3);
    });

    it("returns null for corrupted data", () => {
      localStorage.setItem("dawnward_form_state", "invalid json");
      expect(getFormState()).toBeNull();
    });
  });

  describe("saveFormState", () => {
    it("saves form state to localStorage", () => {
      saveFormState(mockFormState);

      const raw = localStorage.getItem("dawnward_form_state");
      expect(raw).not.toBeNull();

      const parsed = JSON.parse(raw!);
      expect(parsed.origin.code).toBe("SFO");
    });

    it("saves partial form state", () => {
      const partialState: TripFormState = {
        origin: null,
        destination: null,
        departureDateTime: "",
        arrivalDateTime: "",
        prepDays: 3,
        wakeTime: "07:00",
        sleepTime: "23:00",
        useMelatonin: false,
        useCaffeine: false,
        useExercise: false,
        napPreference: "flight_only",
        scheduleIntensity: "balanced",
        leg2: null,
      };

      saveFormState(partialState);
      const result = getFormState();

      expect(result).not.toBeNull();
      expect(result!.origin).toBeNull();
      expect(result!.prepDays).toBe(3);
    });
  });

  describe("clearFormState", () => {
    it("removes form state from localStorage", () => {
      saveFormState(mockFormState);
      expect(getFormState()).not.toBeNull();

      clearFormState();
      expect(getFormState()).toBeNull();
    });

    it("handles clearing when no form state exists", () => {
      expect(() => clearFormState()).not.toThrow();
    });
  });
});
