/**
 * MCP tool input schemas.
 *
 * The Zod schemas are the single source of truth for each tool's input:
 * the MCP SDK validates `tools/call` arguments against them and derives the
 * JSON Schema advertised by `tools/list` from them, so field `.describe()`
 * text is what AI assistants see.
 */

import { z } from "zod";

// =============================================================================
// Field Schemas
// =============================================================================

/**
 * Validate that a timezone string is a valid IANA timezone.
 */
function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Max timezone length (longest IANA: "America/Argentina/Buenos_Aires" = 32)
const MAX_TIMEZONE_LENGTH = 64;

const timezoneSchema = z
  .string()
  .min(1)
  .max(MAX_TIMEZONE_LENGTH)
  .refine(isValidTimezone, {
    message: "Invalid IANA timezone",
  });

const DATE_FORMAT = "YYYY-MM-DD";
const DATETIME_FORMAT = "YYYY-MM-DDTHH:MM";
const TIME_FORMAT = "HH:MM";

const dateSchema = z
  .string()
  .max(DATE_FORMAT.length)
  .regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: `Invalid date format (expected ${DATE_FORMAT})`,
  });

const datetimeSchema = z
  .string()
  .max(DATETIME_FORMAT.length)
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, {
    message: `Invalid datetime format (expected ${DATETIME_FORMAT})`,
  });

const timeSchema = z
  .string()
  .max(TIME_FORMAT.length)
  .regex(/^\d{2}:\d{2}$/, {
    message: `Invalid time format (expected ${TIME_FORMAT})`,
  });

// Shared by both tools
const originTimezoneSchema = timezoneSchema.describe(
  'IANA timezone name (e.g., "America/Los_Angeles")'
);
const destinationTimezoneSchema = timezoneSchema.describe(
  'IANA timezone name (e.g., "Asia/Tokyo")'
);

// Adaptation plan defaults and bounds
const MIN_PREP_DAYS = 1;
const MAX_PREP_DAYS = 7;
const DEFAULT_PREP_DAYS = 3;
const DEFAULT_WAKE_TIME = "07:00";
const DEFAULT_SLEEP_TIME = "23:00";

// =============================================================================
// Tool Input Schemas
// =============================================================================

export const phaseShiftInputSchema = z.object({
  origin_timezone: originTimezoneSchema,
  destination_timezone: destinationTimezoneSchema,
  travel_date: dateSchema
    .optional()
    .describe("Optional ISO date (YYYY-MM-DD) for DST-aware calculation"),
});

export const adaptationPlanInputSchema = z.object({
  origin_timezone: originTimezoneSchema,
  destination_timezone: destinationTimezoneSchema,
  departure_datetime: datetimeSchema.describe(
    "ISO datetime in origin timezone (YYYY-MM-DDTHH:MM), e.g., 2026-02-15T11:30"
  ),
  arrival_datetime: datetimeSchema.describe(
    "ISO datetime in destination timezone (YYYY-MM-DDTHH:MM), e.g., 2026-02-16T15:45"
  ),
  prep_days: z
    .number()
    .int()
    .min(MIN_PREP_DAYS)
    .max(MAX_PREP_DAYS)
    .default(DEFAULT_PREP_DAYS)
    .describe(
      `Days to prepare before departure (${MIN_PREP_DAYS}-${MAX_PREP_DAYS}, default: ${DEFAULT_PREP_DAYS})`
    ),
  usual_wake_time: timeSchema
    .default(DEFAULT_WAKE_TIME)
    .describe(
      `Baseline wake time in ${TIME_FORMAT} format (default: "${DEFAULT_WAKE_TIME}")`
    ),
  usual_sleep_time: timeSchema
    .default(DEFAULT_SLEEP_TIME)
    .describe(
      `Baseline sleep time in ${TIME_FORMAT} format (default: "${DEFAULT_SLEEP_TIME}")`
    ),
  interventions: z
    .object({
      melatonin: z
        .boolean()
        .default(true)
        .describe("Include melatonin timing (default: true)"),
      caffeine: z
        .boolean()
        .default(true)
        .describe("Include caffeine strategy (default: true)"),
    })
    .default({ melatonin: true, caffeine: true })
    .describe("Which interventions to include in the plan"),
});
