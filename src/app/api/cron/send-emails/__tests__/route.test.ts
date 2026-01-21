/**
 * Tests for the cron email sending endpoint.
 *
 * Tests cover:
 * 1. Feature flag behavior
 * 2. Authorization (CRON_SECRET)
 * 3. Email processing flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "../route";

// Mock environment variables
const originalEnv = process.env;

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    emailSchedule: {
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
    const maskedLocal = local.length > 2 ? `${local[0]}***${local[local.length - 1]}` : "***";
    return `${maskedLocal}@${domain}`;
  }),
}));

// Mock scheduler functions
vi.mock("@/lib/email/scheduler", () => ({
  getPendingEmails: vi.fn(),
  markEmailSent: vi.fn(),
  markEmailFailed: vi.fn(),
}));

// Mock email template
vi.mock("@/lib/email/templates/flight-day", () => ({
  renderFlightDayEmail: vi.fn(),
  renderFlightDayEmailText: vi.fn(),
}));

// Import mocked modules
import { sendEmail } from "@/lib/email/client";
import {
  getPendingEmails,
  markEmailSent,
  markEmailFailed,
} from "@/lib/email/scheduler";
import {
  renderFlightDayEmail,
  renderFlightDayEmailText,
} from "@/lib/email/templates/flight-day";
import type { Mock } from "vitest";

const mockedSendEmail = sendEmail as Mock;
const mockedGetPendingEmails = getPendingEmails as Mock;
const mockedMarkEmailSent = markEmailSent as Mock;
const mockedMarkEmailFailed = markEmailFailed as Mock;
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

describe("GET /api/cron/send-emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
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
      const data = await response.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("allows access with valid authorization", async () => {
      process.env.ENABLE_FLIGHT_DAY_EMAILS = "true";
      process.env.CRON_SECRET = "test-secret";
      mockedGetPendingEmails.mockResolvedValue([]);

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

    it("returns success with zero sent when no pending emails", async () => {
      mockedGetPendingEmails.mockResolvedValue([]);

      const response = await GET(createRequest("Bearer test-secret"));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.processed).toBe(0);
      expect(data.sent).toBe(0);
      expect(data.failed).toBe(0);
    });

    it("sends email and marks as sent on success", async () => {
      const mockEmailSchedule = {
        id: "email-1",
        tripId: "trip-1",
        userId: "user-1",
        user: {
          email: "user@example.com",
          name: "Test User",
          use24HourFormat: false,
        },
        trip: {
          id: "trip-1",
          routeLabel: "LAX → LHR",
          departureDatetime: "2026-01-20T09:00:00",
          arrivalDatetime: "2026-01-20T17:00:00",
          originTz: "America/Los_Angeles",
          currentScheduleJson: {
            interventions: [
              {
                day: 0,
                date: "2026-01-20",
                items: [
                  { type: "wake_target", title: "Wake", description: "Time to wake" },
                ],
              },
            ],
          },
        },
      };

      mockedGetPendingEmails.mockResolvedValue([mockEmailSchedule]);
      mockedRenderFlightDayEmail.mockResolvedValue("<html>Email</html>");
      mockedRenderFlightDayEmailText.mockReturnValue("Plain text email");
      mockedSendEmail.mockResolvedValue({ success: true, id: "resend-123" });

      const response = await GET(createRequest("Bearer test-secret"));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.sent).toBe(1);
      expect(data.failed).toBe(0);
      expect(mockedMarkEmailSent).toHaveBeenCalledWith("email-1");
    });

    it("marks email as failed when send fails", async () => {
      const mockEmailSchedule = {
        id: "email-2",
        tripId: "trip-2",
        userId: "user-2",
        user: {
          email: "user2@example.com",
          name: "Test User 2",
          use24HourFormat: false,
        },
        trip: {
          id: "trip-2",
          routeLabel: "SFO → NRT",
          departureDatetime: "2026-01-20T10:00:00",
          arrivalDatetime: "2026-01-21T14:00:00",
          originTz: "America/Los_Angeles",
          currentScheduleJson: {
            interventions: [
              {
                day: 0,
                date: "2026-01-20",
                items: [
                  { type: "wake_target", title: "Wake", description: "Time to wake" },
                ],
              },
            ],
          },
        },
      };

      mockedGetPendingEmails.mockResolvedValue([mockEmailSchedule]);
      mockedRenderFlightDayEmail.mockResolvedValue("<html>Email</html>");
      mockedRenderFlightDayEmailText.mockReturnValue("Plain text email");
      mockedSendEmail.mockResolvedValue({ success: false, error: "API error" });

      const response = await GET(createRequest("Bearer test-secret"));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.sent).toBe(0);
      expect(data.failed).toBe(1);
      expect(mockedMarkEmailFailed).toHaveBeenCalledWith("email-2", "API error");
    });

    it("skips email when user email is missing", async () => {
      const mockEmailSchedule = {
        id: "email-3",
        tripId: "trip-3",
        userId: "user-3",
        user: {
          email: null, // Missing email
          name: "Test User 3",
        },
        trip: {
          id: "trip-3",
          currentScheduleJson: {},
        },
      };

      mockedGetPendingEmails.mockResolvedValue([mockEmailSchedule]);

      const response = await GET(createRequest("Bearer test-secret"));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.failed).toBe(1);
      expect(mockedMarkEmailFailed).toHaveBeenCalledWith(
        "email-3",
        "Missing user email or schedule data"
      );
      expect(mockedSendEmail).not.toHaveBeenCalled();
    });

    it("skips email when schedule is missing", async () => {
      const mockEmailSchedule = {
        id: "email-4",
        tripId: "trip-4",
        userId: "user-4",
        user: {
          email: "user4@example.com",
          name: "Test User 4",
        },
        trip: {
          id: "trip-4",
          currentScheduleJson: null, // Missing schedule
        },
      };

      mockedGetPendingEmails.mockResolvedValue([mockEmailSchedule]);

      const response = await GET(createRequest("Bearer test-secret"));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.failed).toBe(1);
      expect(mockedMarkEmailFailed).toHaveBeenCalledWith(
        "email-4",
        "Missing user email or schedule data"
      );
    });
  });
});
