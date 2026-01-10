import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DaySection } from "../day-section";
import type { DaySchedule } from "@/types/schedule";
import type { Airport } from "@/types/airport";

// Mock airports for testing
const mockOrigin: Airport = {
  code: "SFO",
  name: "San Francisco International",
  city: "San Francisco",
  country: "US",
  tz: "America/Los_Angeles",
};

const mockDestination: Airport = {
  code: "LHR",
  name: "Heathrow",
  city: "London",
  country: "GB",
  tz: "Europe/London",
};

describe("DaySection", () => {
  describe("nap_window rendering", () => {
    it("renders InterventionCard for nap_window with null flight_offset_hours", () => {
      // This tests the fix for the null vs undefined bug:
      // Python sends None which becomes null in JSON, not undefined.
      // The condition must check for both to correctly distinguish
      // ground naps from in-flight sleep windows.
      const daySchedule: DaySchedule = {
        day: 2,
        date: "2026-01-30",
        items: [
          {
            type: "nap_window",
            time: "09:15",
            title: "Optional nap",
            description: "Nap anytime before 12:15 PM if you're tired.",
            flight_offset_hours: null as unknown as undefined, // Python's None becomes null
          },
        ],
      };

      render(
        <DaySection
          daySchedule={daySchedule}
          origin={mockOrigin}
          destination={mockDestination}
          departureDate="2026-01-28"
          departureTime="10:00"
          arrivalDate="2026-01-28"
          arrivalTime="18:00"
          isCurrentDay={false}
        />
      );

      // Should render as regular InterventionCard with the intervention's title
      expect(screen.getByText("Optional nap")).toBeInTheDocument();
      // Should NOT render as InFlightSleepCard (which shows "In-Flight Sleep")
      expect(screen.queryByText("In-Flight Sleep")).not.toBeInTheDocument();
    });

    it("renders InFlightSleepCard for nap_window with numeric flight_offset_hours", () => {
      const daySchedule: DaySchedule = {
        day: 0,
        date: "2026-01-28",
        items: [
          {
            type: "nap_window",
            time: "14:00",
            title: "Sleep opportunity",
            description:
              "Your body clock makes sleep easier during this window.",
            flight_offset_hours: 4.5, // ULR flight sleep window
          },
        ],
      };

      render(
        <DaySection
          daySchedule={daySchedule}
          origin={mockOrigin}
          destination={mockDestination}
          departureDate="2026-01-28"
          departureTime="10:00"
          arrivalDate="2026-01-29"
          arrivalTime="06:00"
          isCurrentDay={false}
        />
      );

      // Should render as InFlightSleepCard
      expect(screen.getByText("In-Flight Sleep")).toBeInTheDocument();
    });

    it("renders InterventionCard for nap_window with undefined flight_offset_hours", () => {
      const daySchedule: DaySchedule = {
        day: 2,
        date: "2026-01-30",
        items: [
          {
            type: "nap_window",
            time: "09:15",
            title: "Optional nap",
            description: "Nap anytime before 12:15 PM if you're tired.",
            // flight_offset_hours is undefined (not present)
          },
        ],
      };

      render(
        <DaySection
          daySchedule={daySchedule}
          origin={mockOrigin}
          destination={mockDestination}
          departureDate="2026-01-28"
          departureTime="10:00"
          arrivalDate="2026-01-28"
          arrivalTime="18:00"
          isCurrentDay={false}
        />
      );

      // Should render as regular InterventionCard
      expect(screen.getByText("Optional nap")).toBeInTheDocument();
      expect(screen.queryByText("In-Flight Sleep")).not.toBeInTheDocument();
    });
  });
});
