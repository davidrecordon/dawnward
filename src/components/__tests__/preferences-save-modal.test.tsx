import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PreferencesSaveModal } from "../preferences-save-modal";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("PreferencesSaveModal", () => {
  // Saveable preferences only - excludes trip-specific prepDays and scheduleIntensity
  const mockPreferences = {
    wakeTime: "07:00",
    sleepTime: "23:00",
    useMelatonin: true,
    useCaffeine: true,
    useExercise: false,
    napPreference: "flight_only",
  };

  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("renders modal content when open", () => {
    render(
      <PreferencesSaveModal
        open={true}
        onClose={mockOnClose}
        preferences={mockPreferences}
      />
    );

    expect(screen.getByText("Save as your defaults?")).toBeInTheDocument();
    expect(
      screen.getByText(/You changed your schedule preferences/)
    ).toBeInTheDocument();
    expect(screen.getByText("Not now")).toBeInTheDocument();
    expect(screen.getByText("Save Defaults")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <PreferencesSaveModal
        open={false}
        onClose={mockOnClose}
        preferences={mockPreferences}
      />
    );

    expect(
      screen.queryByText("Save as your defaults?")
    ).not.toBeInTheDocument();
  });

  it("calls onClose(false) when 'Not now' is clicked", () => {
    render(
      <PreferencesSaveModal
        open={true}
        onClose={mockOnClose}
        preferences={mockPreferences}
      />
    );

    fireEvent.click(screen.getByText("Not now"));

    expect(mockOnClose).toHaveBeenCalledWith(false);
  });

  it("calls PATCH API and onClose(true) when 'Save Defaults' is clicked", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    render(
      <PreferencesSaveModal
        open={true}
        onClose={mockOnClose}
        preferences={mockPreferences}
      />
    );

    fireEvent.click(screen.getByText("Save Defaults"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: expect.any(String),
      });
    });

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalledWith(true);
    });
  });

  it("maps form field names to database field names (excludes trip-specific fields)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    render(
      <PreferencesSaveModal
        open={true}
        onClose={mockOnClose}
        preferences={mockPreferences}
      />
    );

    fireEvent.click(screen.getByText("Save Defaults"));

    await waitFor(() => {
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      // Check field name mapping - prepDays and scheduleIntensity are excluded
      expect(callBody).toEqual({
        defaultWakeTime: "07:00",
        defaultSleepTime: "23:00",
        usesMelatonin: true,
        usesCaffeine: true,
        usesExercise: false,
        napPreference: "flight_only",
      });
    });
  });

  it("calls onClose(false) on API error", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    render(
      <PreferencesSaveModal
        open={true}
        onClose={mockOnClose}
        preferences={mockPreferences}
      />
    );

    fireEvent.click(screen.getByText("Save Defaults"));

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalledWith(false);
    });
  });

  it("calls onClose(false) on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    render(
      <PreferencesSaveModal
        open={true}
        onClose={mockOnClose}
        preferences={mockPreferences}
      />
    );

    fireEvent.click(screen.getByText("Save Defaults"));

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalledWith(false);
    });
  });

  it("shows loading state while saving", async () => {
    // Create a promise we can control
    let resolvePromise: (value: { ok: boolean }) => void;
    const pendingPromise = new Promise<{ ok: boolean }>((resolve) => {
      resolvePromise = resolve;
    });
    mockFetch.mockReturnValueOnce(pendingPromise);

    render(
      <PreferencesSaveModal
        open={true}
        onClose={mockOnClose}
        preferences={mockPreferences}
      />
    );

    fireEvent.click(screen.getByText("Save Defaults"));

    // Should show loading state
    expect(screen.getByText("Saving...")).toBeInTheDocument();

    // Resolve the promise
    resolvePromise!({ ok: true });

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalledWith(true);
    });
  });

  it("disables buttons while saving", async () => {
    let resolvePromise: (value: { ok: boolean }) => void;
    const pendingPromise = new Promise<{ ok: boolean }>((resolve) => {
      resolvePromise = resolve;
    });
    mockFetch.mockReturnValueOnce(pendingPromise);

    render(
      <PreferencesSaveModal
        open={true}
        onClose={mockOnClose}
        preferences={mockPreferences}
      />
    );

    fireEvent.click(screen.getByText("Save Defaults"));

    // Both buttons should be disabled
    expect(screen.getByText("Not now")).toBeDisabled();
    expect(screen.getByText("Saving...")).toBeDisabled();

    resolvePromise!({ ok: true });

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
