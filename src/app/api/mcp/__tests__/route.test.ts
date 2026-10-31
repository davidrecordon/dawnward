/**
 * Integration tests for the MCP API route.
 *
 * Drives the route with real Streamable HTTP requests and asserts on the
 * JSON-RPC responses produced by the MCP SDK. Mocks the internal fetch to
 * the Python tools endpoint.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST, GET, DELETE, OPTIONS } from "../route";
import { clearRateLimits } from "@/lib/rate-limiter";

// Mock fetch globally (the route calls the Python endpoint via fetch)
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const MCP_ACCEPT = "application/json, text/event-stream";
const RATE_LIMIT = 100;

/** Build a Streamable HTTP POST carrying a JSON-RPC message. */
function createMcpRequest(
  body: object | string,
  headers: Record<string, string> = {}
): Request {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: MCP_ACCEPT,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

interface JsonRpcEnvelope {
  jsonrpc: "2.0";
  id?: string | number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;
  error?: { code: number; message: string };
}

/** Parse a JSON-RPC response body, whether delivered as JSON or SSE. */
async function readJsonRpc(response: Response): Promise<JsonRpcEnvelope> {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    return JSON.parse(text);
  }
  const dataLines = text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim());
  return JSON.parse(dataLines[dataLines.length - 1]);
}

async function callTool(
  name: string,
  args: Record<string, unknown>
): Promise<JsonRpcEnvelope> {
  const response = await POST(
    createMcpRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    })
  );
  return readJsonRpc(response);
}

function mockPythonSuccess(result: unknown): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ result }),
  });
}

const PHASE_SHIFT_ARGS = {
  origin_timezone: "America/Los_Angeles",
  destination_timezone: "Europe/London",
};

const ADAPTATION_PLAN_ARGS = {
  ...PHASE_SHIFT_ARGS,
  departure_datetime: "2026-02-15T11:30",
  arrival_datetime: "2026-02-16T07:30",
};

// Mock Python tool responses
const mockPhaseShiftResult = {
  raw_shift_hours: 8,
  raw_direction: "advance",
  optimal_shift_hours: 8,
  optimal_direction: "advance",
  difficulty: "hard",
  estimated_days: {
    with_interventions: 6,
    without_interventions: 8,
  },
  explanation: "Your circadian clock needs to advance by 8 hours.",
};

const mockAdaptationPlanResult = {
  summary: {
    total_days: 9,
    prep_days: 3,
    post_arrival_days: 6,
    shift_direction: "advance",
    shift_hours: 8,
    key_advice: "Shift your schedule 8 hours earlier over 3 days.",
  },
  days: [{ day: -3, date: "2026-02-12", items: [] }],
};

