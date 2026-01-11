/**
 * Integration tests for MCP API route.
 *
 * Tests the full JSON-RPC flow including tool execution.
 * Mocks the internal fetch to the Python tools endpoint.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST, GET, OPTIONS } from "../route";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Helper to create MCP request
function createMcpRequest(body: object): Request {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/mcp", () => {
    it("returns server info", async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.name).toBe("Dawnward Jet Lag API");
      expect(data.version).toBe("1.0.0");
      expect(data.endpoints.mcp).toBe("/api/mcp");
    });

    it("includes CORS headers", async () => {
      const response = await GET();

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
        "GET"
      );
    });
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
        "Content-Type"
      );
    });
  });

  describe("POST /api/mcp - initialize", () => {
    it("returns server capabilities", async () => {
      const response = await POST(
        createMcpRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
        })
      );
      const data = await response.json();

      expect(data.jsonrpc).toBe("2.0");
      expect(data.id).toBe(1);
      expect(data.result.protocolVersion).toBe("2024-11-05");
      expect(data.result.serverInfo.name).toBe("Dawnward Jet Lag API");
      expect(data.result.capabilities).toBeDefined();
    });
  });

  describe("POST /api/mcp - tools/list", () => {
    it("returns available tools", async () => {
      const response = await POST(
        createMcpRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        })
      );
      const data = await response.json();

      expect(data.result.tools).toHaveLength(2);
      expect(data.result.tools[0].name).toBe("calculate_phase_shift");
      expect(data.result.tools[1].name).toBe("get_adaptation_plan");
    });
  });

  describe("POST /api/mcp - tools/call calculate_phase_shift", () => {
    it("executes calculate_phase_shift tool successfully", async () => {
      // Mock the Python endpoint response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockPhaseShiftResult }),
      });

      const response = await POST(
        createMcpRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "calculate_phase_shift",
            arguments: {
              origin_timezone: "America/Los_Angeles",
              destination_timezone: "Europe/London",
            },
          },
        })
      );
      const data = await response.json();

      expect(data.error).toBeUndefined();
      expect(data.result.content).toHaveLength(1);
      expect(data.result.content[0].type).toBe("text");

      const toolResult = JSON.parse(data.result.content[0].text);
      expect(toolResult.optimal_direction).toBe("advance");
      expect(toolResult.difficulty).toBe("hard");
    });

    it("calls Python endpoint with correct parameters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockPhaseShiftResult }),
      });

      await POST(
        createMcpRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "calculate_phase_shift",
            arguments: {
              origin_timezone: "America/Los_Angeles",
              destination_timezone: "Europe/London",
            },
          },
        })
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("/api/mcp/tools");
      expect(options.method).toBe("POST");

      const body = JSON.parse(options.body);
      expect(body.tool_name).toBe("calculate_phase_shift");
      expect(body.arguments.origin_timezone).toBe("America/Los_Angeles");
      expect(body.arguments.destination_timezone).toBe("Europe/London");
    });

    it("returns error for invalid timezone", async () => {
      const response = await POST(
        createMcpRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "calculate_phase_shift",
            arguments: {
              origin_timezone: "Invalid/Timezone",
              destination_timezone: "Europe/London",
            },
          },
        })
      );
      const data = await response.json();

      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32602); // INVALID_PARAMS
    });
  });

  describe("POST /api/mcp - tools/call get_adaptation_plan", () => {
    it("executes get_adaptation_plan tool successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockAdaptationPlanResult }),
      });

      const response = await POST(
        createMcpRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "get_adaptation_plan",
            arguments: {
              origin_timezone: "America/Los_Angeles",
              destination_timezone: "Europe/London",
              departure_datetime: "2026-02-15T11:30",
              arrival_datetime: "2026-02-16T07:30",
            },
          },
        })
      );
      const data = await response.json();

      expect(data.error).toBeUndefined();
      expect(data.result.content).toHaveLength(1);

      const toolResult = JSON.parse(data.result.content[0].text);
      expect(toolResult.summary.shift_direction).toBe("advance");
      expect(toolResult.summary.total_days).toBe(9);
    });

    it("returns error for missing required parameters", async () => {
      const response = await POST(
        createMcpRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "get_adaptation_plan",
            arguments: {
              origin_timezone: "America/Los_Angeles",
              // Missing destination_timezone, departure_datetime, arrival_datetime
            },
          },
        })
      );
      const data = await response.json();

      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32602); // INVALID_PARAMS
    });
  });

  describe("POST /api/mcp - error handling", () => {
    it("returns error for unknown method", async () => {
      const response = await POST(
        createMcpRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "unknown/method",
        })
      );
      const data = await response.json();

      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32601); // METHOD_NOT_FOUND
      expect(data.error.message).toContain("unknown/method");
    });

    it("returns error for unknown tool", async () => {
      const response = await POST(
        createMcpRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "unknown_tool",
            arguments: {},
          },
        })
      );
      const data = await response.json();

      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32601); // METHOD_NOT_FOUND
      expect(data.error.message).toContain("unknown_tool");
    });

    it("returns error when Python endpoint fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Internal server error" }),
      });

      const response = await POST(
        createMcpRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "calculate_phase_shift",
            arguments: {
              origin_timezone: "America/Los_Angeles",
              destination_timezone: "Europe/London",
            },
          },
        })
      );
      const data = await response.json();

      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32603); // INTERNAL_ERROR
    });

    it("returns error for invalid JSON-RPC request", async () => {
      const response = await POST(
        createMcpRequest({
          // Missing jsonrpc version
          id: 1,
          method: "tools/list",
        })
      );
      const data = await response.json();

      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32600); // INVALID_REQUEST
    });
  });

  describe("CORS headers on responses", () => {
    it("includes CORS headers on success response", async () => {
      const response = await POST(
        createMcpRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        })
      );

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    it("includes CORS headers on error response", async () => {
      const response = await POST(
        createMcpRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "unknown/method",
        })
      );

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });
});
