import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InFlightSleepCard } from "../inflight-sleep-card";
import type { Intervention } from "@/types/schedule";

/**
 * Create a mock in-flight sleep intervention with all required timezone fields.
 */
function createMockInFlightSleep(
  overrides: Partial<Intervention> = {}
): Intervention {
  return {
    type: "nap_window",
    title: "In-Flight Sleep",
    description: "Your body clock makes sleep easier during this window.",
    flight_offset_hours: 4.5,
    duration_min: 180, // 3 hours
    origin_time: "14:00",
    dest_time: "22:00",
    origin_date: "2026-01-20",
    dest_date: "2026-01-20",
    origin_tz: "America/Los_Angeles",
    dest_tz: "Europe/London",
    phase_type: "in_transit",
    show_dual_timezone: true,
    ...overrides,
  };
}

describe("InFlightSleepCard", () => {
  describe("basic rendering", () => {
    it("renders 'In-Flight Sleep' title", () => {
      const intervention = createMockInFlightSleep();
      render(<InFlightSleepCard intervention={intervention} />);

      expect(screen.getByText("In-Flight Sleep")).toBeInTheDocument();
    });

    it("renders the intervention description", () => {
      const intervention = createMockInFlightSleep({
        description:
          "This is the optimal sleep window for your circadian rhythm.",
      });
      render(<InFlightSleepCard intervention={intervention} />);

      expect(
        screen.getByText(
          "This is the optimal sleep window for your circadian rhythm."
        )
      ).toBeInTheDocument();
    });

    it("renders default description when none provided", () => {
      const intervention = createMockInFlightSleep({
        description: undefined,
      });
      render(<InFlightSleepCard intervention={intervention} />);

      expect(
        screen.getByText(/Your body clock makes sleep easier/)
      ).toBeInTheDocument();
    });
  });

  describe("flight offset display", () => {
    it("shows flight offset in hours", () => {
      const intervention = createMockInFlightSleep({
        flight_offset_hours: 4.5,
      });
      render(<InFlightSleepCard intervention={intervention} />);

      expect(screen.getByText("~4.5 hours into flight")).toBeInTheDocument();
    });

    it("handles zero flight offset", () => {
      const intervention = createMockInFlightSleep({
        flight_offset_hours: 0,
      });
      render(<InFlightSleepCard intervention={intervention} />);

      // Zero hours shows special message
      expect(screen.getByText("As soon as you can")).toBeInTheDocument();
    });

    it("handles integer flight offset", () => {
      const intervention = createMockInFlightSleep({
        flight_offset_hours: 3,
      });
      render(<InFlightSleepCard intervention={intervention} />);

      expect(screen.getByText("~3 hours into flight")).toBeInTheDocument();
    });
  });

  describe("duration display", () => {
    it("shows sleep duration when provided", () => {
      const intervention = createMockInFlightSleep({
        duration_min: 180, // 3 hours
      });
      render(<InFlightSleepCard intervention={intervention} />);

      expect(
        screen.getByText("~3 hours sleep recommended")
      ).toBeInTheDocument();
    });

    it("does not show duration when not provided", () => {
      const intervention = createMockInFlightSleep({
        duration_min: undefined,
      });
      render(<InFlightSleepCard intervention={intervention} />);

      expect(
        screen.queryByText(/hours sleep recommended/)
      ).not.toBeInTheDocument();
    });

    it("rounds duration to nearest hour", () => {
      const intervention = createMockInFlightSleep({
        duration_min: 150, // 2.5 hours
      });
      render(<InFlightSleepCard intervention={intervention} />);

      // Should round to "2" or "3" hours
      expect(
        screen.getByText(/~[23] hours sleep recommended/)
      ).toBeInTheDocument();
    });
  });

  describe("dual timezone display", () => {
    it("shows dual times when show_dual_timezone is true", () => {
      const intervention = createMockInFlightSleep({
        origin_time: "14:00",
        dest_time: "22:00",
        show_dual_timezone: true,
      });
      render(<InFlightSleepCard intervention={intervention} />);

      // Should show destination time as primary
      expect(screen.getByText(/10:00 PM/)).toBeInTheDocument();
      // Should show origin time as secondary
      expect(screen.getByText(/2:00 PM/)).toBeInTheDocument();
    });

    it("shows single time when show_dual_timezone is false and user pref is off", () => {
      const intervention = createMockInFlightSleep({
        origin_time: "14:00",
        dest_time: "22:00",
        show_dual_timezone: false,
      });
      render(
        <InFlightSleepCard
          intervention={intervention}
          showDualTimezone={false}
        />
      );

      // Should show destination time only
      expect(screen.getByText("10:00 PM")).toBeInTheDocument();
      // Should NOT have a secondary time with origin
      expect(screen.queryByText(/2:00 PM/)).not.toBeInTheDocument();
    });

    it("respects user preference to show dual times", () => {
      const intervention = createMockInFlightSleep({
        origin_time: "08:00",
        dest_time: "16:00",
        show_dual_timezone: false, // Backend says no
      });
      render(
        <InFlightSleepCard
          intervention={intervention}
          showDualTimezone={true}
        />
      );

      // User preference should enable dual times
      expect(screen.getByText(/8:00 AM/)).toBeInTheDocument();
      expect(screen.getByText(/4:00 PM/)).toBeInTheDocument();
    });

    it("destination time is primary for in-flight items", () => {
      const intervention = createMockInFlightSleep({
        origin_time: "10:00",
        dest_time: "18:00",
        show_dual_timezone: true,
      });
      render(<InFlightSleepCard intervention={intervention} />);

      // The destination time should be in the primary position (larger text)
      const destTime = screen.getByText(/6:00 PM/);
      expect(destTime).toBeInTheDocument();
      // Check it's in a div with primary styling
      expect(destTime.closest("div")).toHaveClass("text-sm");
    });
  });

  describe("timezone abbreviations", () => {
    it("shows correct timezone abbreviations for winter dates", () => {
      const intervention = createMockInFlightSleep({
        origin_time: "14:00",
        dest_time: "22:00",
        origin_date: "2026-01-20", // Winter
        dest_date: "2026-01-20",
        origin_tz: "America/Los_Angeles",
        dest_tz: "Europe/London",
        show_dual_timezone: true,
      });
      render(<InFlightSleepCard intervention={intervention} />);

      // Should show PST for LA in winter
      expect(screen.getByText(/PST/)).toBeInTheDocument();
      // Should show GMT for London in winter (standard time)
      expect(screen.getByText(/\bGMT\b/)).toBeInTheDocument();
    });

    it("shows correct timezone abbreviations for summer dates", () => {
      const intervention = createMockInFlightSleep({
        origin_time: "14:00",
        dest_time: "22:00",
        origin_date: "2026-07-20", // Summer
        dest_date: "2026-07-20",
        origin_tz: "America/Los_Angeles",
        dest_tz: "Europe/London",
        show_dual_timezone: true,
      });
      render(<InFlightSleepCard intervention={intervention} />);

      // Should show PDT for LA in summer
      expect(screen.getByText(/PDT/)).toBeInTheDocument();
      // Node.js/V8 may return "GMT+1" instead of "BST"
      expect(screen.getByText(/BST|GMT\+1/)).toBeInTheDocument();
    });
  });
});
