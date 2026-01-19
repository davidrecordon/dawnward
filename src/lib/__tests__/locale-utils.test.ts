/**
 * Tests for locale detection utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { detectUser24HourPreference } from "../locale-utils";

describe("detectUser24HourPreference", () => {
  const originalIntl = globalThis.Intl;

  beforeEach(() => {
    // Ensure window is defined for tests
    vi.stubGlobal("window", {});
  });

  afterEach(() => {
    globalThis.Intl = originalIntl;
    vi.unstubAllGlobals();
  });

  it("returns false when window is undefined (SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(detectUser24HourPreference()).toBe(false);
  });

  it("returns true when hour12 is false (24-hour locale)", () => {
    const mockFormatter = {
      resolvedOptions: () => ({ hour12: false }),
      format: () => "13",
    };
    class MockDateTimeFormat {
      resolvedOptions() {
        return mockFormatter.resolvedOptions();
      }
      format() {
        return mockFormatter.format();
      }
    }
    vi.stubGlobal("Intl", {
      DateTimeFormat: MockDateTimeFormat,
    });

    expect(detectUser24HourPreference()).toBe(true);
  });

  it("returns false when hour12 is true (12-hour locale)", () => {
    class MockDateTimeFormat {
      resolvedOptions() {
        return { hour12: true };
      }
      format() {
        return "1 PM";
      }
    }
    vi.stubGlobal("Intl", {
      DateTimeFormat: MockDateTimeFormat,
    });

    expect(detectUser24HourPreference()).toBe(false);
  });

  it("falls back to AM/PM detection when hour12 is undefined", () => {
    class MockDateTimeFormat {
      resolvedOptions() {
        return {}; // hour12 undefined
      }
      format() {
        return "1 PM";
      }
    }
    vi.stubGlobal("Intl", {
      DateTimeFormat: MockDateTimeFormat,
    });

    expect(detectUser24HourPreference()).toBe(false);
  });

  it("returns true via fallback when no AM/PM in formatted output", () => {
    class MockDateTimeFormat {
      resolvedOptions() {
        return {}; // hour12 undefined
      }
      format() {
        return "13"; // 24-hour format, no AM/PM
      }
    }
    vi.stubGlobal("Intl", {
      DateTimeFormat: MockDateTimeFormat,
    });

    expect(detectUser24HourPreference()).toBe(true);
  });

  it("returns false when Intl.DateTimeFormat throws", () => {
    class MockDateTimeFormat {
      constructor() {
        throw new Error("Not supported");
      }
    }
    vi.stubGlobal("Intl", {
      DateTimeFormat: MockDateTimeFormat,
    });

    expect(detectUser24HourPreference()).toBe(false);
  });

  it("handles lowercase am/pm in fallback detection", () => {
    class MockDateTimeFormat {
      resolvedOptions() {
        return {};
      }
      format() {
        return "1 pm";
      }
    }
    vi.stubGlobal("Intl", {
      DateTimeFormat: MockDateTimeFormat,
    });

    expect(detectUser24HourPreference()).toBe(false);
  });
});
