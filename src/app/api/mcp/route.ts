/**
 * MCP (Model Context Protocol) API Route
 *
 * JSON-RPC 2.0 compliant endpoint for AI assistants to query
 * Dawnward's circadian science tools.
 *
 * Methods:
 * - tools/list: Return available tool definitions
 * - tools/call: Execute a tool with arguments
 *
 * Rate limited: 100 requests per hour per IP
 */

import { NextResponse } from "next/server";

import { checkRateLimit, getRateLimitStatus } from "@/lib/rate-limiter";
import { getClientIP } from "@/lib/ip-utils";
import { toolDefinitions } from "@/lib/mcp/tool-definitions";
import {
  type JsonRpcRequest,
  type JsonRpcResponse,
  type ToolCallParams,
  type ToolResult,
  JSON_RPC_ERRORS,
  McpError,
  jsonRpcRequestSchema,
  toolCallParamsSchema,
  phaseShiftInputSchema,
  adaptationPlanInputSchema,
} from "@/lib/mcp/types";

const RATE_LIMIT = 100; // Requests per hour
const MAX_BODY_SIZE = 64 * 1024; // 64KB max request body

/**
 * Create a JSON-RPC 2.0 success response.
 */
function createJsonRpcResponse(
  id: string | number | null,
  result: unknown
): NextResponse<JsonRpcResponse> {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id,
      result,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    }
  );
}

/**
 * Create a JSON-RPC 2.0 error response.
 */
function createJsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): NextResponse<JsonRpcResponse> {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id,
      error: { code, message, data },
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    }
  );
}

/**
 * Execute the calculate_phase_shift tool (Python subprocess).
 */
async function executeCalculatePhaseShift(
  args: Record<string, unknown>
): Promise<ToolResult> {
  const parsed = phaseShiftInputSchema.safeParse(args);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    throw new McpError(
      JSON_RPC_ERRORS.INVALID_PARAMS,
      `Invalid params: ${firstError.message}`
    );
  }

  const result = await callPythonTool("calculate_phase_shift", parsed.data);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

/**
 * Execute the get_adaptation_plan tool (Python subprocess).
 */
async function executeGetAdaptationPlan(
  args: Record<string, unknown>
): Promise<ToolResult> {
  const parsed = adaptationPlanInputSchema.safeParse(args);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    throw new McpError(
      JSON_RPC_ERRORS.INVALID_PARAMS,
      `Invalid params: ${firstError.message}`
    );
  }

  const result = await callPythonTool("get_adaptation_plan", parsed.data);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

/**
 * Get the base URL for internal API calls.
 * Uses VERCEL_URL in production, localhost in development.
 */
function getBaseUrl(): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

/**
 * Call a Python MCP tool via internal HTTP endpoint.
 */
async function callPythonTool(
  toolName: string,
  args: unknown
): Promise<unknown> {
  const baseUrl = getBaseUrl();
  const response = await fetch(`${baseUrl}/api/mcp/tools`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool_name: toolName, arguments: args }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error("[MCP] Python tool error:", error);
    throw new Error(error.error || `Tool execution failed: ${response.status}`);
  }

  const data = await response.json();
  return data.result;
}

/**
 * Handle tool execution.
 */
async function handleToolCall(params: unknown): Promise<ToolResult> {
  const parsed = toolCallParamsSchema.safeParse(params);
  if (!parsed.success) {
    throw new McpError(
      JSON_RPC_ERRORS.INVALID_PARAMS,
      "Invalid tool call params"
    );
  }

  const { name, arguments: args } = parsed.data;

  switch (name) {
    case "calculate_phase_shift":
      return executeCalculatePhaseShift(args);

    case "get_adaptation_plan":
      return executeGetAdaptationPlan(args);

    default:
      throw new McpError(
        JSON_RPC_ERRORS.METHOD_NOT_FOUND,
        `Unknown tool: ${name}`
      );
  }
}

/**
 * CORS headers for MCP clients
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * OPTIONS /api/mcp - CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * GET /api/mcp - Server info for discovery
 */
export async function GET() {
  return NextResponse.json(
    {
      name: "Dawnward Jet Lag API",
      version: "1.0.0",
      description: "Circadian science tools for jet lag optimization",
      endpoints: {
        mcp: "/api/mcp",
      },
    },
    { headers: corsHeaders }
  );
}

/**
 * POST /api/mcp - JSON-RPC 2.0 endpoint
 */
export async function POST(request: Request) {
  const startTime = Date.now();

  // Check content-length before processing
  const contentLength = request.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
    return createJsonRpcError(
      null,
      JSON_RPC_ERRORS.INVALID_REQUEST,
      `Request body too large (max ${MAX_BODY_SIZE} bytes)`
    );
  }

  // Rate limiting
  const ip = getClientIP(request);
  if (!checkRateLimit(ip, RATE_LIMIT)) {
    const status = getRateLimitStatus(ip, RATE_LIMIT);
    return createJsonRpcError(
      null,
      JSON_RPC_ERRORS.RATE_LIMIT_EXCEEDED,
      `Rate limit exceeded (${RATE_LIMIT} requests per hour). Resets at ${status.resetAt.toISOString()}`
    );
  }

  // Parse JSON-RPC request
  let rpcRequest: JsonRpcRequest;
  try {
    const body = await request.json();
    const parsed = jsonRpcRequestSchema.safeParse(body);
    if (!parsed.success) {
      return createJsonRpcError(
        null,
        JSON_RPC_ERRORS.INVALID_REQUEST,
        "Invalid JSON-RPC request"
      );
    }
    rpcRequest = parsed.data as JsonRpcRequest;
  } catch {
    return createJsonRpcError(null, JSON_RPC_ERRORS.PARSE_ERROR, "Parse error");
  }

  // Dispatch method
  try {
    let result: unknown;

    switch (rpcRequest.method) {
      case "initialize":
        // MCP handshake - return server capabilities
        result = {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "Dawnward Jet Lag API",
            version: "1.0.0",
          },
        };
        break;

      case "notifications/initialized":
        // Client acknowledgment - no response needed but we return success
        result = {};
        break;

      case "tools/list":
        result = { tools: toolDefinitions };
        break;

      case "tools/call":
        result = await handleToolCall(rpcRequest.params as ToolCallParams);
        break;

      default:
        return createJsonRpcError(
          rpcRequest.id,
          JSON_RPC_ERRORS.METHOD_NOT_FOUND,
          `Method not found: ${rpcRequest.method}`
        );
    }

    const duration = Date.now() - startTime;
    const toolName =
      rpcRequest.method === "tools/call"
        ? (rpcRequest.params as ToolCallParams)?.name
        : "list";
    console.log(`[MCP] ${rpcRequest.method} (${toolName}) - ${duration}ms`);

    return createJsonRpcResponse(rpcRequest.id, result);
  } catch (error) {
    // Handle MCP errors
    if (error instanceof McpError) {
      return createJsonRpcError(rpcRequest.id, error.code, error.message);
    }

    // Log unexpected errors
    console.error("[MCP] Unexpected error:", error);
    return createJsonRpcError(
      rpcRequest.id,
      JSON_RPC_ERRORS.INTERNAL_ERROR,
      "Internal error"
    );
  }
}
