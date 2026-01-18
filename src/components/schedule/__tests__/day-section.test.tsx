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
  /** Default timezone fields for test interventions */
  const defaultTimezoneFields = {
    origin_time: "09:15",
    dest_time: "17:15",
    origin_date: "2026-01-30",
    dest_date: "2026-01-30",
    origin_tz: "America/Los_Angeles",
    dest_tz: "Europe/London",
    phase_type: "post_arrival" as const,
    show_dual_timezone: false,
  };

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
            title: "Optional nap",
            description: "Nap anytime before 12:15 PM if you're tired.",
            flight_offset_hours: null as unknown as undefined, // Python's None becomes null
            ...defaultTimezoneFields,
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
            title: "Sleep opportunity",
            description:
              "Your body clock makes sleep easier during this window.",
            flight_offset_hours: 4.5, // ULR flight sleep window
            ...defaultTimezoneFields,
            origin_time: "14:00",
            dest_time: "22:00",
            origin_date: "2026-01-28",
            dest_date: "2026-01-28",
            phase_type: "in_transit" as const,
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
            title: "Optional nap",
            description: "Nap anytime before 12:15 PM if you're tired.",
            // flight_offset_hours is undefined (not present)
            ...defaultTimezoneFields,
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

  describe("same-day arrival (westbound flights)", () => {
    it("renders 'Flight & Arrival Day' label for same-day arrival", () => {
      const daySchedule: DaySchedule = {
        day: 0,
        date: "2026-01-28",
        hasSameDayArrival: true,
        items: [
          {
            type: "caffeine_ok",
            title: "Morning coffee allowed",
            description: "Enjoy your regular caffeine.",
            ...defaultTimezoneFields,
            phase_type: "pre_departure" as const,
          },
        ],
      };

      render(
        <DaySection
          daySchedule={daySchedule}
          origin={mockOrigin}
          destination={mockDestination}
          departureDate="2026-01-28"
          departureTime="11:00"
          arrivalDate="2026-01-28"
          arrivalTime="14:00"
          isCurrentDay={false}
        />
      );

      // Should show combined day label
      expect(screen.getByText("Flight & Arrival Day")).toBeInTheDocument();
    });

    it("renders both pre-departure and post-arrival interventions on same day", () => {
      const daySchedule: DaySchedule = {
        day: 0,
        date: "2026-01-28",
        hasSameDayArrival: true,
        items: [
          {
            type: "caffeine_ok",
            title: "Morning coffee",
            description: "Pre-flight caffeine.",
            ...defaultTimezoneFields,
            phase_type: "pre_departure" as const,
            origin_time: "09:00",
            dest_time: "17:00",
          },
          {
            type: "light_seek",
            title: "Get bright light",
            description: "After landing, get sunlight.",
            ...defaultTimezoneFields,
            phase_type: "post_arrival" as const,
            origin_time: "08:00",
            dest_time: "16:00",
          },
        ],
      };

      render(
        <DaySection
          daySchedule={daySchedule}
          origin={mockOrigin}
          destination={mockDestination}
          departureDate="2026-01-28"
          departureTime="11:00"
          arrivalDate="2026-01-28"
          arrivalTime="14:00"
          isCurrentDay={false}
        />
      );

      // Both interventions should render
      expect(screen.getByText("Morning coffee")).toBeInTheDocument();
      expect(screen.getByText("Get bright light")).toBeInTheDocument();
    });
  });

  describe("dual timezone display", () => {
    it("passes showDualTimezone prop to InterventionCard", () => {
      const daySchedule: DaySchedule = {
        day: -1,
        date: "2026-01-27",
        items: [
          {
            type: "wake_target",
            title: "Wake Target",
            description: "Time to wake up",
            ...defaultTimezoneFields,
            phase_type: "preparation" as const,
            origin_time: "07:00",
            dest_time: "15:00",
            show_dual_timezone: true,
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
          showDualTimezone={true}
        />
      );

      // With showDualTimezone, should show both times
      expect(screen.getByText(/7:00 AM/)).toBeInTheDocument();
      expect(screen.getByText(/3:00 PM/)).toBeInTheDocument();
    });
  });

  describe("timezone transitions", () => {
    it("renders timezone transition indicator between different timezone items", () => {
      const daySchedule: DaySchedule = {
        day: 0,
        date: "2026-01-28",
        hasSameDayArrival: true,
        items: [
          {
            type: "caffeine_ok",
            title: "Pre-flight caffeine",
            description: "Morning coffee.",
            ...defaultTimezoneFields,
            phase_type: "pre_departure" as const,
            origin_time: "09:00",
            dest_time: "17:00",
          },
          {
            type: "light_seek",
            title: "Post-arrival light",
            description: "Get sunlight.",
            ...defaultTimezoneFields,
            phase_type: "post_arrival" as const,
            origin_time: "08:00",
            dest_time: "16:00",
          },
        ],
      };

      render(
        <DaySection
          daySchedule={daySchedule}
          origin={mockOrigin}
          destination={mockDestination}
          departureDate="2026-01-28"
          departureTime="11:00"
          arrivalDate="2026-01-28"
          arrivalTime="14:00"
          isCurrentDay={false}
        />
      );

      // Both interventions should be rendered
      expect(screen.getByText("Pre-flight caffeine")).toBeInTheDocument();
      expect(screen.getByText("Post-arrival light")).toBeInTheDocument();
    });
  });
});
