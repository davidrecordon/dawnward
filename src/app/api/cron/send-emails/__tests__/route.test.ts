/**
 * Tests for the cron email sending endpoint.
 *
 * Tests cover:
 * 1. Feature flag behavior
 * 2. Authorization (CRON_SECRET)
 * 3. Send time calculation (smart timing logic)
 * 4. Email processing flow (stateless cron)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, calculateEmailSendTime } from "../route";

const originalEnv = process.env;

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    sharedSchedule: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock email client
vi.mock("@/lib/email/client", () => ({
  sendEmail: vi.fn(),
  maskEmail: vi.fn((email: string) => {
    const [local, domain] = email.split("@");
    if (!domain) return "***";
    const maskedLocal =
      local.length > 2 ? `${local[0]}***${local[local.length - 1]}` : "***";
    return `${maskedLocal}@${domain}`;
  }),
}));

// Mock email template
vi.mock("@/lib/email/templates/flight-day", () => ({
  renderFlightDayEmail: vi.fn(),
  renderFlightDayEmailText: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email/client";
import {
  renderFlightDayEmail,
  renderFlightDayEmailText,
} from "@/lib/email/templates/flight-day";
import type { Mock } from "vitest";

const mockedFindMany = prisma.sharedSchedule.findMany as Mock;
const mockedUpdate = prisma.sharedSchedule.update as Mock;
const mockedSendEmail = sendEmail as Mock;
const mockedRenderFlightDayEmail = renderFlightDayEmail as Mock;
const mockedRenderFlightDayEmailText = renderFlightDayEmailText as Mock;

function createRequest(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader) {
    headers["authorization"] = authHeader;
  }
  return new Request("http://localhost/api/cron/send-emails", {
    method: "GET",
    headers,
  });
}

function createMockTrip(overrides: Record<string, unknown> = {}) {
  // Default: departure 2 hours from now (within lookahead window)
  const departure = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const arrival = new Date(departure.getTime() + 10 * 60 * 60 * 1000);

  return {
    id: "trip-1",
    userId: "user-1",
    originTz: "America/Los_Angeles",
    destTz: "Europe/London",
    departureDatetime: departure.toISOString().slice(0, 16),
    arrivalDatetime: arrival.toISOString().slice(0, 16),
    routeLabel: "LAX → LHR",
    flightDayEmailSentAt: null,
    currentScheduleJson: {
      interventions: [
        {
          day: 0,
          date: departure.toISOString().slice(0, 10),
          items: [
            {
              type: "wake_target",
              title: "Wake",
              description: "Time to wake",
              origin_time: "07:00",
              dest_time: "15:00",
              origin_date: departure.toISOString().slice(0, 10),
              dest_date: departure.toISOString().slice(0, 10),
              origin_tz: "America/Los_Angeles",
              dest_tz: "Europe/London",
              phase_type: "pre_departure",
              show_dual_timezone: false,
            },
          ],
        },
      ],
    },
    user: {
      email: "user@example.com",
      name: "Test User",
      use24HourFormat: false,
      emailNotifications: true,
    },
    ...overrides,
  };
}

describe("calculateEmailSendTime", () => {
  it("defaults to 5 AM local on departure day", () => {
    const result = calculateEmailSendTime(
      "2026-01-20T10:00",
      "America/Los_Angeles"
    );

    expect(result.isNightBefore).toBe(false);
    // 5 AM PST = 13:00 UTC
    expect(result.sendAt.getUTCHours()).toBe(13);
  });

  it("falls back to 7 PM night before for early departures", () => {
    // First intervention at 5:30 AM — only 30 min after default 5 AM send
    const result = calculateEmailSendTime(
      "2026-01-20T06:00",
      "America/Los_Angeles",
      "05:30"
    );

    expect(result.isNightBefore).toBe(true);
    // 7 PM PST on Jan 19 = 03:00 UTC on Jan 20
    expect(result.sendAt.getUTCHours()).toBe(3);
    expect(result.sendAt.getUTCDate()).toBe(20);
  });

  it("keeps morning send for late departures", () => {
    // First intervention at 9 AM — 4h after default 5 AM, above 3h threshold
    const result = calculateEmailSendTime(
      "2026-01-20T12:00",
      "America/Los_Angeles",
      "09:00"
    );

    expect(result.isNightBefore).toBe(false);
  });

  it("sends morning of when no first intervention time provided", () => {
    const result = calculateEmailSendTime(
      "2026-01-20T06:00",
      "America/Los_Angeles"
    );

    expect(result.isNightBefore).toBe(false);
  });
});

describe("GET /api/cron/send-emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("feature flag", () => {
    it("returns skipped when feature flag is disabled", async () => {
      process.env.ENABLE_FLIGHT_DAY_EMAILS = "false";
      process.env.CRON_SECRET = "test-secret";

      const response = await GET(createRequest("Bearer test-secret"));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.skipped).toBe(true);
      expect(data.reason).toBe("disabled");
    });

    it("returns skipped when feature flag is not set", async () => {
      delete process.env.ENABLE_FLIGHT_DAY_EMAILS;
      process.env.CRON_SECRET = "test-secret";

      const response = await GET(createRequest("Bearer test-secret"));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.skipped).toBe(true);
    });
  });

  describe("authorization", () => {
    it("returns 500 when CRON_SECRET is not configured", async () => {
      process.env.ENABLE_FLIGHT_DAY_EMAILS = "true";
      delete process.env.CRON_SECRET;

      const response = await GET(createRequest());

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("Server misconfiguration");
    });

    it("returns 401 when authorization header is missing", async () => {
      process.env.ENABLE_FLIGHT_DAY_EMAILS = "true";
      process.env.CRON_SECRET = "test-secret";

      const response = await GET(createRequest());

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 401 when authorization header is invalid", async () => {
      process.env.ENABLE_FLIGHT_DAY_EMAILS = "true";
      process.env.CRON_SECRET = "test-secret";

      const response = await GET(createRequest("Bearer wrong-secret"));

      expect(response.status).toBe(401);
    });

    it("allows access with valid authorization", async () => {
      process.env.ENABLE_FLIGHT_DAY_EMAILS = "true";
      process.env.CRON_SECRET = "test-secret";
      mockedFindMany.mockResolvedValue([]);

      const response = await GET(createRequest("Bearer test-secret"));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe("email processing", () => {
    beforeEach(() => {
      process.env.ENABLE_FLIGHT_DAY_EMAILS = "true";
      process.env.CRON_SECRET = "test-secret";
    });

    it("returns success with zero sent when no trips found", async () => {
      mockedFindMany.mockResolvedValue([]);

      const response = await GET(createRequest("Bearer test-secret"));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.processed).toBe(0);
      expect(data.sent).toBe(0);
    });

    it("sends email and sets flightDayEmailSentAt on success", async () => {
      const mockTrip = createMockTrip();
      mockedFindMany.mockResolvedValue([mockTrip]);
      mockedRenderFlightDayEmail.mockResolvedValue("<html>Email</html>");
      mockedRenderFlightDayEmailText.mockReturnValue("Plain text email");
      mockedSendEmail.mockResolvedValue({ success: true, id: "resend-123" });

      const response = await GET(createRequest("Bearer test-secret"));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.sent).toBe(1);
      expect(data.failed).toBe(0);
      expect(mockedUpdate).toHaveBeenCalledWith({
        where: { id: "trip-1" },
        data: { flightDayEmailSentAt: expect.any(Date) },
      });
    });

    it("increments failed count when send fails", async () => {
      const mockTrip = createMockTrip();
      mockedFindMany.mockResolvedValue([mockTrip]);
      mockedRenderFlightDayEmail.mockResolvedValue("<html>Email</html>");
      mockedRenderFlightDayEmailText.mockReturnValue("Plain text");
      mockedSendEmail.mockResolvedValue({
        success: false,
        error: "API error",
      });

      const response = await GET(createRequest("Bearer test-secret"));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.sent).toBe(0);
      expect(data.failed).toBe(1);
      expect(mockedUpdate).not.toHaveBeenCalled();
    });

    it("skips trip when user email is missing", async () => {
      const mockTrip = createMockTrip({
        user: { email: null, name: "No Email", use24HourFormat: false },
      });
      mockedFindMany.mockResolvedValue([mockTrip]);

      const response = await GET(createRequest("Bearer test-secret"));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.skipped).toBe(1);
      expect(mockedSendEmail).not.toHaveBeenCalled();
    });

    it("skips trip when no flight day in schedule", async () => {
      const mockTrip = createMockTrip({
        currentScheduleJson: {
          interventions: [
            { day: -1, date: "2026-01-19", items: [] }, // prep day only
          ],
        },
      });
      mockedFindMany.mockResolvedValue([mockTrip]);

      const response = await GET(createRequest("Bearer test-secret"));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.skipped).toBe(1);
      expect(mockedSendEmail).not.toHaveBeenCalled();
    });

    it("filters out trips departing outside lookahead window", async () => {
      // Departure 48 hours from now — outside 36h window
      const farDeparture = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const mockTrip = createMockTrip({
        departureDatetime: farDeparture.toISOString().slice(0, 16),
      });
      mockedFindMany.mockResolvedValue([mockTrip]);

      const response = await GET(createRequest("Bearer test-secret"));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.processed).toBe(0);
      expect(mockedSendEmail).not.toHaveBeenCalled();
    });

    it("handles render exception gracefully", async () => {
      const mockTrip = createMockTrip();
      mockedFindMany.mockResolvedValue([mockTrip]);
      mockedRenderFlightDayEmail.mockRejectedValue(
        new Error("Template render failed")
      );

      const response = await GET(createRequest("Bearer test-secret"));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.failed).toBe(1);
      expect(data.sent).toBe(0);
    });
  });
});
