/**
 * MCP Tool Definitions for the tools/list response.
 *
 * These JSON Schema definitions describe the available tools
 * so AI assistants can discover and use them correctly.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "calculate_phase_shift",
    description:
      "Calculate timezone shift and adaptation difficulty for a trip. Returns optimal shift direction (advance vs delay), difficulty rating, and estimated adaptation days. Use this for quick 'how hard is this trip?' questions without requiring flight details.",
    inputSchema: {
      type: "object",
      properties: {
        origin_timezone: {
          type: "string",
          description: 'IANA timezone name (e.g., "America/Los_Angeles")',
        },
        destination_timezone: {
          type: "string",
          description: 'IANA timezone name (e.g., "Asia/Tokyo")',
        },
        travel_date: {
          type: "string",
          description:
            "Optional ISO date (YYYY-MM-DD) for DST-aware calculation",
        },
      },
      required: ["origin_timezone", "destination_timezone"],
    },
  },
  {
    name: "get_adaptation_plan",
    description:
      "Generate a complete jet lag adaptation schedule with daily interventions (light exposure, melatonin, caffeine, sleep targets). Returns actionable timeline from prep days through full adaptation at destination.",
    inputSchema: {
      type: "object",
      properties: {
        origin_timezone: {
          type: "string",
          description: 'IANA timezone name (e.g., "America/Los_Angeles")',
        },
        destination_timezone: {
          type: "string",
          description: 'IANA timezone name (e.g., "Asia/Tokyo")',
        },
        departure_datetime: {
          type: "string",
          description:
            "ISO datetime in origin timezone (YYYY-MM-DDTHH:MM), e.g., 2026-02-15T11:30",
        },
        arrival_datetime: {
          type: "string",
          description:
            "ISO datetime in destination timezone (YYYY-MM-DDTHH:MM), e.g., 2026-02-16T15:45",
        },
        prep_days: {
          type: "integer",
          description: "Days to prepare before departure (1-7, default: 3)",
          default: 3,
        },
        usual_wake_time: {
          type: "string",
          description: 'Baseline wake time in HH:MM format (default: "07:00")',
          default: "07:00",
        },
        usual_sleep_time: {
          type: "string",
          description: 'Baseline sleep time in HH:MM format (default: "23:00")',
          default: "23:00",
        },
        interventions: {
          type: "object",
          description: "Which interventions to include in the plan",
          properties: {
            melatonin: {
              type: "boolean",
              description: "Include melatonin timing (default: true)",
              default: true,
            },
            caffeine: {
              type: "boolean",
              description: "Include caffeine strategy (default: true)",
              default: true,
            },
          },
        },
      },
      required: [
        "origin_timezone",
        "destination_timezone",
        "departure_datetime",
        "arrival_datetime",
      ],
    },
  },
];
