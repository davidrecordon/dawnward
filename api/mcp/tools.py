"""
Vercel Python Function for MCP tool execution.

This endpoint handles POST requests to /api/mcp/tools and executes
the requested MCP tool (calculate_phase_shift or get_adaptation_plan).
"""

from http.server import BaseHTTPRequestHandler
import json
import sys
from pathlib import Path

# Add the _python directory to the Python path for importing circadian module
sys.path.insert(0, str(Path(__file__).parent.parent / "_python"))

from mcp_tools import invoke_tool


class handler(BaseHTTPRequestHandler):
    """HTTP handler for Vercel Python Functions."""

    def do_POST(self):
        """Handle POST requests for MCP tool execution."""
        try:
            # Read request body
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)

            # Validate request
            tool_name = data.get("tool_name")
            arguments = data.get("arguments", {})

            if not tool_name:
                self._send_json_response(400, {"error": "Missing tool_name"})
                return

            if tool_name not in ("calculate_phase_shift", "get_adaptation_plan"):
                self._send_json_response(400, {"error": f"Unknown tool: {tool_name}"})
                return

            # Execute tool
            result = invoke_tool(tool_name, arguments)

            self._send_json_response(200, {"result": result})

        except json.JSONDecodeError:
            self._send_json_response(400, {"error": "Invalid JSON in request body"})
        except Exception as e:
            self._send_json_response(500, {"error": f"Tool execution failed: {str(e)}"})

    def _send_json_response(self, status_code: int, data: dict):
        """Send a JSON response with the given status code."""
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
