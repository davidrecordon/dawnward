import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InterventionCard } from "../intervention-card";
import type { Intervention } from "@/types/schedule";

/**
 * Create a mock intervention with all required timezone fields.
 * By default creates a preparation phase intervention.
 */
function createMockIntervention(
  overrides: Partial<Intervention> = {}
): Intervention {
  return {
    type: "wake_target",
    title: "Wake Target",
    description: "Time to wake up",
    origin_time: "07:00",
    dest_time: "15:00",
    origin_date: "2026-01-20",
    dest_date: "2026-01-20",
    origin_tz: "America/Los_Angeles",
    dest_tz: "Europe/London",
    phase_type: "preparation",
    show_dual_timezone: false,
    ...overrides,
  };
}

describe("InterventionCard", () => {
  describe("basic rendering", () => {
    it("renders intervention title and description", () => {
      const intervention = createMockIntervention({
        title: "Test Wake Target",
        description: "Wake up and start your day",
      });

      render(<InterventionCard intervention={intervention} />);

      expect(screen.getByText("Test Wake Target")).toBeInTheDocument();
      expect(
        screen.getByText("Wake up and start your day")
      ).toBeInTheDocument();
    });

    it("renders time badge for default variant", () => {
      const intervention = createMockIntervention({
        origin_time: "08:30",
        dest_time: "16:30",
      });

      render(<InterventionCard intervention={intervention} />);

      expect(screen.getByText("8:30 AM")).toBeInTheDocument();
    });

    it("does not render time for nested variant", () => {
      const intervention = createMockIntervention({
        origin_time: "08:30",
        dest_time: "16:30",
      });

      render(<InterventionCard intervention={intervention} variant="nested" />);

      expect(screen.queryByText("8:30 AM")).not.toBeInTheDocument();
    });
  });

  describe("post-arrival dual timezone suppression", () => {
    it("shows single time for post_arrival phase even when showDualTimezone is true", () => {
      const intervention = createMockIntervention({
        phase_type: "post_arrival",
        origin_time: "23:00",
        dest_time: "07:00",
        show_dual_timezone: true,
      });

      render(
        <InterventionCard intervention={intervention} showDualTimezone={true} />
      );

      // Should show destination time only (single badge)
      expect(screen.getByText("7:00 AM")).toBeInTheDocument();
      // Should NOT show origin time
      expect(screen.queryByText("11:00 PM")).not.toBeInTheDocument();
    });

    it("shows single time for adaptation phase even when showDualTimezone is true", () => {
      const intervention = createMockIntervention({
        phase_type: "adaptation",
        origin_time: "22:00",
        dest_time: "06:00",
        show_dual_timezone: true,
      });

      render(
        <InterventionCard intervention={intervention} showDualTimezone={true} />
      );

      // Should show destination time only
      expect(screen.getByText("6:00 AM")).toBeInTheDocument();
      // Should NOT show origin time
      expect(screen.queryByText("10:00 PM")).not.toBeInTheDocument();
    });

    it("shows dual times for preparation phase when showDualTimezone is true", () => {
      const intervention = createMockIntervention({
        phase_type: "preparation",
        origin_time: "08:00",
        dest_time: "16:00",
        show_dual_timezone: true,
      });

      render(
        <InterventionCard intervention={intervention} showDualTimezone={true} />
      );

      // Should show origin time as primary (user is still at origin)
      expect(screen.getByText(/8:00 AM/)).toBeInTheDocument();
      // Should show destination time as secondary
      expect(screen.getByText(/4:00 PM/)).toBeInTheDocument();
    });

    it("shows dual times for pre_departure phase when showDualTimezone is true", () => {
      const intervention = createMockIntervention({
        phase_type: "pre_departure",
        origin_time: "09:00",
        dest_time: "17:00",
        show_dual_timezone: true,
      });

      render(
        <InterventionCard intervention={intervention} showDualTimezone={true} />
      );

      // Should show both times
      expect(screen.getByText(/9:00 AM/)).toBeInTheDocument();
      expect(screen.getByText(/5:00 PM/)).toBeInTheDocument();
    });

    it("shows dual times for in_transit phase when showDualTimezone is true", () => {
      const intervention = createMockIntervention({
        phase_type: "in_transit",
        origin_time: "14:00",
        dest_time: "22:00",
        show_dual_timezone: true,
      });

      render(
        <InterventionCard intervention={intervention} showDualTimezone={true} />
      );

      // Should show destination time as primary (user adapting to dest)
      expect(screen.getByText(/10:00 PM/)).toBeInTheDocument();
      // Should show origin time as secondary
      expect(screen.getByText(/2:00 PM/)).toBeInTheDocument();
    });
  });

  describe("phase-aware time display", () => {
    it("shows origin time as primary for preparation phase", () => {
      const intervention = createMockIntervention({
        phase_type: "preparation",
        origin_time: "07:00",
        dest_time: "15:00",
        show_dual_timezone: true,
      });

      render(
        <InterventionCard intervention={intervention} showDualTimezone={true} />
      );

      // Origin time should be in the primary (larger) position
      const primaryTime = screen.getByText(/7:00 AM/);
      expect(primaryTime).toBeInTheDocument();
    });

    it("shows destination time as primary for in_transit phase", () => {
      const intervention = createMockIntervention({
        phase_type: "in_transit",
        origin_time: "10:00",
        dest_time: "18:00",
        show_dual_timezone: true,
      });

      render(
        <InterventionCard intervention={intervention} showDualTimezone={true} />
      );

      // Dest time should be in the primary position
      const destTime = screen.getByText(/6:00 PM/);
      expect(destTime).toBeInTheDocument();
    });
  });

  describe("flight offset display", () => {
    it("shows flight offset for in-flight interventions", () => {
      const intervention = createMockIntervention({
        phase_type: "in_transit",
        flight_offset_hours: 4.5,
      });

      render(<InterventionCard intervention={intervention} />);

      expect(screen.getByText("~4.5 hours into flight")).toBeInTheDocument();
    });

    it("does not show flight offset for ground interventions", () => {
      const intervention = createMockIntervention({
        phase_type: "preparation",
        flight_offset_hours: undefined,
      });

      render(<InterventionCard intervention={intervention} />);

      expect(screen.queryByText(/hours into flight/)).not.toBeInTheDocument();
    });
  });

  describe("showDualTimezone user preference", () => {
    it("respects user preference to show dual times when backend says no", () => {
      const intervention = createMockIntervention({
        phase_type: "preparation",
        show_dual_timezone: false, // Backend says no
      });

      render(
        <InterventionCard intervention={intervention} showDualTimezone={true} />
      );

      // User preference should override for non-post-arrival phases
      expect(screen.getByText(/7:00 AM/)).toBeInTheDocument();
      expect(screen.getByText(/3:00 PM/)).toBeInTheDocument();
    });

    it("respects backend flag when user preference is off", () => {
      const intervention = createMockIntervention({
        phase_type: "in_transit",
        show_dual_timezone: true, // Backend says yes
      });

      render(
        <InterventionCard
          intervention={intervention}
          showDualTimezone={false}
        />
      );

      // Should still show dual times because backend flag is true
      expect(screen.getByText(/7:00 AM/)).toBeInTheDocument();
      expect(screen.getByText(/3:00 PM/)).toBeInTheDocument();
    });
  });

  describe("same timezone handling", () => {
    it("shows single time when origin and destination timezones are the same", () => {
      const intervention = createMockIntervention({
        origin_tz: "America/Los_Angeles",
        dest_tz: "America/Los_Angeles",
        origin_time: "09:00",
        dest_time: "09:00",
        show_dual_timezone: true,
      });

      render(
        <InterventionCard intervention={intervention} showDualTimezone={true} />
      );

      // Should only show one time (no need for dual display)
      const timeElements = screen.getAllByText(/9:00 AM/);
      expect(timeElements).toHaveLength(1);
    });
  });
});
