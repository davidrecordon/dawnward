import { describe, it, expect } from "vitest";
import {
  validateTripForm,
  isValidTrip,
  type TripValidationInput,
} from "../trip-validation";

// Mock airports with timezone info
const tokyoAirport = { code: "NRT", tz: "Asia/Tokyo" };
const laAirport = { code: "LAX", tz: "America/Los_Angeles" };
const sydneyAirport = { code: "SYD", tz: "Australia/Sydney" };
const nyAirport = { code: "JFK", tz: "America/New_York" };
const londonAirport = { code: "LHR", tz: "Europe/London" };

describe("validateTripForm", () => {
  describe("dateline-crossing flights (valid)", () => {
    it("accepts Tokyo to LA flight where local arrival time is before departure time", () => {
      // Tokyo 5pm Jan 20 -> LA 11am Jan 20 (same calendar day!)
      // This is valid: 11 hour flight crossing the dateline
      const input: TripValidationInput = {
        origin: tokyoAirport,
        destination: laAirport,
        departureDateTime: "2026-01-20T17:00",
        arrivalDateTime: "2026-01-20T11:00",
      };

      const errors = validateTripForm(input);

      expect(errors.form).toBeUndefined();
      expect(isValidTrip(errors)).toBe(true);
    });

    it("accepts Sydney to LA flight where local arrival time is before departure time", () => {
      // Sydney 10am Jan 21 -> LA 6am Jan 21 (same calendar day!)
      // This is valid: 15 hour flight crossing the dateline
      const input: TripValidationInput = {
        origin: sydneyAirport,
        destination: laAirport,
        departureDateTime: "2026-01-21T10:00",
        arrivalDateTime: "2026-01-21T06:00",
      };

      const errors = validateTripForm(input);

      expect(errors.form).toBeUndefined();
      expect(isValidTrip(errors)).toBe(true);
    });

    it("accepts Tokyo to LA arriving on previous calendar day", () => {
      // Tokyo 11pm Jan 21 -> LA 5pm Jan 21 (appears to be earlier!)
      // Naive comparison would reject this
      const input: TripValidationInput = {
        origin: tokyoAirport,
        destination: laAirport,
        departureDateTime: "2026-01-21T23:00",
        arrivalDateTime: "2026-01-21T17:00",
      };

      const errors = validateTripForm(input);

      expect(errors.form).toBeUndefined();
      expect(isValidTrip(errors)).toBe(true);
    });
  });

  describe("invalid flight times", () => {
    it("rejects flight where arrival is truly before departure", () => {
      // LA 3pm Jan 20 -> NY 2pm Jan 20
      // LA is UTC-8, NY is UTC-5 (3 hours ahead)
      // 3pm LA = 11pm UTC, 2pm NY = 7pm UTC
      // Arrival (7pm UTC) is BEFORE departure (11pm UTC) - invalid!
      const input: TripValidationInput = {
        origin: laAirport,
        destination: nyAirport,
        departureDateTime: "2026-01-20T15:00",
        arrivalDateTime: "2026-01-20T14:00",
      };

      const errors = validateTripForm(input);

      expect(errors.form).toBe("Your arrival time needs to be after departure");
      expect(isValidTrip(errors)).toBe(false);
    });

    it("rejects flight where arrival equals departure (zero duration)", () => {
      // Same absolute time = 0 duration, invalid
      // 12pm LA = 3pm NY (same absolute moment)
      const input: TripValidationInput = {
        origin: laAirport,
        destination: nyAirport,
        departureDateTime: "2026-01-20T12:00",
        arrivalDateTime: "2026-01-20T15:00",
      };

      const errors = validateTripForm(input);

      expect(errors.form).toBe("Your arrival time needs to be after departure");
      expect(isValidTrip(errors)).toBe(false);
    });

    it("rejects same-timezone flight where arrival is before departure", () => {
      // Same timezone, arrival clearly before departure
      const input: TripValidationInput = {
        origin: nyAirport,
        destination: { code: "BOS", tz: "America/New_York" },
        departureDateTime: "2026-01-20T15:00",
        arrivalDateTime: "2026-01-20T14:00",
      };

      const errors = validateTripForm(input);

      expect(errors.form).toBe("Your arrival time needs to be after departure");
      expect(isValidTrip(errors)).toBe(false);
    });
  });

  describe("valid normal flights", () => {
    it("accepts normal eastward flight (LA to NY)", () => {
      // LA 8am Jan 20 -> NY 4pm Jan 20
      // Duration: 5 hours - valid
      const input: TripValidationInput = {
        origin: laAirport,
        destination: nyAirport,
        departureDateTime: "2026-01-20T08:00",
        arrivalDateTime: "2026-01-20T16:00",
      };

      const errors = validateTripForm(input);

      expect(errors.form).toBeUndefined();
      expect(isValidTrip(errors)).toBe(true);
    });

    it("accepts normal westward flight (NY to LA)", () => {
      // NY 8am Jan 20 -> LA 11am Jan 20
      // Duration: 6 hours - valid
      const input: TripValidationInput = {
        origin: nyAirport,
        destination: laAirport,
        departureDateTime: "2026-01-20T08:00",
        arrivalDateTime: "2026-01-20T11:00",
      };

      const errors = validateTripForm(input);

      expect(errors.form).toBeUndefined();
      expect(isValidTrip(errors)).toBe(true);
    });

    it("accepts transatlantic flight (NY to London)", () => {
      // NY 8pm Jan 20 -> London 8am Jan 21
      // Duration: ~7 hours - valid
      const input: TripValidationInput = {
        origin: nyAirport,
        destination: londonAirport,
        departureDateTime: "2026-01-20T20:00",
        arrivalDateTime: "2026-01-21T08:00",
      };

      const errors = validateTripForm(input);

      expect(errors.form).toBeUndefined();
      expect(isValidTrip(errors)).toBe(true);
    });

    it("accepts overnight flight in same timezone", () => {
      // Short hop: NY 11pm -> Boston 12:30am next day
      const input: TripValidationInput = {
        origin: nyAirport,
        destination: { code: "BOS", tz: "America/New_York" },
        departureDateTime: "2026-01-20T23:00",
        arrivalDateTime: "2026-01-21T00:30",
      };

      const errors = validateTripForm(input);

      expect(errors.form).toBeUndefined();
      expect(isValidTrip(errors)).toBe(true);
    });
  });

  describe("field validation", () => {
    it("requires origin airport", () => {
      const input: TripValidationInput = {
        origin: null,
        destination: laAirport,
        departureDateTime: "2026-01-20T08:00",
        arrivalDateTime: "2026-01-20T16:00",
      };

      const errors = validateTripForm(input);

      expect(errors.origin).toBe("Please select a departure airport");
      expect(isValidTrip(errors)).toBe(false);
    });

    it("requires destination airport", () => {
      const input: TripValidationInput = {
        origin: laAirport,
        destination: null,
        departureDateTime: "2026-01-20T08:00",
        arrivalDateTime: "2026-01-20T16:00",
      };

      const errors = validateTripForm(input);

      expect(errors.destination).toBe("Please select an arrival airport");
      expect(isValidTrip(errors)).toBe(false);
    });

    it("requires departure datetime", () => {
      const input: TripValidationInput = {
        origin: laAirport,
        destination: nyAirport,
        departureDateTime: "",
        arrivalDateTime: "2026-01-20T16:00",
      };

      const errors = validateTripForm(input);

      expect(errors.departureDateTime).toBe("Please select when you depart");
      expect(isValidTrip(errors)).toBe(false);
    });

    it("requires arrival datetime", () => {
      const input: TripValidationInput = {
        origin: laAirport,
        destination: nyAirport,
        departureDateTime: "2026-01-20T08:00",
        arrivalDateTime: "",
      };

      const errors = validateTripForm(input);

      expect(errors.arrivalDateTime).toBe("Please select when you arrive");
      expect(isValidTrip(errors)).toBe(false);
    });

    it("rejects same origin and destination", () => {
      const input: TripValidationInput = {
        origin: laAirport,
        destination: laAirport,
        departureDateTime: "2026-01-20T08:00",
        arrivalDateTime: "2026-01-20T16:00",
      };

      const errors = validateTripForm(input);

      expect(errors.form).toBe(
        "Your origin and destination can't be the same airport"
      );
      expect(isValidTrip(errors)).toBe(false);
    });
  });

  describe("skips time validation when airports are missing", () => {
    it("does not check flight duration when origin is missing", () => {
      // Even though times look invalid, we can't compute duration without airports
      const input: TripValidationInput = {
        origin: null,
        destination: laAirport,
        departureDateTime: "2026-01-20T15:00",
        arrivalDateTime: "2026-01-20T10:00", // looks like negative duration
      };

      const errors = validateTripForm(input);

      // Should only have origin error, not form error about arrival time
      expect(errors.origin).toBeDefined();
      expect(errors.form).toBeUndefined();
    });

    it("does not check flight duration when destination is missing", () => {
      const input: TripValidationInput = {
        origin: laAirport,
        destination: null,
        departureDateTime: "2026-01-20T15:00",
        arrivalDateTime: "2026-01-20T10:00",
      };

      const errors = validateTripForm(input);

      expect(errors.destination).toBeDefined();
      expect(errors.form).toBeUndefined();
    });
  });
});
