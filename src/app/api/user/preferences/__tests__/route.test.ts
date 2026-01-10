/**
 * Tests for the user preferences API route.
 *
 * Tests cover:
 * 1. Authentication - 401 responses for unauthenticated requests
 * 2. Authorization - proper user scoping
 * 3. Schema validation - preference field validation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { GET, PATCH } from "../route";

// Mock the auth module
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

// Mock prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Import mocked modules
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Mock } from "vitest";

// Cast to mock types for proper method access
const mockedAuth = auth as unknown as Mock;
const mockedPrisma = prisma as unknown as {
  user: {
    findUnique: Mock;
    update: Mock;
  };
};

// Sample user preferences for tests
const mockUserPreferences = {
  defaultWakeTime: "07:00",
  defaultSleepTime: "23:00",
  defaultPrepDays: 3,
  usesMelatonin: true,
  usesCaffeine: true,
  usesExercise: false,
  napPreference: "flight_only",
  scheduleIntensity: "balanced",
};

describe("GET /api/user/preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("authentication", () => {
    it("returns 401 when session is null", async () => {
      mockedAuth.mockResolvedValue(null);

      const response = await GET();

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 401 when session has no user", async () => {
      mockedAuth.mockResolvedValue({ user: undefined } as never);

      const response = await GET();

      expect(response.status).toBe(401);
    });

    it("returns 401 when session.user has no id", async () => {
      mockedAuth.mockResolvedValue({
        user: { email: "test@example.com" },
      } as never);

      const response = await GET();

      expect(response.status).toBe(401);
    });
  });

  describe("when authenticated", () => {
    beforeEach(() => {
      mockedAuth.mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as never);
    });

    it("returns 404 when user not found in database", async () => {
      mockedPrisma.user.findUnique.mockResolvedValue(null);

      const response = await GET();

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe("User not found");
    });

    it("returns user preferences when user exists", async () => {
      mockedPrisma.user.findUnique.mockResolvedValue(
        mockUserPreferences as never
      );

      const response = await GET();

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual(mockUserPreferences);
    });

    it("queries database with correct user id", async () => {
      mockedPrisma.user.findUnique.mockResolvedValue(
        mockUserPreferences as never
      );

      await GET();

      expect(mockedPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-123" },
        select: expect.objectContaining({
          defaultWakeTime: true,
          defaultSleepTime: true,
        }),
      });
    });
  });
});

describe("PATCH /api/user/preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createRequest(body: unknown): Request {
    return new Request("http://localhost/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  describe("authentication", () => {
    it("returns 401 when session is null", async () => {
      mockedAuth.mockResolvedValue(null);

      const response = await PATCH(createRequest({ usesMelatonin: true }));

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 401 when session has no user", async () => {
      mockedAuth.mockResolvedValue({ user: undefined } as never);

      const response = await PATCH(createRequest({ usesMelatonin: true }));

      expect(response.status).toBe(401);
    });

    it("returns 401 when session.user has no id", async () => {
      mockedAuth.mockResolvedValue({
        user: { email: "test@example.com" },
      } as never);

      const response = await PATCH(createRequest({ usesMelatonin: true }));

      expect(response.status).toBe(401);
    });
  });

  describe("when authenticated", () => {
    beforeEach(() => {
      mockedAuth.mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as never);
      mockedPrisma.user.update.mockResolvedValue(mockUserPreferences as never);
    });

    it("returns 400 for invalid JSON", async () => {
      const request = new Request("http://localhost/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "not valid json",
      });

      const response = await PATCH(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid JSON");
    });

    it("returns 400 for empty updates", async () => {
      const response = await PATCH(createRequest({}));

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("No preferences to update");
    });

    it("returns 400 for invalid preference values", async () => {
      const response = await PATCH(
        createRequest({ scheduleIntensity: "extreme" })
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Invalid preferences");
    });

    it("updates user with valid preferences", async () => {
      const updates = { usesMelatonin: false, defaultWakeTime: "08:00" };

      const response = await PATCH(createRequest(updates));

      expect(response.status).toBe(200);
      expect(mockedPrisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: updates,
        select: expect.any(Object),
      });
    });

    it("returns updated preferences", async () => {
      const updatedPrefs = { ...mockUserPreferences, usesMelatonin: false };
      mockedPrisma.user.update.mockResolvedValue(updatedPrefs as never);

      const response = await PATCH(createRequest({ usesMelatonin: false }));

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.usesMelatonin).toBe(false);
    });
  });
});

// Keep existing schema validation tests
// Mirror the schema from route.ts for direct schema testing
const preferencesSchema = z.object({
  defaultWakeTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  defaultSleepTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  defaultPrepDays: z.number().min(1).max(7).optional(),
  usesMelatonin: z.boolean().optional(),
  usesCaffeine: z.boolean().optional(),
  usesExercise: z.boolean().optional(),
  napPreference: z.enum(["no", "flight_only", "all_days"]).optional(),
  scheduleIntensity: z.enum(["gentle", "balanced", "aggressive"]).optional(),
});

describe("User Preferences Schema Validation", () => {
  describe("time format validation", () => {
    it("accepts valid HH:MM format for wake time", () => {
      const result = preferencesSchema.safeParse({ defaultWakeTime: "07:30" });
      expect(result.success).toBe(true);
    });

    it("accepts valid HH:MM format for sleep time", () => {
      const result = preferencesSchema.safeParse({ defaultSleepTime: "23:00" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid time format", () => {
      const result = preferencesSchema.safeParse({ defaultWakeTime: "7:30" });
      expect(result.success).toBe(false);
    });

    it("rejects time with seconds", () => {
      const result = preferencesSchema.safeParse({
        defaultWakeTime: "07:30:00",
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-numeric time", () => {
      const result = preferencesSchema.safeParse({
        defaultWakeTime: "morning",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("prepDays validation", () => {
    it("accepts valid prep days (1-7)", () => {
      expect(preferencesSchema.safeParse({ defaultPrepDays: 1 }).success).toBe(
        true
      );
      expect(preferencesSchema.safeParse({ defaultPrepDays: 3 }).success).toBe(
        true
      );
      expect(preferencesSchema.safeParse({ defaultPrepDays: 7 }).success).toBe(
        true
      );
    });

    it("rejects prep days less than 1", () => {
      const result = preferencesSchema.safeParse({ defaultPrepDays: 0 });
      expect(result.success).toBe(false);
    });

    it("rejects prep days greater than 7", () => {
      const result = preferencesSchema.safeParse({ defaultPrepDays: 8 });
      expect(result.success).toBe(false);
    });
  });

  describe("napPreference validation", () => {
    it("accepts valid nap preferences", () => {
      expect(preferencesSchema.safeParse({ napPreference: "no" }).success).toBe(
        true
      );
      expect(
        preferencesSchema.safeParse({ napPreference: "flight_only" }).success
      ).toBe(true);
      expect(
        preferencesSchema.safeParse({ napPreference: "all_days" }).success
      ).toBe(true);
    });

    it("rejects invalid nap preference", () => {
      const result = preferencesSchema.safeParse({
        napPreference: "sometimes",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("scheduleIntensity validation", () => {
    it("accepts valid intensity values", () => {
      expect(
        preferencesSchema.safeParse({ scheduleIntensity: "gentle" }).success
      ).toBe(true);
      expect(
        preferencesSchema.safeParse({ scheduleIntensity: "balanced" }).success
      ).toBe(true);
      expect(
        preferencesSchema.safeParse({ scheduleIntensity: "aggressive" }).success
      ).toBe(true);
    });

    it("rejects invalid intensity value", () => {
      const result = preferencesSchema.safeParse({
        scheduleIntensity: "extreme",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("boolean preferences", () => {
    it("accepts boolean values for toggle preferences", () => {
      const result = preferencesSchema.safeParse({
        usesMelatonin: true,
        usesCaffeine: false,
        usesExercise: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.usesMelatonin).toBe(true);
        expect(result.data.usesCaffeine).toBe(false);
        expect(result.data.usesExercise).toBe(true);
      }
    });

    it("rejects non-boolean values", () => {
      const result = preferencesSchema.safeParse({
        usesMelatonin: "yes",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("partial updates", () => {
    it("allows updating only some fields", () => {
      const result = preferencesSchema.safeParse({
        defaultWakeTime: "08:00",
        usesMelatonin: false,
      });
      expect(result.success).toBe(true);
    });

    it("allows empty object (no updates)", () => {
      const result = preferencesSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe("complete preference set", () => {
    it("accepts all fields together", () => {
      const result = preferencesSchema.safeParse({
        defaultWakeTime: "07:00",
        defaultSleepTime: "23:00",
        defaultPrepDays: 3,
        usesMelatonin: true,
        usesCaffeine: true,
        usesExercise: false,
        napPreference: "flight_only",
        scheduleIntensity: "balanced",
      });
      expect(result.success).toBe(true);
    });
  });
});
