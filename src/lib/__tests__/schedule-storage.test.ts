import { describe, it, expect, beforeEach } from "vitest";
import {
  getSchedule,
  saveSchedule,
  deleteSchedule,
  generateId,
  getFormState,
  saveFormState,
  clearFormState,
} from "../schedule-storage";
import type { StoredSchedule } from "@/types/schedule";
import type { TripFormState } from "@/types/trip-form";

// Sample data for testing
const mockSchedule: StoredSchedule = {
  id: "test-schedule-123",
  createdAt: "2026-01-15T12:00:00Z",
  request: {
    origin: { code: "SFO", name: "San Francisco International", city: "San Francisco", country: "US", tz: "America/Los_Angeles" },
    destination: { code: "LHR", name: "London Heathrow", city: "London", country: "GB", tz: "Europe/London" },
    departureDateTime: "2026-01-20T20:00",
    arrivalDateTime: "2026-01-21T14:00",
    prepDays: 3,
    wakeTime: "07:00",
    sleepTime: "23:00",
    usesMelatonin: true,
    usesCaffeine: true,
    usesExercise: false,
    napPreference: "flight_only",
  },
  schedule: {
    total_shift_hours: 8,
    direction: "advance",
    estimated_adaptation_days: 5,
    interventions: [
      {
        date: "2026-01-18",
        day: -2,
        items: [
          { type: "light_seek", time: "07:00", title: "Seek Light", description: "Get bright light exposure" },
        ],
      },
    ],
  },
};

const mockFormState: TripFormState = {
  origin: { code: "SFO", name: "San Francisco International", city: "San Francisco", country: "US", tz: "America/Los_Angeles" },
  destination: { code: "LHR", name: "London Heathrow", city: "London", country: "GB", tz: "Europe/London" },
  departureDateTime: "2026-01-20T20:00",
  arrivalDateTime: "2026-01-21T14:00",
  prepDays: 3,
  wakeTime: "07:00",
  sleepTime: "23:00",
  useMelatonin: true,
  useCaffeine: true,
  useExercise: false,
  napPreference: "flight_only",
};

describe("schedule storage", () => {
  beforeEach(() => {
    // localStorage is cleared by setup.ts afterEach, but clear for safety
    localStorage.clear();
  });

  describe("getSchedule", () => {
    it("returns null when no schedule exists", () => {
      expect(getSchedule()).toBeNull();
    });

    it("returns saved schedule", () => {
      saveSchedule(mockSchedule);
      const result = getSchedule();

      expect(result).not.toBeNull();
      expect(result!.id).toBe(mockSchedule.id);
      expect(result!.request.origin.code).toBe("SFO");
    });

    it("returns null for corrupted data", () => {
      localStorage.setItem("dawnward_schedule", "not valid json{{{");
      expect(getSchedule()).toBeNull();
    });
  });

  describe("saveSchedule", () => {
    it("saves schedule to localStorage", () => {
      saveSchedule(mockSchedule);

      const raw = localStorage.getItem("dawnward_schedule");
      expect(raw).not.toBeNull();

      const parsed = JSON.parse(raw!);
      expect(parsed.id).toBe(mockSchedule.id);
    });

    it("replaces existing schedule", () => {
      saveSchedule(mockSchedule);

      const newSchedule = { ...mockSchedule, id: "new-id-456" };
      saveSchedule(newSchedule);

      const result = getSchedule();
      expect(result!.id).toBe("new-id-456");
    });
  });

  describe("deleteSchedule", () => {
    it("removes schedule from localStorage", () => {
      saveSchedule(mockSchedule);
      expect(getSchedule()).not.toBeNull();

      deleteSchedule();
      expect(getSchedule()).toBeNull();
    });

    it("handles deleting when no schedule exists", () => {
      // Should not throw
      expect(() => deleteSchedule()).not.toThrow();
    });
  });
});

describe("generateId", () => {
  it("generates a string ID", () => {
    const id = generateId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100); // All unique
  });
});

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

describe("storage isolation", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("schedule and form state are stored independently", () => {
    saveSchedule(mockSchedule);
    saveFormState(mockFormState);

    // Both should be retrievable
    expect(getSchedule()).not.toBeNull();
    expect(getFormState()).not.toBeNull();

    // Deleting one shouldn't affect the other
    deleteSchedule();
    expect(getSchedule()).toBeNull();
    expect(getFormState()).not.toBeNull();

    clearFormState();
    expect(getFormState()).toBeNull();
  });
});
