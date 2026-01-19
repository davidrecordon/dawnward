import { describe, it, expect } from "vitest";
import {
  type TimeFormat,
  DEFAULT_TIME_FORMAT,
  isValidTimeFormat,
} from "../time-format";

describe("time-format", () => {
  describe("DEFAULT_TIME_FORMAT", () => {
    it("defaults to 12-hour format", () => {
      expect(DEFAULT_TIME_FORMAT).toBe("12h");
    });

    it("is a valid TimeFormat", () => {
      expect(isValidTimeFormat(DEFAULT_TIME_FORMAT)).toBe(true);
    });
  });

  describe("isValidTimeFormat", () => {
    it("returns true for '12h'", () => {
      expect(isValidTimeFormat("12h")).toBe(true);
    });

    it("returns true for '24h'", () => {
      expect(isValidTimeFormat("24h")).toBe(true);
    });

    it("returns false for invalid strings", () => {
      expect(isValidTimeFormat("12")).toBe(false);
      expect(isValidTimeFormat("24")).toBe(false);
      expect(isValidTimeFormat("12hr")).toBe(false);
      expect(isValidTimeFormat("24hr")).toBe(false);
      expect(isValidTimeFormat("")).toBe(false);
      expect(isValidTimeFormat("invalid")).toBe(false);
    });

    it("returns false for non-string values", () => {
      expect(isValidTimeFormat(null)).toBe(false);
      expect(isValidTimeFormat(undefined)).toBe(false);
      expect(isValidTimeFormat(12)).toBe(false);
      expect(isValidTimeFormat(24)).toBe(false);
      expect(isValidTimeFormat({})).toBe(false);
      expect(isValidTimeFormat([])).toBe(false);
      expect(isValidTimeFormat(true)).toBe(false);
    });

    it("is case-sensitive", () => {
      expect(isValidTimeFormat("12H")).toBe(false);
      expect(isValidTimeFormat("24H")).toBe(false);
      expect(isValidTimeFormat("12h")).toBe(true);
      expect(isValidTimeFormat("24h")).toBe(true);
    });
  });

  describe("TimeFormat type", () => {
    it("allows assignment of valid values", () => {
      const format12: TimeFormat = "12h";
      const format24: TimeFormat = "24h";
      expect(format12).toBe("12h");
      expect(format24).toBe("24h");
    });
  });
});
