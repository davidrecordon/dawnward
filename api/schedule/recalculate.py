"""
Vercel Python Function for schedule recalculation.

This endpoint handles POST requests to /api/schedule/recalculate and returns
an updated schedule based on recorded actual behavior.
"""

from http.server import BaseHTTPRequestHandler
import json
import sys
from pathlib import Path
from dataclasses import asdict

# Add the _python directory to the Python path for importing circadian module
sys.path.insert(0, str(Path(__file__).parent.parent / "_python"))

from circadian.types import TripLeg, ScheduleRequest
from circadian.scheduler_v2 import ScheduleGeneratorV2
from circadian.recalculation import (
    MarkerSnapshot,
    InterventionActual,
    recalculate_from_actuals,
    actuals_from_dict,
)


def parse_snapshots(data: list[dict]) -> list[MarkerSnapshot]:
    """Convert JSON dicts to MarkerSnapshot objects."""
    return [
        MarkerSnapshot(
            day_offset=d["dayOffset"],
            cumulative_shift=d["cumulativeShift"],
            cbtmin_minutes=d["cbtminMinutes"],
            dlmo_minutes=d["dlmoMinutes"],
            direction=d["direction"],
        )
        for d in data
    ]


class handler(BaseHTTPRequestHandler):
    """HTTP handler for Vercel Python Functions."""

    def do_POST(self):
        """Handle POST requests for schedule recalculation."""
        try:
            # Read request body
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)

            # Validate required fields
            required_fields = [
                "origin_tz",
                "dest_tz",
                "departure_datetime",
                "arrival_datetime",
                "prep_days",
                "wake_time",
                "sleep_time",
                "current_schedule",
                "actuals",
            ]
            for field in required_fields:
                if field not in data:
                    self._send_json_response(400, {"error": f"Missing: {field}"})
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
                nap_preference=data.get("nap_preference", "flight_only"),
                schedule_intensity=data.get("schedule_intensity", "balanced"),
            )

            # Parse current schedule into ScheduleResponse
            from circadian.types import ScheduleResponse, DaySchedule, Intervention

            current_data = data["current_schedule"]
            current_schedule = ScheduleResponse(
                total_shift_hours=current_data["total_shift_hours"],
                direction=current_data["direction"],
                estimated_adaptation_days=current_data["estimated_adaptation_days"],
                origin_tz=current_data["origin_tz"],
                dest_tz=current_data["dest_tz"],
                interventions=[
                    DaySchedule(
                        day=d["day"],
                        date=d["date"],
                        timezone=d["timezone"],
                        items=[Intervention(**i) for i in d["items"]],
                        phase_type=d.get("phase_type"),
                        phase_start=d.get("phase_start"),
                        phase_end=d.get("phase_end"),
                        phase_spans_midnight=d.get("phase_spans_midnight"),
                        is_in_transit=d.get("is_in_transit", False),
                    )
                    for d in current_data["interventions"]
                ],
            )

            # Parse snapshots and actuals
            snapshots = parse_snapshots(data.get("snapshots", []))
            actuals = actuals_from_dict(data["actuals"])

            # Perform recalculation
            result = recalculate_from_actuals(
                request=request,
                current_schedule=current_schedule,
                snapshots=snapshots,
                actuals=actuals,
            )

            if result is None:
                self._send_json_response(
                    200,
                    {
                        "needsRecalculation": False,
                        "message": "No significant changes needed",
                    },
                )
                return

            # Convert result to JSON response
            self._send_json_response(
                200,
                {
                    "needsRecalculation": True,
                    "newSchedule": asdict(result.new_schedule),
                    "changes": result.changes,
                    "restoredFromDay": result.restored_from_day,
                },
            )

        except json.JSONDecodeError:
            self._send_json_response(400, {"error": "Invalid JSON in request body"})
        except Exception as e:
            import traceback

            traceback.print_exc()
            self._send_json_response(
                500, {"error": f"Recalculation failed: {str(e)}"}
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
