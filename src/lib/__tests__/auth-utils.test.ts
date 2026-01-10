/**
 * Tests for auth utilities.
 *
 * Tests cover open redirect prevention in getSafeCallbackUrl().
 */

import { describe, it, expect } from "vitest";
import { getSafeCallbackUrl } from "../auth-utils";

describe("getSafeCallbackUrl", () => {
  describe("valid relative paths", () => {
    it("returns / for undefined callback", () => {
      expect(getSafeCallbackUrl(undefined)).toBe("/");
    });

    it("returns / for empty string", () => {
      expect(getSafeCallbackUrl("")).toBe("/");
    });

    it("allows root path", () => {
      expect(getSafeCallbackUrl("/")).toBe("/");
    });

    it("allows relative paths starting with /", () => {
      expect(getSafeCallbackUrl("/settings")).toBe("/settings");
      expect(getSafeCallbackUrl("/trip")).toBe("/trip");
      expect(getSafeCallbackUrl("/history")).toBe("/history");
    });

    it("allows nested relative paths", () => {
      expect(getSafeCallbackUrl("/api/user/preferences")).toBe(
        "/api/user/preferences"
      );
      expect(getSafeCallbackUrl("/auth/signin")).toBe("/auth/signin");
    });

    it("allows paths with query strings", () => {
      expect(getSafeCallbackUrl("/trip?origin=SFO")).toBe("/trip?origin=SFO");
      expect(getSafeCallbackUrl("/settings?tab=profile")).toBe(
        "/settings?tab=profile"
      );
    });

    it("allows paths with hash fragments", () => {
      expect(getSafeCallbackUrl("/settings#preferences")).toBe(
        "/settings#preferences"
      );
    });
  });

  describe("open redirect prevention", () => {
    it("blocks protocol-relative URLs (//)", () => {
      expect(getSafeCallbackUrl("//evil.com")).toBe("/");
      expect(getSafeCallbackUrl("//evil.com/path")).toBe("/");
    });

    it("blocks absolute HTTP URLs", () => {
      expect(getSafeCallbackUrl("http://evil.com")).toBe("/");
      expect(getSafeCallbackUrl("http://evil.com/path")).toBe("/");
    });

    it("blocks absolute HTTPS URLs", () => {
      expect(getSafeCallbackUrl("https://evil.com")).toBe("/");
      expect(getSafeCallbackUrl("https://evil.com/path")).toBe("/");
    });

    it("blocks javascript: URLs", () => {
      expect(getSafeCallbackUrl("javascript:alert(1)")).toBe("/");
    });

    it("blocks data: URLs", () => {
      expect(getSafeCallbackUrl("data:text/html,<script>")).toBe("/");
    });

    it("blocks paths not starting with /", () => {
      expect(getSafeCallbackUrl("evil.com")).toBe("/");
      expect(getSafeCallbackUrl("settings")).toBe("/");
    });

    it("blocks URLs with encoded characters trying to bypass", () => {
      // %2F is URL-encoded /
      expect(getSafeCallbackUrl("%2F%2Fevil.com")).toBe("/");
    });

    it("blocks file: URLs", () => {
      expect(getSafeCallbackUrl("file:///etc/passwd")).toBe("/");
    });

    it("blocks ftp: URLs", () => {
      expect(getSafeCallbackUrl("ftp://evil.com")).toBe("/");
    });
  });
});