describe("MCP API Route", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearRateLimits();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("OPTIONS /api/mcp", () => {
    it("returns 204 for CORS preflight", async () => {
      const response = await OPTIONS();

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
        "POST"
      );
      expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
        "Mcp-Session-Id"
      );
    });
  });

  describe("GET and DELETE /api/mcp (stateless)", () => {
    it("rejects GET session streams with 405", async () => {
      const response = await GET(
        new Request("http://localhost/api/mcp", {
          method: "GET",
          headers: { Accept: "text/event-stream" },
        })
      );

      expect(response.status).toBe(405);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    it("rejects DELETE session termination with 405", async () => {
      const response = await DELETE(
        new Request("http://localhost/api/mcp", { method: "DELETE" })
      );

      expect(response.status).toBe(405);
    });
  });

  describe("POST /api/mcp - lifecycle", () => {
    it("negotiates protocol version and returns server info on initialize", async () => {
      const response = await POST(
        createMcpRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
          },
        })
      );
      const data = await readJsonRpc(response);

      expect(response.status).toBe(200);
      expect(data.jsonrpc).toBe("2.0");
      expect(data.id).toBe(1);
      expect(data.result.protocolVersion).toBe("2025-06-18");
      expect(data.result.serverInfo.name).toBe("Dawnward Jet Lag API");
      expect(data.result.capabilities.tools).toBeDefined();
    });

    it("accepts notifications/initialized with 202 and no body", async () => {
      const response = await POST(
        createMcpRequest({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        })
      );

      expect(response.status).toBe(202);
      expect(await response.text()).toBe("");
    });

    it("responds to ping", async () => {
      const response = await POST(
        createMcpRequest({ jsonrpc: "2.0", id: 7, method: "ping" })
      );
      const data = await readJsonRpc(response);

      expect(data.id).toBe(7);
      expect(data.result).toEqual({});
    });

    it("rejects requests that do not accept text/event-stream", async () => {
      const response = await POST(
        createMcpRequest(
          { jsonrpc: "2.0", id: 1, method: "ping" },
          { Accept: "application/json" }
        )
      );

      expect(response.status).toBe(406);
    });
  });

  describe("POST /api/mcp - tools/list", () => {
    it("returns both tools with JSON Schema derived from Zod", async () => {
      const response = await POST(
        createMcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" })
      );
      const data = await readJsonRpc(response);

      expect(data.result.tools).toHaveLength(2);
      const [phaseShift, plan] = data.result.tools;

      expect(phaseShift.name).toBe("calculate_phase_shift");
      expect(phaseShift.inputSchema.type).toBe("object");
      expect(phaseShift.inputSchema.required).toEqual([
        "origin_timezone",
        "destination_timezone",
      ]);
      expect(
        phaseShift.inputSchema.properties.origin_timezone.description
      ).toContain("IANA timezone");

      expect(plan.name).toBe("get_adaptation_plan");
      expect(plan.inputSchema.required).toEqual([
        "origin_timezone",
        "destination_timezone",
        "departure_datetime",
        "arrival_datetime",
      ]);
      expect(plan.inputSchema.properties.prep_days.default).toBe(3);
    });
  });

  describe("POST /api/mcp - tools/call calculate_phase_shift", () => {
    it("executes calculate_phase_shift tool successfully", async () => {
      mockPythonSuccess(mockPhaseShiftResult);

      const data = await callTool("calculate_phase_shift", PHASE_SHIFT_ARGS);

      expect(data.error).toBeUndefined();
      expect(data.result.content).toHaveLength(1);
      expect(data.result.content[0].type).toBe("text");

      const toolResult = JSON.parse(data.result.content[0].text);
      expect(toolResult.optimal_direction).toBe("advance");
      expect(toolResult.difficulty).toBe("hard");
    });

    it("calls Python endpoint with correct parameters", async () => {
      mockPythonSuccess(mockPhaseShiftResult);

      await callTool("calculate_phase_shift", PHASE_SHIFT_ARGS);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/api/mcp/tools");
      expect(options.method).toBe("POST");
      expect(options.headers["X-MCP-Internal"]).toBeDefined();

      const body = JSON.parse(options.body);
      expect(body.tool_name).toBe("calculate_phase_shift");
      expect(body.arguments.origin_timezone).toBe("America/Los_Angeles");
      expect(body.arguments.destination_timezone).toBe("Europe/London");
    });

    it("returns a tool error for invalid timezone without calling Python", async () => {
      const data = await callTool("calculate_phase_shift", {
        origin_timezone: "Invalid/Timezone",
        destination_timezone: "Europe/London",
      });

      // The SDK reports input validation failures as tool errors so the
      // model can read the message and correct its arguments.
      expect(data.result.isError).toBe(true);
      expect(data.result.content[0].text).toContain("Invalid IANA timezone");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/mcp - tools/call get_adaptation_plan", () => {
    it("executes get_adaptation_plan tool successfully", async () => {
      mockPythonSuccess(mockAdaptationPlanResult);

      const data = await callTool("get_adaptation_plan", ADAPTATION_PLAN_ARGS);

      expect(data.error).toBeUndefined();
      const toolResult = JSON.parse(data.result.content[0].text);
      expect(toolResult.summary.shift_direction).toBe("advance");
      expect(toolResult.summary.total_days).toBe(9);
    });

    it("applies Zod defaults before calling Python", async () => {
      mockPythonSuccess(mockAdaptationPlanResult);

      await callTool("get_adaptation_plan", ADAPTATION_PLAN_ARGS);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.arguments.prep_days).toBe(3);
      expect(body.arguments.usual_wake_time).toBe("07:00");
      expect(body.arguments.interventions).toEqual({
        melatonin: true,
        caffeine: true,
      });
    });

    it("returns a tool error naming missing required parameters", async () => {
      const data = await callTool("get_adaptation_plan", {
        origin_timezone: "America/Los_Angeles",
      });

      expect(data.result.isError).toBe(true);
      expect(data.result.content[0].text).toContain("destination_timezone");
      expect(data.result.content[0].text).toContain("departure_datetime");
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/mcp - error handling", () => {
    it("returns method not found for unknown method", async () => {
      const response = await POST(
        createMcpRequest({ jsonrpc: "2.0", id: 1, method: "unknown/method" })
      );
      const data = await readJsonRpc(response);

      expect(data.error).toBeDefined();
      expect(data.error?.code).toBe(-32601); // METHOD_NOT_FOUND
    });

    it("returns an error naming the unknown tool", async () => {
      const data = await callTool("unknown_tool", {});

      expect(data.error).toBeDefined();
      expect(data.error?.message).toContain("unknown_tool");
    });

    it("returns a tool error without leaking details when Python fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Traceback: secret internals" }),
      });

      const data = await callTool("calculate_phase_shift", PHASE_SHIFT_ARGS);

      expect(data.result.isError).toBe(true);
      expect(JSON.stringify(data)).not.toContain("secret internals");
    });

    it("returns a generic tool error when Python returns non-JSON", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE\"...");
        },
      });

      const data = await callTool("calculate_phase_shift", PHASE_SHIFT_ARGS);

      expect(data.result.isError).toBe(true);
      expect(data.result.content[0].text).toBe("Tool execution failed");
    });

    it("returns a generic tool error when Python omits result", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      const data = await callTool("calculate_phase_shift", PHASE_SHIFT_ARGS);

      expect(data.result.isError).toBe(true);
      expect(data.result.content[0].text).toBe("Tool execution failed");
    });

    it("returns a generic tool error when the Python fetch rejects", async () => {
      mockFetch.mockRejectedValueOnce(
        new TypeError("fetch failed: ECONNREFUSED")
      );

      const data = await callTool("calculate_phase_shift", PHASE_SHIFT_ARGS);

      expect(data.result.isError).toBe(true);
      expect(JSON.stringify(data)).not.toContain("ECONNREFUSED");
    });

    it("returns invalid request for malformed JSON-RPC", async () => {
      const response = await POST(
        createMcpRequest({ id: 1, method: "tools/list" }) // missing jsonrpc
      );
      const data = await readJsonRpc(response);

      expect(data.error).toBeDefined();
      expect(data.error?.code).toBe(-32600); // INVALID_REQUEST
    });

    it("returns parse error for invalid JSON", async () => {
      const response = await POST(createMcpRequest("{not json"));
      const data = await readJsonRpc(response);

      expect(response.status).toBe(400);
      expect(data.error?.code).toBe(-32700); // PARSE_ERROR
    });

    it("rejects oversized request bodies with 413", async () => {
      const padding = "x".repeat(70 * 1024);
      const response = await POST(
        createMcpRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "ping",
          params: { padding },
        })
      );

      expect(response.status).toBe(413);
    });
  });

  describe("rate limiting", () => {
    it("returns 429 with Retry-After after 100 requests from one IP", async () => {
      const headers = { "x-forwarded-for": "203.0.113.7" };

      for (let i = 0; i < RATE_LIMIT; i++) {
        const response = await POST(
          createMcpRequest({ jsonrpc: "2.0", id: i, method: "ping" }, headers)
        );
        expect(response.status).toBe(200);
      }

      const limited = await POST(
        createMcpRequest(
          { jsonrpc: "2.0", id: RATE_LIMIT + 1, method: "ping" },
          headers
        )
      );
      const data = await limited.json();

      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
      expect(data.error?.code).toBe(-32001);
      expect(limited.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  describe("CORS headers on responses", () => {
    it("includes CORS headers on success response", async () => {
      const response = await POST(
        createMcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" })
      );

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    it("includes CORS headers on error response", async () => {
      const response = await POST(
        createMcpRequest({ jsonrpc: "2.0", id: 1, method: "unknown/method" })
      );

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });
});
