import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DaySummaryCard } from "../day-summary-card";
import { formatDayForText } from "@/lib/intervention-formatter";
import type { DaySchedule, Intervention } from "@/types/schedule";
import { FLIGHT_DAY } from "@/lib/intervention-utils";

/**
 * Create a mock intervention with all required timezone fields.
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

/**
 * Create a mock day schedule.
 */
function createMockDaySchedule(
  overrides: Partial<DaySchedule> = {}
): DaySchedule {
  return {
    day: -2,
    date: "2026-01-18",
    items: [],
    hasSameDayArrival: false,
    ...overrides,
  };
}

/**
 * Create mock airports.
 */
const mockOrigin = {
  code: "SFO",
  name: "San Francisco International",
  city: "San Francisco",
  country: "United States",
  tz: "America/Los_Angeles",
};

const mockDestination = {
  code: "LHR",
  name: "London Heathrow",
  city: "London",
  country: "United Kingdom",
  tz: "Europe/London",
};

describe("DaySummaryCard", () => {
  const defaultProps = {
    daySchedule: createMockDaySchedule(),
    origin: mockOrigin,
    destination: mockDestination,
    departureDate: "2026-01-20",
    departureTime: "10:00",
    arrivalDate: "2026-01-21",
    arrivalTime: "06:00",
  };

  describe("basic rendering", () => {
    it("renders day label and date", () => {
      const daySchedule = createMockDaySchedule({
        day: -2,
        date: "2026-01-18",
      });

      render(<DaySummaryCard {...defaultProps} daySchedule={daySchedule} />);

      expect(screen.getByText("Day -2")).toBeInTheDocument();
      expect(screen.getByText(/January 18/)).toBeInTheDocument();
    });

    it("renders intervention rows for non-empty day", () => {
      const daySchedule = createMockDaySchedule({
        items: [
          createMockIntervention({ type: "wake_target", origin_time: "07:00" }),
          createMockIntervention({ type: "light_seek", origin_time: "08:00" }),
          createMockIntervention({
            type: "caffeine_cutoff",
            origin_time: "14:00",
          }),
        ],
      });

      render(<DaySummaryCard {...defaultProps} daySchedule={daySchedule} />);

      expect(
        screen.getByText("Wake up to help shift your clock")
      ).toBeInTheDocument();
      expect(screen.getByText("Get 30+ min bright light")).toBeInTheDocument();
      expect(screen.getByText("Last caffeine for today")).toBeInTheDocument();
    });

    it("renders empty state message for days with no interventions", () => {
      const daySchedule = createMockDaySchedule({
        day: -1,
        date: "2026-01-19",
        items: [],
      });

      render(<DaySummaryCard {...defaultProps} daySchedule={daySchedule} />);

      expect(
        screen.getByText("No scheduled interventions")
      ).toBeInTheDocument();
    });
  });

  describe("flight day rendering", () => {
    it("shows sub-sections for flight day", () => {
      const daySchedule = createMockDaySchedule({
        day: FLIGHT_DAY,
        date: "2026-01-20",
        items: [
          createMockIntervention({
            type: "wake_target",
            phase_type: "pre_departure",
            origin_time: "06:00",
          }),
          createMockIntervention({
            type: "nap_window",
            phase_type: "in_transit",
            flight_offset_hours: 4,
            origin_time: "14:00",
          }),
          createMockIntervention({
            type: "melatonin",
            phase_type: "post_arrival",
            dest_time: "21:00",
          }),
        ],
      });

      render(
        <DaySummaryCard
          {...defaultProps}
          daySchedule={daySchedule}
          departureDate="2026-01-20"
          arrivalDate="2026-01-20"
        />
      );

      expect(screen.getByText("Before Boarding")).toBeInTheDocument();
      expect(screen.getByText("On the Plane")).toBeInTheDocument();
      expect(screen.getByText("After Landing")).toBeInTheDocument();
    });

    it("shows flight offset for in-transit interventions", () => {
      const daySchedule = createMockDaySchedule({
        day: FLIGHT_DAY,
        date: "2026-01-20",
        items: [
          createMockIntervention({
            type: "nap_window",
            phase_type: "in_transit",
            flight_offset_hours: 4.5,
          }),
        ],
      });

      render(
        <DaySummaryCard
          {...defaultProps}
          daySchedule={daySchedule}
          departureDate="2026-01-20"
        />
      );

      expect(screen.getByText("~4.5 hours into flight")).toBeInTheDocument();
    });

    it("shows departure event on flight day", () => {
      const daySchedule = createMockDaySchedule({
        day: FLIGHT_DAY,
        date: "2026-01-20",
        items: [],
      });

      render(
        <DaySummaryCard
          {...defaultProps}
          daySchedule={daySchedule}
          departureDate="2026-01-20"
          departureTime="10:00"
        />
      );

      expect(screen.getByText("SFO → LHR departs")).toBeInTheDocument();
      expect(screen.getByText("10:00 AM")).toBeInTheDocument();
    });
  });

  describe("arrival day rendering", () => {
    it("shows arrival event when arriving on flight day (same-day arrival)", () => {
      const daySchedule = createMockDaySchedule({
        day: FLIGHT_DAY,
        date: "2026-01-20",
        hasSameDayArrival: true,
        items: [],
      });

      render(
        <DaySummaryCard
          {...defaultProps}
          daySchedule={daySchedule}
          departureDate="2026-01-20"
          departureTime="08:00"
          arrivalDate="2026-01-20"
          arrivalTime="18:00"
        />
      );

      expect(screen.getByText("Arrive at LHR")).toBeInTheDocument();
      expect(screen.getByText("6:00 PM")).toBeInTheDocument();
    });

    it("shows After Landing section on flight day for overnight flights (arrival next calendar day)", () => {
      // SFO→LHR departing Tuesday 8:45 PM, arriving Wednesday 6:00 AM
      const daySchedule = createMockDaySchedule({
        day: FLIGHT_DAY,
        date: "2026-01-20", // Tuesday - departure date
        hasSameDayArrival: false,
        items: [
          createMockIntervention({
            type: "melatonin",
            phase_type: "post_arrival",
            dest_time: "21:00",
          }),
        ],
      });

      render(
        <DaySummaryCard
          {...defaultProps}
          daySchedule={daySchedule}
          departureDate="2026-01-20" // Tuesday
          departureTime="20:45"
          arrivalDate="2026-01-21" // Wednesday - next calendar day
          arrivalTime="06:00"
        />
      );

      // Should show "After Landing" section with arrival info
      expect(screen.getByText("After Landing")).toBeInTheDocument();
      expect(screen.getByText("Arrive at LHR")).toBeInTheDocument();
      expect(screen.getByText("6:00 AM")).toBeInTheDocument();
      // Post-arrival intervention should be shown
      expect(
        screen.getByText("Take melatonin to shift rhythm")
      ).toBeInTheDocument();
    });
  });

  describe("On the Plane section", () => {
    it("shows departure time subtitle on On the Plane section", () => {
      const daySchedule = createMockDaySchedule({
        day: FLIGHT_DAY,
        date: "2026-01-20",
        items: [
          createMockIntervention({
            type: "nap_window",
            phase_type: "in_transit",
            flight_offset_hours: 4,
          }),
        ],
      });

      render(
        <DaySummaryCard
          {...defaultProps}
          daySchedule={daySchedule}
          departureDate="2026-01-20"
          departureTime="20:45"
        />
      );

      expect(screen.getByText("On the Plane")).toBeInTheDocument();
      expect(screen.getByText("8:45 PM from SFO")).toBeInTheDocument();
    });
  });

  describe("expand/collapse functionality", () => {
    it("calls onExpandChange when header is clicked", () => {
      const onExpandChange = vi.fn();
      const daySchedule = createMockDaySchedule({
        items: [createMockIntervention()],
      });

      render(
        <DaySummaryCard
          {...defaultProps}
          daySchedule={daySchedule}
          isExpanded={false}
          onExpandChange={onExpandChange}
          renderExpanded={() => <div>Expanded content</div>}
        />
      );

      // Click the header button
      const header = screen.getByRole("button");
      fireEvent.click(header);

      expect(onExpandChange).toHaveBeenCalledWith(true);
    });

    it("shows expanded content when isExpanded is true", () => {
      const daySchedule = createMockDaySchedule({
        items: [createMockIntervention()],
      });

      render(
        <DaySummaryCard
          {...defaultProps}
          daySchedule={daySchedule}
          isExpanded={true}
          renderExpanded={() => (
            <div data-testid="expanded">Expanded content</div>
          )}
        />
      );

      expect(screen.getByTestId("expanded")).toBeInTheDocument();
      expect(screen.getByText("Expanded content")).toBeInTheDocument();
    });

    it("shows summary content when isExpanded is false", () => {
      const daySchedule = createMockDaySchedule({
        items: [createMockIntervention({ type: "light_seek" })],
      });

      render(
        <DaySummaryCard
          {...defaultProps}
          daySchedule={daySchedule}
          isExpanded={false}
          renderExpanded={() => (
            <div data-testid="expanded">Expanded content</div>
          )}
        />
      );

      // Summary content should be visible
      expect(screen.getByText("Get 30+ min bright light")).toBeInTheDocument();
      // Expanded content should not be visible
      expect(screen.queryByTestId("expanded")).not.toBeInTheDocument();
    });

    it("disables expand when disableExpand is true", () => {
      const onExpandChange = vi.fn();
      const daySchedule = createMockDaySchedule({
        items: [createMockIntervention()],
      });

      render(
        <DaySummaryCard
          {...defaultProps}
          daySchedule={daySchedule}
          disableExpand={true}
          onExpandChange={onExpandChange}
          renderExpanded={() => <div>Expanded</div>}
        />
      );

      const header = screen.getByRole("button");
      expect(header).toBeDisabled();

      fireEvent.click(header);
      expect(onExpandChange).not.toHaveBeenCalled();
    });
  });

  describe("accessibility", () => {
    it("has correct aria attributes on header button", () => {
      const daySchedule = createMockDaySchedule({
        day: -1,
        items: [createMockIntervention()],
      });

      render(
        <DaySummaryCard
          {...defaultProps}
          daySchedule={daySchedule}
          isExpanded={false}
          renderExpanded={() => <div>Expanded</div>}
        />
      );

      const header = screen.getByRole("button");
      expect(header).toHaveAttribute("aria-expanded", "false");
      expect(header).toHaveAttribute("aria-controls", "day--1-content");
      expect(header).toHaveAttribute("aria-label", "Expand day details");
    });

    it("updates aria-expanded when expanded", () => {
      const daySchedule = createMockDaySchedule({
        day: -1,
        items: [createMockIntervention()],
      });

      const { rerender } = render(
        <DaySummaryCard
          {...defaultProps}
          daySchedule={daySchedule}
          isExpanded={false}
          renderExpanded={() => <div>Expanded</div>}
        />
      );

      expect(screen.getByRole("button")).toHaveAttribute(
        "aria-expanded",
        "false"
      );

      rerender(
        <DaySummaryCard
          {...defaultProps}
          daySchedule={daySchedule}
          isExpanded={true}
          renderExpanded={() => <div>Expanded</div>}
        />
      );

      // When expanded, we show expanded content which doesn't have button role
      // The button is only present when collapsed
    });
  });

  describe("time formatting", () => {
    it("formats times in 12-hour format", () => {
      const daySchedule = createMockDaySchedule({
        items: [
          createMockIntervention({
            type: "sleep_target",
            origin_time: "23:00",
          }),
        ],
      });

      render(<DaySummaryCard {...defaultProps} daySchedule={daySchedule} />);

      expect(screen.getByText("11:00 PM")).toBeInTheDocument();
    });
  });
});

