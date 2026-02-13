#!/usr/bin/env python3
"""
Recalculate schedule based on recorded actuals.

Usage: python3 recalculate_schedule.py <request_file.json>

This script reads recalculation parameters from a JSON file and outputs
the recalculation result as JSON to stdout.

Security: This script only reads from the specified JSON file and writes
to stdout. It does not accept any code or commands as input.
"""

import json
import sys
from dataclasses import asdict

from circadian.recalculation import (
    MarkerSnapshot,
    actuals_from_dict,
    recalculate_from_actuals,
)
from circadian.types import ScheduleRequest, ScheduleResponse, TripLeg


def schedule_response_from_dict(data: dict) -> ScheduleResponse:
    """Convert a dict back to a ScheduleResponse object."""
    from circadian.types import DaySchedule, Intervention

    interventions = []
    for day_data in data.get("interventions", []):
        items = [
            Intervention(
                type=item["type"],
                time=item["time"],
                title=item["title"],
                description=item["description"],
                duration_min=item.get("duration_minutes") or item.get("duration_min"),
                window_end=item.get("end_time") or item.get("window_end"),
                summary=item.get("summary"),
            )
            for item in day_data.get("items", [])
        ]
        interventions.append(
            DaySchedule(
                day=day_data["day"],
                date=day_data["date"],
                timezone=day_data["timezone"],
                items=items,
                # PhaseType is a Literal type alias, not an Enum - just pass the string
                phase_type=day_data.get("phase_type"),
                is_in_transit=day_data.get("is_in_transit", False),
            )
        )

    return ScheduleResponse(
        total_shift_hours=data["total_shift_hours"],
        direction=data["direction"],
        estimated_adaptation_days=data["estimated_adaptation_days"],
        origin_tz=data["origin_tz"],
        dest_tz=data["dest_tz"],
        interventions=interventions,
        # Note: route_label is added by frontend, not part of ScheduleResponse
    )


def to_dict(obj: object) -> object:
    """Convert dataclass instances to dicts recursively."""
    if hasattr(obj, "__dataclass_fields__"):
        return {k: to_dict(v) for k, v in asdict(obj).items()}
    elif isinstance(obj, list):
        return [to_dict(item) for item in obj]
    else:
        return obj


def main() -> None:
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: recalculate_schedule.py <request_file.json>"}))
        sys.exit(1)

    request_file = sys.argv[1]

    try:
        with open(request_file) as f:
            data = json.load(f)

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
            uses_melatonin=data["uses_melatonin"],
            uses_caffeine=data["uses_caffeine"],
            uses_exercise=data["uses_exercise"],
            nap_preference=data.get("nap_preference", "flight_only"),
            schedule_intensity=data.get("schedule_intensity", "balanced"),
        )

        # Parse current schedule
        current_schedule = schedule_response_from_dict(data["current_schedule"])

        # Parse snapshots
        snapshots = [
            MarkerSnapshot(
                day_offset=s["dayOffset"],
                cumulative_shift=s["cumulativeShift"],
                cbtmin_minutes=s["cbtminMinutes"],
                dlmo_minutes=s["dlmoMinutes"],
                direction=s["direction"],
            )
            for s in data.get("snapshots", [])
        ]

        # Parse actuals
        actuals = actuals_from_dict(data.get("actuals", []))

        # Perform recalculation
        result = recalculate_from_actuals(request, current_schedule, snapshots, actuals)

        if result is None:
            print(
                json.dumps(
                    {
                        "needsRecalculation": False,
                        "message": "Schedule changes are not significant enough",
                    }
                )
            )
        else:
            print(
                json.dumps(
                    {
                        "needsRecalculation": True,
                        "newSchedule": to_dict(result.new_schedule),
                        "changes": result.changes,
                        "restoredFromDay": result.restored_from_day,
                    }
                )
            )

    except FileNotFoundError:
        print(json.dumps({"error": f"Request file not found: {request_file}"}))
        # Exit 0 so route.ts can parse the JSON error
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON in request file: {e}"}))
    except KeyError as e:
        print(json.dumps({"error": f"Missing required field: {e}"}))
    except Exception as e:
        import traceback

        print(
            json.dumps({"error": f"Recalculation failed: {e}", "traceback": traceback.format_exc()})
        )


if __name__ == "__main__":
    main()
