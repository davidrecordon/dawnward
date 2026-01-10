/**
 * Tests for the user preferences API route validation logic.
 *
 * These tests verify the preference schema validation and field mapping
 * that occurs in the API route.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";

// Mirror the schema from route.ts
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

describe("User Preferences API Validation", () => {
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
