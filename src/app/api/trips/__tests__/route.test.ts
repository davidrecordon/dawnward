/**
 * Tests for the trips API route.
 *
 * Tests cover:
 * 1. Trip creation for authenticated and anonymous users
 * 2. Duplicate detection for authenticated users
 * 3. Input validation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../route";

// Mock the auth module
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    sharedSchedule: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Import mocked modules
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Mock } from "vitest";

// Cast to mock types
const mockedAuth = auth as unknown as Mock;
const mockedPrisma = prisma as unknown as {
  sharedSchedule: {
    findFirst: Mock;
    create: Mock;
  };
};

// Sample trip data for tests
const validTripData = {
  origin_tz: "America/Los_Angeles",
  dest_tz: "Europe/London",
  departure_datetime: "2026-01-11T20:45",
  arrival_datetime: "2026-01-12T15:15",
  prep_days: 3,
  wake_time: "07:00",
  sleep_time: "23:00",
  uses_melatonin: true,
  uses_caffeine: true,
  uses_exercise: false,
  nap_preference: "flight_only",
  schedule_intensity: "balanced",
  route_label: "SFO → LHR",
};

function createRequest(body: unknown): Request {
  return new Request("http://localhost/api/trips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/trips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("trip creation", () => {
    it("creates trip for authenticated user", async () => {
      mockedAuth.mockResolvedValue({
        user: { id: "user-123" },
      });
      mockedPrisma.sharedSchedule.findFirst.mockResolvedValue(null);
      mockedPrisma.sharedSchedule.create.mockResolvedValue({
        id: "trip-new-123",
      });

      const response = await POST(createRequest(validTripData));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe("trip-new-123");
      expect(data.saved).toBe(true);
    });

    it("creates trip for anonymous user", async () => {
      mockedAuth.mockResolvedValue(null);
      mockedPrisma.sharedSchedule.create.mockResolvedValue({
        id: "trip-anon-456",
      });

      const response = await POST(createRequest(validTripData));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe("trip-anon-456");
      expect(data.saved).toBe(true);
    });

    it("creates trip with userId null for anonymous users", async () => {
      mockedAuth.mockResolvedValue(null);
      mockedPrisma.sharedSchedule.create.mockResolvedValue({ id: "trip-123" });

      await POST(createRequest(validTripData));

      expect(mockedPrisma.sharedSchedule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: null,
          code: null,
        }),
      });
    });
  });

  describe("duplicate detection", () => {
    beforeEach(() => {
      mockedAuth.mockResolvedValue({
        user: { id: "user-123" },
      });
    });

    it("returns existing trip when duplicate found for authenticated user", async () => {
      mockedPrisma.sharedSchedule.findFirst.mockResolvedValue({
        id: "existing-trip-789",
      });

      const response = await POST(createRequest(validTripData));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe("existing-trip-789");
      expect(data.saved).toBe(true);
      // Should NOT call create when duplicate found
      expect(mockedPrisma.sharedSchedule.create).not.toHaveBeenCalled();
    });

    it("checks all 12 input fields for duplicate detection", async () => {
      mockedPrisma.sharedSchedule.findFirst.mockResolvedValue(null);
      mockedPrisma.sharedSchedule.create.mockResolvedValue({ id: "trip-123" });

      await POST(createRequest(validTripData));

      expect(mockedPrisma.sharedSchedule.findFirst).toHaveBeenCalledWith({
        where: {
          userId: "user-123",
          originTz: "America/Los_Angeles",
          destTz: "Europe/London",
          departureDatetime: "2026-01-11T20:45",
          arrivalDatetime: "2026-01-12T15:15",
          prepDays: 3,
          wakeTime: "07:00",
          sleepTime: "23:00",
          usesMelatonin: true,
          usesCaffeine: true,
          usesExercise: false,
          napPreference: "flight_only",
          scheduleIntensity: "balanced",
        },
        select: { id: true },
      });
    });

    it("creates new trip when no duplicate found", async () => {
      mockedPrisma.sharedSchedule.findFirst.mockResolvedValue(null);
      mockedPrisma.sharedSchedule.create.mockResolvedValue({
        id: "new-trip-123",
      });

      const response = await POST(createRequest(validTripData));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe("new-trip-123");
      expect(mockedPrisma.sharedSchedule.create).toHaveBeenCalled();
    });

    it("skips duplicate check for anonymous users", async () => {
      mockedAuth.mockResolvedValue(null);
      mockedPrisma.sharedSchedule.create.mockResolvedValue({ id: "trip-123" });

      await POST(createRequest(validTripData));

      // findFirst should NOT be called for anonymous users
      expect(mockedPrisma.sharedSchedule.findFirst).not.toHaveBeenCalled();
    });

    it("creates new trip when any parameter differs", async () => {
      // First call finds no duplicate (different departure time)
      mockedPrisma.sharedSchedule.findFirst.mockResolvedValue(null);
      mockedPrisma.sharedSchedule.create.mockResolvedValue({
        id: "different-trip",
      });

      const differentTrip = {
        ...validTripData,
        departure_datetime: "2026-01-12T08:00", // Different date
      };

      const response = await POST(createRequest(differentTrip));

      expect(response.status).toBe(200);
      expect(mockedPrisma.sharedSchedule.create).toHaveBeenCalled();
    });
  });

  describe("validation", () => {
    beforeEach(() => {
      mockedAuth.mockResolvedValue({ user: { id: "user-123" } });
    });

    it("returns 400 for invalid timezone", async () => {
      const invalidTrip = {
        ...validTripData,
        origin_tz: "Invalid/Timezone",
      };

      const response = await POST(createRequest(invalidTrip));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("origin_tz");
    });

    it("returns 400 for invalid datetime format", async () => {
      const invalidTrip = {
        ...validTripData,
        departure_datetime: "2026-01-11", // Missing time
      };

      const response = await POST(createRequest(invalidTrip));

      expect(response.status).toBe(400);
    });

    it("returns 400 for invalid time format", async () => {
      const invalidTrip = {
        ...validTripData,
        wake_time: "7:00", // Should be 07:00
      };

      const response = await POST(createRequest(invalidTrip));

      expect(response.status).toBe(400);
    });

    it("returns 400 for invalid prep_days", async () => {
      const invalidTrip = {
        ...validTripData,
        prep_days: 10, // Max is 7
      };

      const response = await POST(createRequest(invalidTrip));

      expect(response.status).toBe(400);
    });

    it("returns 400 for invalid nap_preference", async () => {
      const invalidTrip = {
        ...validTripData,
        nap_preference: "sometimes",
      };

      const response = await POST(createRequest(invalidTrip));

      expect(response.status).toBe(400);
    });

    it("returns 400 for invalid schedule_intensity", async () => {
      const invalidTrip = {
        ...validTripData,
        schedule_intensity: "extreme",
      };

      const response = await POST(createRequest(invalidTrip));

      expect(response.status).toBe(400);
    });
  });
});