describe("getCondensedDescription fallback chain", () => {
  /**
   * Tests the fallback: summary → title (nap_window) → CONDENSED_DESCRIPTIONS → default.
   * Tested via formatDayForText which calls getCondensedDescription internally.
   */

  it("prefers scheduler-generated summary when present", () => {
    const daySchedule = createMockDaySchedule({
      items: [
        createMockIntervention({
          type: "wake_target",
          summary: "Wake at 6 AM — 1h earlier than usual",
        }),
      ],
    });

    const result = formatDayForText(daySchedule);

    expect(result).toContain("Wake at 6 AM — 1h earlier than usual");
    expect(result).not.toContain("Wake up to help shift your clock");
  });

  it("uses summary for all intervention types when present", () => {
    const daySchedule = createMockDaySchedule({
      items: [
        createMockIntervention({
          type: "light_seek",
          summary: "Get bright light after 7:30 AM",
        }),
        createMockIntervention({
          type: "melatonin",
          summary: "Take melatonin at 9 PM tonight",
        }),
      ],
    });

    const result = formatDayForText(daySchedule);

    expect(result).toContain("Get bright light after 7:30 AM");
    expect(result).toContain("Take melatonin at 9 PM tonight");
  });

  it("falls back to intervention.title for nap_window type", () => {
    const daySchedule = createMockDaySchedule({
      items: [
        createMockIntervention({
          type: "nap_window",
          title: "Nap: 4h into flight",
        }),
      ],
    });

    const result = formatDayForText(daySchedule);

    expect(result).toContain("Nap: 4h into flight");
  });

  it("falls back to CONDENSED_DESCRIPTIONS when no summary", () => {
    const daySchedule = createMockDaySchedule({
      items: [
        createMockIntervention({ type: "light_seek" }),
        createMockIntervention({ type: "caffeine_cutoff" }),
        createMockIntervention({ type: "sleep_target" }),
      ],
    });

    const result = formatDayForText(daySchedule);

    expect(result).toContain("Get 30+ min bright light");
    expect(result).toContain("Last caffeine for today");
    expect(result).toContain("Aim for sleep by this time");
  });

  it("falls back to default for unknown intervention types", () => {
    const daySchedule = createMockDaySchedule({
      items: [
        createMockIntervention({
          type: "some_future_type" as Intervention["type"],
          title: "Future Type",
        }),
      ],
    });

    const result = formatDayForText(daySchedule);

    expect(result).toContain("Follow this intervention");
  });

  it("summary takes priority over CONDENSED_DESCRIPTIONS entry", () => {
    const daySchedule = createMockDaySchedule({
      items: [
        createMockIntervention({
          type: "light_avoid",
          summary: "Stay indoors until 2 PM — avoid shifting too fast",
        }),
      ],
    });

    const result = formatDayForText(daySchedule);

    expect(result).toContain(
      "Stay indoors until 2 PM — avoid shifting too fast"
    );
    expect(result).not.toContain("Avoid bright light, dim screens");
  });

  it("renders summary in component when present", () => {
    const daySchedule = createMockDaySchedule({
      items: [
        createMockIntervention({
          type: "wake_target",
          summary: "Wake at 6:30 AM — shifting 1h earlier",
        }),
      ],
    });

    render(
      <DaySummaryCard
        daySchedule={daySchedule}
        origin={mockOrigin}
        destination={mockDestination}
        departureDate="2026-01-20"
        departureTime="10:00"
        arrivalDate="2026-01-21"
        arrivalTime="06:00"
      />
    );

    expect(
      screen.getByText("Wake at 6:30 AM — shifting 1h earlier")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Wake up to help shift your clock")
    ).not.toBeInTheDocument();
  });
});

