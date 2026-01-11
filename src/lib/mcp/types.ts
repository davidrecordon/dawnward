/**
 * MCP (Model Context Protocol) type definitions.
 *
 * Implements JSON-RPC 2.0 protocol types and MCP-specific types
 * for the Dawnward jet lag optimization tools.
 */

import { z } from "zod";

// =============================================================================
// JSON-RPC 2.0 Protocol Types
// =============================================================================

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// Standard JSON-RPC 2.0 error codes
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom server errors (-32000 to -32099)
  RATE_LIMIT_EXCEEDED: -32001,
} as const;

// =============================================================================
// MCP Tool Types
// =============================================================================

export interface ToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

// =============================================================================
// Tool Input/Output Types
// =============================================================================

// calculate_phase_shift types
export interface PhaseShiftInput {
  origin_timezone: string;
  destination_timezone: string;
  travel_date?: string;
}

export interface PhaseShiftResult {
  raw_shift_hours: number;
  raw_direction: "advance" | "delay";
  optimal_shift_hours: number;
  optimal_direction: "advance" | "delay";
  difficulty: "easy" | "moderate" | "hard";
  estimated_days: {
    with_interventions: number;
    without_interventions: number;
  };
  explanation: string;
}

// get_adaptation_plan types
export interface AdaptationPlanInput {
  origin_timezone: string;
  destination_timezone: string;
  departure_datetime: string;
  arrival_datetime: string;
  prep_days?: number;
  usual_wake_time?: string;
  usual_sleep_time?: string;
  interventions?: {
    melatonin?: boolean;
    caffeine?: boolean;
  };
}

export interface AdaptationPlanSummary {
  total_days: number;
  prep_days: number;
  post_arrival_days: number;
  shift_direction: "advance" | "delay";
  shift_hours: number;
  key_advice: string;
}

export interface AdaptationPlanResult {
  summary: AdaptationPlanSummary;
  days: unknown[]; // DaySchedule[] from Python
}

// =============================================================================
// Zod Validation Schemas
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

const dateSchema = z
  .string()
  .max(10) // YYYY-MM-DD
  .regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "Invalid date format (expected YYYY-MM-DD)",
  });

const datetimeSchema = z
  .string()
  .max(16) // YYYY-MM-DDTHH:MM
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, {
    message: "Invalid datetime format (expected YYYY-MM-DDTHH:MM)",
  });

const timeSchema = z
  .string()
  .max(5) // HH:MM
  .regex(/^\d{2}:\d{2}$/, {
    message: "Invalid time format (expected HH:MM)",
  });

export const phaseShiftInputSchema = z.object({
  origin_timezone: timezoneSchema,
  destination_timezone: timezoneSchema,
  travel_date: dateSchema.optional(),
});

export const adaptationPlanInputSchema = z.object({
  origin_timezone: timezoneSchema,
  destination_timezone: timezoneSchema,
  departure_datetime: datetimeSchema,
  arrival_datetime: datetimeSchema,
  prep_days: z.number().int().min(1).max(7).default(3),
  usual_wake_time: timeSchema.default("07:00"),
  usual_sleep_time: timeSchema.default("23:00"),
  interventions: z
    .object({
      melatonin: z.boolean().default(true),
      caffeine: z.boolean().default(true),
    })
    .default({ melatonin: true, caffeine: true }),
});

export const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string().max(256), z.number(), z.null()]),
  method: z.string().max(64),
  params: z.unknown().optional(),
});

export const toolCallParamsSchema = z.object({
  name: z.string().max(64),
  arguments: z.record(z.string().max(64), z.unknown()),
});

// =============================================================================
// Error Helper
// =============================================================================

export class McpError extends Error {
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
    this.name = "McpError";
  }
}
