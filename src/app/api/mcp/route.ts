/**
 * MCP (Model Context Protocol) API Route
 *
 * Streamable HTTP endpoint for AI assistants to query Dawnward's circadian
 * science tools. Protocol handling (JSON-RPC framing, version negotiation,
 * tools/list, tools/call, ping, etc.) is delegated to the official MCP SDK;
 * this route adds rate limiting and CORS.
 *
 * Served statelessly: a fresh server is built per request, so GET/DELETE
 * session operations from older clients return 405.
 *
 * This is a deliberately public, unauthenticated API, so no Origin/Host
 * validation is applied in front of the SDK handler (CORS is `*`).
 *
 * Rate limited: 100 requests per hour per IP
 */

import { createMcpHandler } from "@modelcontextprotocol/server";

import { checkRateLimit, getRateLimitStatus } from "@/lib/rate-limiter";
import { getClientIP } from "@/lib/ip-utils";
import { createDawnwardMcpServer } from "@/lib/mcp/server";

const RATE_LIMIT = 100; // Requests per hour
const MAX_BODY_SIZE = 64 * 1024; // 64KB max request body
const RATE_LIMIT_ERROR_CODE = -32001; // Custom JSON-RPC server error
const MS_PER_SECOND = 1000;

/**
 * CORS headers for MCP clients.
 * Using * because MCP protocol requires cross-origin access from AI assistants.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version",
};

const mcpHandler = createMcpHandler(createDawnwardMcpServer, {
  legacy: "stateless",
  maxRequestBodySize: MAX_BODY_SIZE,
  // This server never publishes change events, so refuse long-lived
  // subscriptions/listen SSE streams that would otherwise pin a function open.
  maxSubscriptions: 0,
  onerror: (error) => console.error("[MCP] Handler error:", error),
});

/**
 * Return a copy of the response with CORS headers applied.
 * Preserves streaming bodies (SSE) by passing the body stream through.
 */
function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * HTTP 429 with a JSON-RPC error body and Retry-After header.
 */
function rateLimitResponse(ip: string): Response {
  const { resetAt } = getRateLimitStatus(ip, RATE_LIMIT);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((resetAt.getTime() - Date.now()) / MS_PER_SECOND)
  );

  return withCors(
    Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: RATE_LIMIT_ERROR_CODE,
          message: `Rate limit exceeded (${RATE_LIMIT} requests per hour). Resets at ${resetAt.toISOString()}`,
        },
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds) },
      }
    )
  );
}

/**
 * Rate-limit, then hand the request to the MCP SDK handler.
 */
async function handleMcpRequest(request: Request): Promise<Response> {
  const ip = getClientIP(request);
  if (!checkRateLimit(ip, RATE_LIMIT)) {
    return rateLimitResponse(ip);
  }

  // Tool-level timing is logged in server.ts; the handler resolves once
  // headers are sent, so timing here would be misleading for SSE responses.
  const response = await mcpHandler.fetch(request);
  console.log(`[MCP] ${request.method} ${response.status}`);

  return withCors(response);
}

/**
 * OPTIONS /api/mcp - CORS preflight
 */
export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export {
  handleMcpRequest as GET,
  handleMcpRequest as POST,
  handleMcpRequest as DELETE,
};
