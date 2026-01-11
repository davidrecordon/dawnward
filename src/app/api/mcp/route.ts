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
import { spawn } from "child_process";
import path from "path";
import { writeFile, unlink, mkdir } from "fs/promises";
import { randomUUID } from "crypto";
import os from "os";

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
  return NextResponse.json({
    jsonrpc: "2.0",
    id,
    result,
  });
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
  return NextResponse.json({
    jsonrpc: "2.0",
    id,
    error: { code, message, data },
  });
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
 * Call a Python MCP tool via subprocess.
 */
async function callPythonTool(
  toolName: string,
  args: unknown
): Promise<unknown> {
  const tempDir = path.join(os.tmpdir(), "dawnward");
  await mkdir(tempDir, { recursive: true });

  const requestId = randomUUID();
  const tempFilePath = path.join(tempDir, `mcp-${requestId}.json`);

  try {
    await writeFile(tempFilePath, JSON.stringify({ tool: toolName, args }));

    const pythonPath = path.resolve(process.cwd(), "api/_python");

    const pythonScript = `
import sys
import json

sys.path.insert(0, sys.argv[1])

from mcp_tools import invoke_tool

with open(sys.argv[2], 'r') as f:
    data = json.load(f)

result = invoke_tool(data['tool'], data['args'])
print(json.dumps(result))
`;

    const output = await new Promise<string>((resolve, reject) => {
      const python = spawn(
        "python3",
        ["-c", pythonScript, pythonPath, tempFilePath],
        { timeout: 10000 }
      );

      let stdout = "";
      let stderr = "";

      python.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      python.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      python.on("close", (code) => {
        if (code !== 0) {
          console.error("[MCP] Python error:", stderr);
          reject(new Error(`Python exited with code ${code}`));
        } else {
          resolve(stdout.trim());
        }
      });

      python.on("error", reject);
    });

    return JSON.parse(output);
  } finally {
    try {
      await unlink(tempFilePath);
    } catch (e) {
      console.error("[MCP] Cleanup failed:", e);
    }
  }
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
