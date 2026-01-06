"""
Vercel Python Function for schedule generation.

This endpoint handles POST requests to /api/schedule/generate and returns
a jet lag adaptation schedule based on the provided trip parameters.
"""

from http.server import BaseHTTPRequestHandler
import json
import sys
from pathlib import Path
from dataclasses import asdict
from uuid import uuid4

# Add the _python directory to the Python path for importing circadian module
sys.path.insert(0, str(Path(__file__).parent.parent / "_python"))

from circadian.types import TripLeg, ScheduleRequest
from circadian.scheduler import ScheduleGenerator


# Validation patterns
TIMEZONE_PATTERN_CHARS = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_/")


def validate_timezone(tz: str) -> bool:
    """Validate IANA timezone format like 'America/Los_Angeles'."""
    if not tz or "/" not in tz:
        return False
    return all(c in TIMEZONE_PATTERN_CHARS for c in tz)


def validate_datetime(dt: str) -> bool:
    """Validate ISO datetime format like '2025-01-06T09:45'."""
    if not dt or len(dt) != 16:
        return False
    # Check format: YYYY-MM-DDTHH:MM
    try:
        parts = dt.split("T")
        if len(parts) != 2:
            return False
        date_parts = parts[0].split("-")
        time_parts = parts[1].split(":")
        if len(date_parts) != 3 or len(time_parts) != 2:
            return False
        # Basic numeric validation
        int(date_parts[0])  # year
        int(date_parts[1])  # month
        int(date_parts[2])  # day
        int(time_parts[0])  # hour
        int(time_parts[1])  # minute
        return True
    except (ValueError, IndexError):
        return False


def validate_time(t: str) -> bool:
    """Validate time format like '07:00'."""
    if not t or len(t) != 5:
        return False
    try:
        parts = t.split(":")
        if len(parts) != 2:
            return False
        hour = int(parts[0])
        minute = int(parts[1])
        return 0 <= hour <= 23 and 0 <= minute <= 59
    except (ValueError, IndexError):
        return False


def validate_request(data: dict) -> str | None:
    """Validate request data, return error message or None if valid."""
    required_fields = [
        "origin_tz",
        "dest_tz",
        "departure_datetime",
        "arrival_datetime",
        "prep_days",
        "wake_time",
        "sleep_time",
    ]

    for field in required_fields:
        if field not in data:
            return f"Missing required field: {field}"

    if not validate_timezone(data["origin_tz"]):
        return f"Invalid origin timezone format: {data['origin_tz']}"
    if not validate_timezone(data["dest_tz"]):
        return f"Invalid destination timezone format: {data['dest_tz']}"

    if not validate_datetime(data["departure_datetime"]):
        return f"Invalid departure datetime format: {data['departure_datetime']}"
    if not validate_datetime(data["arrival_datetime"]):
        return f"Invalid arrival datetime format: {data['arrival_datetime']}"

    if not validate_time(data["wake_time"]):
        return f"Invalid wake time format: {data['wake_time']}"
    if not validate_time(data["sleep_time"]):
        return f"Invalid sleep time format: {data['sleep_time']}"

    prep_days = data.get("prep_days")
    if not isinstance(prep_days, int) or prep_days < 1 or prep_days > 7:
        return "prep_days must be a number between 1 and 7"

    return None


class handler(BaseHTTPRequestHandler):
    """HTTP handler for Vercel Python Functions."""

    def do_POST(self):
        """Handle POST requests for schedule generation."""
        try:
            # Read request body
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)

            # Validate input
            validation_error = validate_request(data)
            if validation_error:
                self._send_json_response(400, {"error": validation_error})
                return

            # Build schedule request
            request = ScheduleRequest(
                legs=[
                    TripLeg(
                        origin_tz=data["origin_tz"],
                        dest_tz=data["dest_tz"],
                        departure_datetime=data["departure_datetime"],
                        arrival_datetime=data["arrival_datetime"],
                    )
                ],
                prep_days=data["prep_days"],
                wake_time=data["wake_time"],
                sleep_time=data["sleep_time"],
                uses_melatonin=data.get("uses_melatonin", True),
                uses_caffeine=data.get("uses_caffeine", True),
                uses_exercise=data.get("uses_exercise", False),
            )

            # Generate schedule
            generator = ScheduleGenerator()
            response = generator.generate_schedule(request)

            # Convert to JSON response
            result = {
                "id": str(uuid4()),
                "schedule": asdict(response),
            }

            self._send_json_response(200, result)

        except json.JSONDecodeError:
            self._send_json_response(400, {"error": "Invalid JSON in request body"})
        except Exception as e:
            self._send_json_response(
                500, {"error": f"Schedule generation failed: {str(e)}"}
            )

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
