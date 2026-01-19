import { describe, it, expect } from "vitest";
import { formatTimeDisplay } from "../time-format";

describe("time-format", () => {
  describe("formatTimeDisplay", () => {
    describe("12-hour format (default)", () => {
      it("formats morning times", () => {
        expect(formatTimeDisplay("06:00")).toBe("6:00 AM");
        expect(formatTimeDisplay("09:30")).toBe("9:30 AM");
        expect(formatTimeDisplay("11:45")).toBe("11:45 AM");
      });

      it("formats noon", () => {
        expect(formatTimeDisplay("12:00")).toBe("12:00 PM");
        expect(formatTimeDisplay("12:30")).toBe("12:30 PM");
      });

      it("formats afternoon times", () => {
        expect(formatTimeDisplay("14:00")).toBe("2:00 PM");
        expect(formatTimeDisplay("17:45")).toBe("5:45 PM");
      });

      it("formats evening times", () => {
        expect(formatTimeDisplay("20:00")).toBe("8:00 PM");
        expect(formatTimeDisplay("23:59")).toBe("11:59 PM");
      });

      it("formats midnight", () => {
        expect(formatTimeDisplay("00:00")).toBe("12:00 AM");
        expect(formatTimeDisplay("00:30")).toBe("12:30 AM");
      });
    });

    describe("24-hour format", () => {
      it("formats morning times with leading zeros", () => {
        expect(formatTimeDisplay("06:00", true)).toBe("06:00");
        expect(formatTimeDisplay("09:30", true)).toBe("09:30");
      });

      it("formats afternoon times", () => {
        expect(formatTimeDisplay("14:00", true)).toBe("14:00");
        expect(formatTimeDisplay("17:45", true)).toBe("17:45");
      });

      it("formats midnight with leading zeros", () => {
        expect(formatTimeDisplay("00:00", true)).toBe("00:00");
        expect(formatTimeDisplay("00:30", true)).toBe("00:30");
      });

      it("formats evening times", () => {
        expect(formatTimeDisplay("23:59", true)).toBe("23:59");
      });
    });

    describe("explicit false for 12-hour format", () => {
      it("works the same as default", () => {
        expect(formatTimeDisplay("14:00", false)).toBe("2:00 PM");
        expect(formatTimeDisplay("09:30", false)).toBe("9:30 AM");
      });
    });
  });
});
