/**
 * Dawnward MCP server definition.
 *
 * Builds an `McpServer` (official MCP TypeScript SDK) exposing Dawnward's
 * circadian science tools. Tool execution is delegated to the Python
 * function at `/api/mcp/tools`, which runs the Arcascope-based scheduler.
 *
 * The HTTP route (`src/app/api/mcp/route.ts`) creates a fresh server per
 * request via `createDawnwardMcpServer`, so this module must stay stateless.
 */

import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";

import { phaseShiftInputSchema, adaptationPlanInputSchema } from "./types";

const MCP_SERVER_INFO = {
  name: "Dawnward Jet Lag API",
  version: "1.0.0",
} as const;

const LOCAL_BASE_URL = "http://localhost:3000";

type PythonToolName = "calculate_phase_shift" | "get_adaptation_plan";

/**
 * Get the base URL for internal API calls.
 * Uses VERCEL_URL in production, localhost in development.
 */
function getBaseUrl(): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return LOCAL_BASE_URL;
}

/**
 * Call a Python MCP tool via the internal HTTP endpoint.
 *
 * Any failure (network, non-2xx, malformed body) is logged server-side and
 * rethrown as a generic error, because the MCP SDK forwards tool exception
 * messages to clients verbatim.
 */
async function callPythonTool(
  toolName: PythonToolName,
  args: unknown
): Promise<unknown> {
  try {
    const response = await fetch(`${getBaseUrl()}/api/mcp/tools`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-MCP-Internal": process.env.MCP_INTERNAL_SECRET || "",
      },
      body: JSON.stringify({ tool_name: toolName, arguments: args }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(error)}`);
    }

    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null || !("result" in data)) {
      throw new Error("Response missing 'result'");
    }
    return data.result;
  } catch (error) {
    console.error(`[MCP] Python tool ${toolName} failed:`, error);
    throw new Error("Tool execution failed");
  }
}

/**
 * Wrap a tool result as MCP text content.
 */
function toTextResult(result: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

/**
 * Build a tool handler that forwards validated arguments to a Python tool.
 * Logs the tool name and end-to-end duration for latency visibility.
 */
function pythonToolHandler(
  toolName: PythonToolName
): (args: unknown) => Promise<CallToolResult> {
  return async function (args) {
    const startTime = Date.now();
    const result = await callPythonTool(toolName, args);
    console.log(`[MCP] tools/call ${toolName} - ${Date.now() - startTime}ms`);
    return toTextResult(result);
  };
}

/**
 * Create a Dawnward MCP server with all tools registered.
 */
export function createDawnwardMcpServer(): McpServer {
  const server = new McpServer(MCP_SERVER_INFO);

  server.registerTool(
    "calculate_phase_shift",
    {
      title: "Calculate Phase Shift",
      description:
        "Calculate timezone shift and adaptation difficulty for a trip. Returns optimal shift direction (advance vs delay), difficulty rating, and estimated adaptation days. Use this for quick 'how hard is this trip?' questions without requiring flight details.",
      inputSchema: phaseShiftInputSchema,
      annotations: { readOnlyHint: true },
    },
    pythonToolHandler("calculate_phase_shift")
  );

  server.registerTool(
    "get_adaptation_plan",
    {
      title: "Get Adaptation Plan",
      description:
        "Generate a complete jet lag adaptation schedule with daily interventions (light exposure, melatonin, caffeine, sleep targets). Returns actionable timeline from prep days through full adaptation at destination.",
      inputSchema: adaptationPlanInputSchema,
      annotations: { readOnlyHint: true },
    },
    pythonToolHandler("get_adaptation_plan")
  );

  return server;
}
