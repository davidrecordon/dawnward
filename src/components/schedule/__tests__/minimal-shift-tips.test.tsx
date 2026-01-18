import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MinimalShiftTips } from "../minimal-shift-tips";

describe("MinimalShiftTips", () => {
  it("renders tips card with shift magnitude", () => {
    render(
      <MinimalShiftTips
        shiftMagnitude={1}
        direction="advance"
        showFullScheduleOption={true}
        onShowFullSchedule={() => {}}
        isFullScheduleVisible={false}
      />
    );

    expect(screen.getByText("Quick Tips for Your 1-Hour Shift")).toBeInTheDocument();
    expect(screen.getByText(/Small timezone changes adapt naturally/)).toBeInTheDocument();
  });

  it("renders all four tips", () => {
    render(
      <MinimalShiftTips
        shiftMagnitude={2}
        direction="delay"
        showFullScheduleOption={false}
        onShowFullSchedule={() => {}}
        isFullScheduleVisible={false}
      />
    );

    expect(screen.getByText("Get bright light in the morning")).toBeInTheDocument();
    expect(screen.getByText("Avoid caffeine within 8 hours of bedtime")).toBeInTheDocument();
    expect(screen.getByText("Sleep at local time from day one")).toBeInTheDocument();
    expect(screen.getByText("Eat meals at local times")).toBeInTheDocument();
  });

  it("shows 'View full schedule' button when option enabled and schedule not visible", () => {
    render(
      <MinimalShiftTips
        shiftMagnitude={1}
        direction="advance"
        showFullScheduleOption={true}
        onShowFullSchedule={() => {}}
        isFullScheduleVisible={false}
      />
    );

    expect(screen.getByText("View full schedule")).toBeInTheDocument();
  });

  it("shows 'Hide full schedule' button when full schedule is visible", () => {
    render(
      <MinimalShiftTips
        shiftMagnitude={1}
        direction="advance"
        showFullScheduleOption={true}
        onShowFullSchedule={() => {}}
        isFullScheduleVisible={true}
      />
    );

    expect(screen.getByText("Hide full schedule")).toBeInTheDocument();
  });

  it("hides toggle button when showFullScheduleOption is false", () => {
    render(
      <MinimalShiftTips
        shiftMagnitude={1}
        direction="advance"
        showFullScheduleOption={false}
        onShowFullSchedule={() => {}}
        isFullScheduleVisible={false}
      />
    );

    expect(screen.queryByText("View full schedule")).not.toBeInTheDocument();
    expect(screen.queryByText("Show tips only")).not.toBeInTheDocument();
  });

  it("calls onShowFullSchedule when toggle button clicked", () => {
    const onShowFullSchedule = vi.fn();

    render(
      <MinimalShiftTips
        shiftMagnitude={1}
        direction="advance"
        showFullScheduleOption={true}
        onShowFullSchedule={onShowFullSchedule}
        isFullScheduleVisible={false}
      />
    );

    fireEvent.click(screen.getByText("View full schedule"));
    expect(onShowFullSchedule).toHaveBeenCalledTimes(1);
  });

  it("adapts tip text based on shift magnitude", () => {
    render(
      <MinimalShiftTips
        shiftMagnitude={2}
        direction="advance"
        showFullScheduleOption={false}
        onShowFullSchedule={() => {}}
        isFullScheduleVisible={false}
      />
    );

    // The sleep tip should mention the specific shift magnitude
    expect(screen.getByText(/A 2-hour shift resolves naturally/)).toBeInTheDocument();
  });
});
