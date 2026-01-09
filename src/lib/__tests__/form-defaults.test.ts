import { describe, it, expect } from "vitest";
import { defaultFormState } from "@/types/trip-form";
import { getFormState } from "../schedule-storage";

describe("defaultFormState (user preference defaults)", () => {
  // These tests document what users see with empty localStorage

  it("has melatonin enabled by default", () => {
    expect(defaultFormState.useMelatonin).toBe(true);
  });

  it("has caffeine enabled by default", () => {
    expect(defaultFormState.useCaffeine).toBe(true);
  });

  it("has exercise disabled by default", () => {
    expect(defaultFormState.useExercise).toBe(false);
  });

  it("has napPreference set to flight_only by default", () => {
    expect(defaultFormState.napPreference).toBe("flight_only");
  });

  it("has scheduleIntensity set to balanced by default", () => {
    expect(defaultFormState.scheduleIntensity).toBe("balanced");
  });

  it("has wakeTime set to 7am by default", () => {
    expect(defaultFormState.wakeTime).toBe("07:00");
  });

  it("has sleepTime set to 10pm by default", () => {
    expect(defaultFormState.sleepTime).toBe("22:00");
  });

  it("has prepDays set to 3 by default", () => {
    expect(defaultFormState.prepDays).toBe(3);
  });

  it("has valid options for PreferenceSelector fields", () => {
    expect(["no", "flight_only", "all_days"]).toContain(
      defaultFormState.napPreference
    );
    expect(["gentle", "balanced", "aggressive"]).toContain(
      defaultFormState.scheduleIntensity
    );
  });

  it("returns all defaults when localStorage is empty (simulating TripPlanner init)", () => {
    // This simulates the TripPlanner component logic:
    // const [formState, setFormState] = useState(defaultFormState);
    // useEffect(() => { const saved = getFormState(); if (saved) { setFormState(...) } })
    //
    // When localStorage is empty, getFormState() returns null,
    // so setFormState never runs, and formState stays as defaultFormState

    localStorage.clear();
    const saved = getFormState(); // returns null with empty localStorage
    expect(saved).toBeNull();

    // With null from localStorage, TripPlanner keeps useState(defaultFormState)
    const effectiveFormState = saved ?? defaultFormState;
    expect(effectiveFormState.useMelatonin).toBe(true);
    expect(effectiveFormState.useCaffeine).toBe(true);
    expect(effectiveFormState.useExercise).toBe(false);
    expect(effectiveFormState.napPreference).toBe("flight_only");
    expect(effectiveFormState.scheduleIntensity).toBe("balanced");
    expect(effectiveFormState.wakeTime).toBe("07:00");
    expect(effectiveFormState.sleepTime).toBe("22:00");
    expect(effectiveFormState.prepDays).toBe(3);
  });
});
