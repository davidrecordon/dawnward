/**
 * Tests for short code generation utility.
 */

import { describe, it, expect } from "vitest";
import { generateShortCode } from "../short-code";

describe("generateShortCode", () => {
  it("generates 6-character code by default", () => {
    const code = generateShortCode();
    expect(code).toHaveLength(6);
  });

  it("generates code of specified length", () => {
    expect(generateShortCode(4)).toHaveLength(4);
    expect(generateShortCode(8)).toHaveLength(8);
    expect(generateShortCode(10)).toHaveLength(10);
  });

  it("uses only base62 characters", () => {
    const code = generateShortCode(100);
    expect(code).toMatch(/^[0-9A-Za-z]+$/);
  });

  it("generates unique codes", () => {
    const codes = new Set(
      Array.from({ length: 100 }, () => generateShortCode())
    );
    expect(codes.size).toBe(100);
  });

  it("generates different codes on each call", () => {
    const code1 = generateShortCode();
    const code2 = generateShortCode();
    expect(code1).not.toBe(code2);
  });
});
