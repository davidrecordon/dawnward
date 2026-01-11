#!/usr/bin/env python3
"""
Regenerate schedule from JSON request file.

Usage: python3 regenerate_schedule.py <request_file.json>

This script reads a schedule request from a JSON file and outputs
the generated schedule as JSON to stdout.

Security: This script only reads from the specified JSON file and writes
to stdout. It does not accept any code or commands as input.
"""

import json
import sys
from dataclasses import asdict

# Import circadian modules (assumes api/_python is in path or script is run from there)
from circadian.scheduler_v2 import ScheduleGeneratorV2
from circadian.types import ScheduleRequest, TripLeg


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
        print(json.dumps({"error": "Usage: regenerate_schedule.py <request_file.json>"}))
        sys.exit(1)

    request_file = sys.argv[1]

    try:
        with open(request_file) as f:
            data = json.load(f)

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
            caffeine_cutoff_hours=data.get("caffeine_cutoff_hours", 8),
            light_exposure_minutes=data.get("light_exposure_minutes", 60),
        )

        generator = ScheduleGeneratorV2()
        response = generator.generate_schedule(request)

        print(json.dumps(to_dict(response)))

    except FileNotFoundError:
        print(json.dumps({"error": f"Request file not found: {request_file}"}))
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON in request file: {e}"}))
        sys.exit(1)
    except KeyError as e:
        print(json.dumps({"error": f"Missing required field: {e}"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"Schedule generation failed: {e}"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
