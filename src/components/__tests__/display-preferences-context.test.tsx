import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  DisplayPreferencesProvider,
  useDisplayPreferences,
  useTimeFormat,
} from "../display-preferences-context";

// Test component to access context values
function TestConsumer() {
  const prefs = useDisplayPreferences();
  return (
    <div>
      <span data-testid="timeFormat">{prefs.timeFormat}</span>
      <span data-testid="showDualTimezone">
        {prefs.showDualTimezone.toString()}
      </span>
      <span data-testid="scheduleViewMode">{prefs.scheduleViewMode}</span>
    </div>
  );
}

// Test component for useTimeFormat hook
function TimeFormatConsumer() {
  const timeFormat = useTimeFormat();
  return <span data-testid="timeFormat">{timeFormat}</span>;
}

describe("DisplayPreferencesContext", () => {
  describe("DisplayPreferencesProvider", () => {
    it("provides default values when no props specified", () => {
      render(
        <DisplayPreferencesProvider>
          <TestConsumer />
        </DisplayPreferencesProvider>
      );

      expect(screen.getByTestId("timeFormat")).toHaveTextContent("12h");
      expect(screen.getByTestId("showDualTimezone")).toHaveTextContent("false");
      expect(screen.getByTestId("scheduleViewMode")).toHaveTextContent(
        "summary"
      );
    });

    it("provides custom timeFormat when specified", () => {
      render(
        <DisplayPreferencesProvider timeFormat="24h">
          <TestConsumer />
        </DisplayPreferencesProvider>
      );

      expect(screen.getByTestId("timeFormat")).toHaveTextContent("24h");
    });

    it("provides custom showDualTimezone when specified", () => {
      render(
        <DisplayPreferencesProvider showDualTimezone={true}>
          <TestConsumer />
        </DisplayPreferencesProvider>
      );

      expect(screen.getByTestId("showDualTimezone")).toHaveTextContent("true");
    });

    it("provides custom scheduleViewMode when specified", () => {
      render(
        <DisplayPreferencesProvider scheduleViewMode="timeline">
          <TestConsumer />
        </DisplayPreferencesProvider>
      );

      expect(screen.getByTestId("scheduleViewMode")).toHaveTextContent(
        "timeline"
      );
    });

    it("provides all custom values together", () => {
      render(
        <DisplayPreferencesProvider
          timeFormat="24h"
          showDualTimezone={true}
          scheduleViewMode="timeline"
        >
          <TestConsumer />
        </DisplayPreferencesProvider>
      );

      expect(screen.getByTestId("timeFormat")).toHaveTextContent("24h");
      expect(screen.getByTestId("showDualTimezone")).toHaveTextContent("true");
      expect(screen.getByTestId("scheduleViewMode")).toHaveTextContent(
        "timeline"
      );
    });
  });

  describe("useDisplayPreferences", () => {
    it("returns defaults when not wrapped in provider (graceful degradation)", () => {
      render(<TestConsumer />);

      expect(screen.getByTestId("timeFormat")).toHaveTextContent("12h");
      expect(screen.getByTestId("showDualTimezone")).toHaveTextContent("false");
      expect(screen.getByTestId("scheduleViewMode")).toHaveTextContent(
        "summary"
      );
    });
  });

  describe("useTimeFormat", () => {
    it("returns time format from context", () => {
      render(
        <DisplayPreferencesProvider timeFormat="24h">
          <TimeFormatConsumer />
        </DisplayPreferencesProvider>
      );

      expect(screen.getByTestId("timeFormat")).toHaveTextContent("24h");
    });

    it("returns default when not in provider", () => {
      render(<TimeFormatConsumer />);

      expect(screen.getByTestId("timeFormat")).toHaveTextContent("12h");
    });

    it("returns 12h format by default", () => {
      render(
        <DisplayPreferencesProvider>
          <TimeFormatConsumer />
        </DisplayPreferencesProvider>
      );

      expect(screen.getByTestId("timeFormat")).toHaveTextContent("12h");
    });
  });
});
