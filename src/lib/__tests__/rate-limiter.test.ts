import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  checkRateLimit,
  getRateLimitStatus,
  clearRateLimits,
} from "../rate-limiter";

describe("rate-limiter", () => {
  beforeEach(() => {
    // Clear rate limit state before each test
    clearRateLimits();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("checkRateLimit", () => {
    it("allows requests under the limit", () => {
      const ip = "192.168.1.1";

      // First request should be allowed
      expect(checkRateLimit(ip, 100)).toBe(true);

      // 99 more requests should be allowed
      for (let i = 0; i < 99; i++) {
        expect(checkRateLimit(ip, 100)).toBe(true);
      }
    });

    it("blocks requests at the limit", () => {
      const ip = "192.168.1.2";

      // Make 100 requests
      for (let i = 0; i < 100; i++) {
        expect(checkRateLimit(ip, 100)).toBe(true);
      }

      // 101st request should be blocked
      expect(checkRateLimit(ip, 100)).toBe(false);
    });

    it("tracks different IPs separately", () => {
      const ip1 = "192.168.1.3";
      const ip2 = "192.168.1.4";

      // Exhaust ip1's limit
      for (let i = 0; i < 100; i++) {
        checkRateLimit(ip1, 100);
      }

      // ip2 should still be allowed
      expect(checkRateLimit(ip2, 100)).toBe(true);

      // ip1 should be blocked
      expect(checkRateLimit(ip1, 100)).toBe(false);
    });

    it("uses custom limit when provided", () => {
      const ip = "192.168.1.5";

      // With limit of 5
      for (let i = 0; i < 5; i++) {
        expect(checkRateLimit(ip, 5)).toBe(true);
      }

      expect(checkRateLimit(ip, 5)).toBe(false);
    });

    it("allows requests after window expires", () => {
      vi.useFakeTimers();
      const ip = "192.168.1.6";

      // Exhaust limit
      for (let i = 0; i < 100; i++) {
        checkRateLimit(ip, 100);
      }

      // Should be blocked
      expect(checkRateLimit(ip, 100)).toBe(false);

      // Advance time by 1 hour
      vi.advanceTimersByTime(3600000);

      // Should be allowed again
      expect(checkRateLimit(ip, 100)).toBe(true);
    });

    it("uses sliding window (allows gradual recovery)", () => {
      vi.useFakeTimers();
      const ip = "192.168.1.7";

      // Make 50 requests
      for (let i = 0; i < 50; i++) {
        checkRateLimit(ip, 100);
      }

      // Advance 30 minutes
      vi.advanceTimersByTime(1800000);

      // Make 50 more requests
      for (let i = 0; i < 50; i++) {
        checkRateLimit(ip, 100);
      }

      // Should still be at limit (100 total in last hour)
      expect(checkRateLimit(ip, 100)).toBe(false);

      // Advance another 30 minutes (first 50 expire)
      vi.advanceTimersByTime(1800000);

      // Should have 50 slots available again
      expect(checkRateLimit(ip, 100)).toBe(true);
    });
  });

  describe("getRateLimitStatus", () => {
    it("returns correct status for new IP", () => {
      const ip = "192.168.1.10";

      const status = getRateLimitStatus(ip, 100);

      expect(status.used).toBe(0);
      expect(status.limit).toBe(100);
      expect(status.resetAt).toBeInstanceOf(Date);
    });

    it("returns correct used count after requests", () => {
      const ip = "192.168.1.11";

      // Make 25 requests
      for (let i = 0; i < 25; i++) {
        checkRateLimit(ip, 100);
      }

      const status = getRateLimitStatus(ip, 100);

      expect(status.used).toBe(25);
      expect(status.limit).toBe(100);
    });

    it("returns reset time based on oldest request", () => {
      vi.useFakeTimers();
      const ip = "192.168.1.12";
      const startTime = Date.now();

      // Make a request
      checkRateLimit(ip, 100);

      const status = getRateLimitStatus(ip, 100);

      // Reset time should be 1 hour after the first request
      expect(status.resetAt.getTime()).toBe(startTime + 3600000);
    });
  });

  describe("clearRateLimits", () => {
    it("clears all rate limit data", () => {
      const ip = "192.168.1.20";

      // Make requests
      for (let i = 0; i < 100; i++) {
        checkRateLimit(ip, 100);
      }

      // Should be blocked
      expect(checkRateLimit(ip, 100)).toBe(false);

      // Clear all data
      clearRateLimits();

      // Should be allowed again
      expect(checkRateLimit(ip, 100)).toBe(true);
    });
  });
});
