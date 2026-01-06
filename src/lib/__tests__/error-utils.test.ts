import { describe, it, expect } from "vitest";
import { getErrorMessage } from "../error-utils";

describe("getErrorMessage", () => {
  it("extracts message from Error instance", () => {
    const error = new Error("Something went wrong");
    expect(getErrorMessage(error)).toBe("Something went wrong");
  });

  it("extracts message from Error subclass", () => {
    const error = new TypeError("Type mismatch");
    expect(getErrorMessage(error)).toBe("Type mismatch");
  });

  it("returns string errors as-is", () => {
    expect(getErrorMessage("Direct error message")).toBe("Direct error message");
  });

  it("returns default message for null", () => {
    expect(getErrorMessage(null)).toBe("An unexpected error occurred");
  });

  it("returns default message for undefined", () => {
    expect(getErrorMessage(undefined)).toBe("An unexpected error occurred");
  });

  it("returns default message for number", () => {
    expect(getErrorMessage(404)).toBe("An unexpected error occurred");
  });

  it("returns default message for object without message", () => {
    expect(getErrorMessage({ code: "ERR_001" })).toBe("An unexpected error occurred");
  });

  it("returns default message for array", () => {
    expect(getErrorMessage(["error1", "error2"])).toBe("An unexpected error occurred");
  });

  it("handles empty string", () => {
    expect(getErrorMessage("")).toBe("");
  });

  it("handles Error with empty message", () => {
    const error = new Error("");
    expect(getErrorMessage(error)).toBe("");
  });
});
