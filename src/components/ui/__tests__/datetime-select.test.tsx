import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DateTimeSelect } from "../datetime-select";

// Mock TimeSelect to avoid testing its internals
vi.mock("@/components/ui/time-select", () => ({
  TimeSelect: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  }) => (
    <select
      data-testid="time-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={placeholder}
    >
      <option value="">Select</option>
      <option value="12:00">12:00</option>
      <option value="16:30">16:30</option>
    </select>
  ),
}));

describe("DateTimeSelect", () => {
  let onChange: (value: string) => void;

  beforeEach(() => {
    onChange = vi.fn();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-08T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("date picker default positioning", () => {
    it("sets input value to ~1 week from now when clicked with no date", () => {
      render(<DateTimeSelect value="" onChange={onChange} />);

      const dateInput = screen.getByLabelText("Select date");
      // showPicker() doesn't exist in jsdom, so the catch branch will call focus()
      // But we can verify the input value was set before the attempt
      const wrapper = dateInput.closest(".relative")!;
      fireEvent.click(wrapper);

      // Input value should be set to ~7 days from now (2026-02-15)
      expect((dateInput as HTMLInputElement).value).toBe("2026-02-15");
    });

    it("does NOT override input value when a date is already selected", () => {
      render(<DateTimeSelect value="2026-03-01T16:30" onChange={onChange} />);

      const dateInput = screen.getByLabelText("Select date");
      const wrapper = dateInput.closest(".relative")!;
      fireEvent.click(wrapper);

      // Value should stay as the controlled value, not changed to a week from now
      expect((dateInput as HTMLInputElement).value).toBe("2026-03-01");
    });

    it("uses current date for the 7-day offset calculation", () => {
      // Move to a different date
      vi.setSystemTime(new Date("2026-06-20T09:00:00"));

      render(<DateTimeSelect value="" onChange={onChange} />);

      const dateInput = screen.getByLabelText("Select date");
      const wrapper = dateInput.closest(".relative")!;
      fireEvent.click(wrapper);

      expect((dateInput as HTMLInputElement).value).toBe("2026-06-27");
    });
  });

  describe("date selection", () => {
    it("calls onChange with date and default noon time when no time selected", () => {
      render(<DateTimeSelect value="" onChange={onChange} />);

      const dateInput = screen.getByLabelText("Select date");
      fireEvent.change(dateInput, { target: { value: "2026-02-20" } });

      expect(onChange).toHaveBeenCalledWith("2026-02-20T12:00");
    });

    it("calls onChange preserving existing time when date changes", () => {
      render(<DateTimeSelect value="2026-02-15T16:30" onChange={onChange} />);

      const dateInput = screen.getByLabelText("Select date");
      fireEvent.change(dateInput, { target: { value: "2026-02-20" } });

      expect(onChange).toHaveBeenCalledWith("2026-02-20T16:30");
    });

    it("calls onChange with empty string when date is cleared", () => {
      render(<DateTimeSelect value="2026-02-15T16:30" onChange={onChange} />);

      const dateInput = screen.getByLabelText("Select date");
      fireEvent.change(dateInput, { target: { value: "" } });

      expect(onChange).toHaveBeenCalledWith("");
    });
  });

  describe("time selection", () => {
    it("calls onChange combining existing date with new time", () => {
      render(<DateTimeSelect value="2026-02-15T12:00" onChange={onChange} />);

      const timeSelect = screen.getByTestId("time-select");
      fireEvent.change(timeSelect, { target: { value: "16:30" } });

      expect(onChange).toHaveBeenCalledWith("2026-02-15T16:30");
    });

    it("uses today as default date when time is selected with no date", () => {
      render(<DateTimeSelect value="" onChange={onChange} />);

      const timeSelect = screen.getByTestId("time-select");
      fireEvent.change(timeSelect, { target: { value: "16:30" } });

      expect(onChange).toHaveBeenCalledWith("2026-02-08T16:30");
    });
  });

  describe("display formatting", () => {
    it("shows 'Select date' placeholder when no date selected", () => {
      render(<DateTimeSelect value="" onChange={onChange} />);
      expect(screen.getByText("Select date")).toBeInTheDocument();
    });

    it("shows formatted date when date is selected", () => {
      render(<DateTimeSelect value="2026-02-15T16:30" onChange={onChange} />);
      expect(screen.getByText("Feb 15, 2026")).toBeInTheDocument();
    });
  });

  describe("error styling", () => {
    it("applies error border when hasError is true", () => {
      const { container } = render(
        <DateTimeSelect value="" onChange={onChange} hasError />
      );

      const styledDiv = container.querySelector(".border-\\[\\#F4A574\\]");
      expect(styledDiv).toBeInTheDocument();
    });
  });

  describe("iOS Safari compatibility", () => {
    it("date input is not pointer-events-none (allows direct taps)", () => {
      render(<DateTimeSelect value="" onChange={onChange} />);

      const dateInput = screen.getByLabelText("Select date");
      expect(dateInput.className).not.toContain("pointer-events-none");
    });

    it("date input is positioned for tap interaction (absolute inset-0)", () => {
      render(<DateTimeSelect value="" onChange={onChange} />);

      const dateInput = screen.getByLabelText("Select date");
      expect(dateInput.className).toContain("absolute");
      expect(dateInput.className).toContain("inset-0");
    });
  });
});
