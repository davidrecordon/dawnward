import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import {
  DisplayPreferencesProvider,
  useDisplayPreferences,
  useUse24HourFormat,
} from "../display-preferences-context";
import * as localeUtils from "@/lib/locale-utils";

// Test component to access context values
function TestConsumer() {
  const prefs = useDisplayPreferences();
  return (
    <div>
      <span data-testid="use24HourFormat">
        {prefs.use24HourFormat.toString()}
      </span>
      <span data-testid="showDualTimezone">
        {prefs.showDualTimezone.toString()}
      </span>
    </div>
  );
}

// Test component for useUse24HourFormat hook
function Use24HourFormatConsumer() {
  const use24HourFormat = useUse24HourFormat();
  return (
    <span data-testid="use24HourFormat">{use24HourFormat.toString()}</span>
  );
}

describe("DisplayPreferencesContext", () => {
  describe("DisplayPreferencesProvider", () => {
    it("provides default values when no props specified", () => {
      render(
        <DisplayPreferencesProvider>
          <TestConsumer />
        </DisplayPreferencesProvider>
      );

      expect(screen.getByTestId("use24HourFormat")).toHaveTextContent("false");
      expect(screen.getByTestId("showDualTimezone")).toHaveTextContent("false");
    });

    it("provides custom use24HourFormat when specified", () => {
      render(
        <DisplayPreferencesProvider use24HourFormat={true}>
          <TestConsumer />
        </DisplayPreferencesProvider>
      );

      expect(screen.getByTestId("use24HourFormat")).toHaveTextContent("true");
    });

    it("provides custom showDualTimezone when specified", () => {
      render(
        <DisplayPreferencesProvider showDualTimezone={true}>
          <TestConsumer />
        </DisplayPreferencesProvider>
      );

      expect(screen.getByTestId("showDualTimezone")).toHaveTextContent("true");
    });

    it("provides all custom values together", () => {
      render(
        <DisplayPreferencesProvider
          use24HourFormat={true}
          showDualTimezone={true}
        >
          <TestConsumer />
        </DisplayPreferencesProvider>
      );

      expect(screen.getByTestId("use24HourFormat")).toHaveTextContent("true");
      expect(screen.getByTestId("showDualTimezone")).toHaveTextContent("true");
    });
  });

  describe("useDisplayPreferences", () => {
    it("returns defaults when not wrapped in provider (graceful degradation)", () => {
      render(<TestConsumer />);

      expect(screen.getByTestId("use24HourFormat")).toHaveTextContent("false");
      expect(screen.getByTestId("showDualTimezone")).toHaveTextContent("false");
    });
  });

  describe("useUse24HourFormat", () => {
    it("returns use24HourFormat from context", () => {
      render(
        <DisplayPreferencesProvider use24HourFormat={true}>
          <Use24HourFormatConsumer />
        </DisplayPreferencesProvider>
      );

      expect(screen.getByTestId("use24HourFormat")).toHaveTextContent("true");
    });

    it("returns default when not in provider", () => {
      render(<Use24HourFormatConsumer />);

      expect(screen.getByTestId("use24HourFormat")).toHaveTextContent("false");
    });

    it("returns false (12-hour format) by default", () => {
      render(
        <DisplayPreferencesProvider>
          <Use24HourFormatConsumer />
        </DisplayPreferencesProvider>
      );

      expect(screen.getByTestId("use24HourFormat")).toHaveTextContent("false");
    });
  });

  describe("detectLocale prop", () => {
    beforeEach(() => {
      vi.spyOn(localeUtils, "detectUser24HourPreference");
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("uses detected 24-hour format when detectLocale is true and locale prefers 24h", async () => {
      vi.mocked(localeUtils.detectUser24HourPreference).mockReturnValue(true);

      render(
        <DisplayPreferencesProvider detectLocale={true}>
          <TestConsumer />
        </DisplayPreferencesProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("use24HourFormat")).toHaveTextContent("true");
      });
    });

    it("uses detected 12-hour format when detectLocale is true and locale prefers 12h", async () => {
      vi.mocked(localeUtils.detectUser24HourPreference).mockReturnValue(false);

      render(
        <DisplayPreferencesProvider detectLocale={true}>
          <TestConsumer />
        </DisplayPreferencesProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId("use24HourFormat")).toHaveTextContent(
          "false"
        );
      });
    });

    it("ignores use24HourFormat prop when detectLocale is true", async () => {
      vi.mocked(localeUtils.detectUser24HourPreference).mockReturnValue(false);

      render(
        <DisplayPreferencesProvider detectLocale={true} use24HourFormat={true}>
          <TestConsumer />
        </DisplayPreferencesProvider>
      );

      // Even though use24HourFormat=true, detectLocale overrides it
      await waitFor(() => {
        expect(screen.getByTestId("use24HourFormat")).toHaveTextContent(
          "false"
        );
      });
    });

    it("does not call detectUser24HourPreference when detectLocale is false", () => {
      vi.mocked(localeUtils.detectUser24HourPreference).mockReturnValue(true);

      render(
        <DisplayPreferencesProvider detectLocale={false}>
          <TestConsumer />
        </DisplayPreferencesProvider>
      );

      expect(localeUtils.detectUser24HourPreference).not.toHaveBeenCalled();
    });

    it("uses use24HourFormat prop when detectLocale is false", () => {
      vi.mocked(localeUtils.detectUser24HourPreference).mockReturnValue(true);

      render(
        <DisplayPreferencesProvider detectLocale={false} use24HourFormat={true}>
          <TestConsumer />
        </DisplayPreferencesProvider>
      );

      // Should use the prop value, not the detected value
      expect(screen.getByTestId("use24HourFormat")).toHaveTextContent("true");
      expect(localeUtils.detectUser24HourPreference).not.toHaveBeenCalled();
    });
  });
});