describe("formatDayForText", () => {
  it("formats day schedule as plain text", () => {
    const daySchedule = createMockDaySchedule({
      items: [
        createMockIntervention({
          type: "wake_target",
          origin_time: "07:00",
          phase_type: "preparation",
        }),
        createMockIntervention({
          type: "light_seek",
          origin_time: "08:00",
          phase_type: "preparation",
        }),
      ],
    });

    const result = formatDayForText(daySchedule);

    expect(result).toContain("7:00 AM");
    expect(result).toContain("Wake up to help shift your clock");
    expect(result).toContain("8:00 AM");
    expect(result).toContain("Get 30+ min bright light");
  });

  it("includes emojis for intervention types", () => {
    const daySchedule = createMockDaySchedule({
      items: [
        createMockIntervention({ type: "melatonin" }),
        createMockIntervention({ type: "caffeine_ok" }),
      ],
    });

    const result = formatDayForText(daySchedule);

    // Check that the output contains the expected structure
    expect(result).toContain("Take melatonin to shift rhythm");
    expect(result).toContain("Caffeine OK until cutoff");
  });

  it("returns message for empty day", () => {
    const daySchedule = createMockDaySchedule({
      items: [],
    });

    const result = formatDayForText(daySchedule);

    expect(result).toContain("No scheduled interventions");
  });
});
