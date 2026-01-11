"""
MCP tool implementations for jet lag optimization.

Provides two tools:
1. calculate_phase_shift - Quick timezone shift calculation (Python version for testing)
2. get_adaptation_plan - Full schedule generation with summary
"""

import math
from dataclasses import asdict
from datetime import datetime
from typing import Any, Literal

from circadian.circadian_math import calculate_timezone_shift, parse_iso_datetime
from circadian.scheduler_v2 import ScheduleGeneratorV2
from circadian.types import ScheduleRequest, TripLeg


def classify_difficulty(
    shift_hours: float, direction: Literal["advance", "delay"]
) -> Literal["easy", "moderate", "hard"]:
    """
    Classify trip difficulty based on shift magnitude and direction.

    Direction-aware thresholds:
    - Advances (harder): 0-2h easy, 3-5h moderate, 6+h hard
    - Delays (easier): 0-3h easy, 4-6h moderate, 7+h hard
    """
    abs_shift = abs(shift_hours)

    if direction == "advance":
        if abs_shift <= 2:
            return "easy"
        elif abs_shift <= 5:
            return "moderate"
        else:
            return "hard"
    else:  # delay
        if abs_shift <= 3:
            return "easy"
        elif abs_shift <= 6:
            return "moderate"
        else:
            return "hard"


def estimate_adaptation_days(
    shift_hours: float,
    direction: Literal["advance", "delay"],
    with_interventions: bool,
) -> int:
    """
    Estimate days needed for full adaptation.

    Uses direction-specific rates:
    - With interventions: advance ~1.5h/day, delay ~2.0h/day
    - Without interventions: advance ~1.0h/day, delay ~1.5h/day
    """
    abs_shift = abs(shift_hours)

    if abs_shift == 0:
        return 0

    if with_interventions:
        rate = 1.5 if direction == "advance" else 2.0
    else:
        rate = 1.0 if direction == "advance" else 1.5

    return math.ceil(abs_shift / rate)


def generate_explanation(
    raw_shift: float,
    raw_direction: Literal["advance", "delay"],
    optimal_shift: float,
    optimal_direction: Literal["advance", "delay"],
) -> str:
    """Generate human-readable explanation of the shift optimization."""
    abs_raw = abs(raw_shift)
    abs_optimal = abs(optimal_shift)

    # Same direction - direct route
    if abs(raw_shift - optimal_shift) < 0.1:
        return (
            f"Your circadian clock needs to {optimal_direction} by "
            f"{abs_optimal:.0f} hours. This is the direct route."
        )

    # Different direction - going around the world
    easier = (
        "Delays are physiologically easier"
        if optimal_direction == "delay"
        else "Advances are more direct"
    )
    direction_word = "westward" if optimal_direction == "delay" else "eastward"

    return (
        f"A {abs_raw:.0f}-hour {raw_direction} equals a "
        f"{abs_optimal:.0f}-hour {optimal_direction}. {easier}, so the plan "
        f"will shift your clock {direction_word}."
    )


def generate_key_advice(
    direction: Literal["advance", "delay"],
    shift_hours: float,
    prep_days: int,
    uses_melatonin: bool,
    uses_caffeine: bool,
) -> str:
    """Generate template-based key advice for the schedule summary."""
    abs_shift = abs(shift_hours)

    # Build intervention list
    interventions: list[str] = []

    if direction == "delay":
        base = f"Shift your schedule {abs_shift:.0f} hours later over {prep_days} days."
        if uses_melatonin:
            interventions.append("evening melatonin")
        interventions.append("morning light exposure")
        if uses_caffeine:
            interventions.append("strategic caffeine")
    else:  # advance
        base = f"Shift your schedule {abs_shift:.0f} hours earlier over {prep_days} days."
        if uses_melatonin:
            interventions.append("afternoon melatonin")
        interventions.append("evening light exposure")
        if uses_caffeine:
            interventions.append("strategic caffeine")

    if interventions:
        return f"{base} Use {', '.join(interventions)} to accelerate adaptation."
    return base


def calculate_phase_shift_py(
    origin_timezone: str,
    destination_timezone: str,
    travel_date: str | None = None,
) -> dict[str, Any]:
    """
    Calculate timezone shift and adaptation difficulty.

    This is the Python version used for testing parity with the TypeScript
    implementation. The MCP endpoint uses the TypeScript version for performance.
    """
    ref_date = parse_iso_datetime(travel_date) if travel_date else datetime.now()

    shift_hours, direction = calculate_timezone_shift(
        origin_timezone, destination_timezone, ref_date
    )

    # The Python calculate_timezone_shift already optimizes direction
    optimal_shift = shift_hours
    optimal_direction = direction

    # Calculate raw shift (before optimization)
    # This is just for parity - the Python function already returns optimal
    raw_shift = shift_hours
    raw_direction = direction

    difficulty = classify_difficulty(optimal_shift, optimal_direction)
    with_interventions = estimate_adaptation_days(optimal_shift, optimal_direction, True)
    without_interventions = estimate_adaptation_days(optimal_shift, optimal_direction, False)
    explanation = generate_explanation(raw_shift, raw_direction, optimal_shift, optimal_direction)

    return {
        "raw_shift_hours": abs(raw_shift),
        "raw_direction": raw_direction,
        "optimal_shift_hours": abs(optimal_shift),
        "optimal_direction": optimal_direction,
        "difficulty": difficulty,
        "estimated_days": {
            "with_interventions": with_interventions,
            "without_interventions": without_interventions,
        },
        "explanation": explanation,
    }


def get_adaptation_plan(params: dict[str, Any]) -> dict[str, Any]:
    """
    Generate full adaptation plan with summary.

    Takes MCP input format and returns schedule with added summary block.
    """
    # Extract interventions with defaults
    interventions = params.get("interventions", {})
    uses_melatonin = interventions.get("melatonin", True)
    uses_caffeine = interventions.get("caffeine", True)

    # Build schedule request
    request = ScheduleRequest(
        legs=[
            TripLeg(
                origin_tz=params["origin_timezone"],
                dest_tz=params["destination_timezone"],
                departure_datetime=params["departure_datetime"],
                arrival_datetime=params["arrival_datetime"],
            )
        ],
        prep_days=params.get("prep_days", 3),
        wake_time=params.get("usual_wake_time", "07:00"),
        sleep_time=params.get("usual_sleep_time", "23:00"),
        uses_melatonin=uses_melatonin,
        uses_caffeine=uses_caffeine,
    )

    # Generate schedule
    generator = ScheduleGeneratorV2()
    response = generator.generate_schedule(request)

    # Calculate summary
    shift_hours, direction = calculate_timezone_shift(
        params["origin_timezone"],
        params["destination_timezone"],
    )

    # Count days by type
    prep_days_count = sum(1 for d in response.interventions if d.day < 0)
    post_arrival_days = sum(1 for d in response.interventions if d.day >= 0)
    total_days = len(response.interventions)

    # Generate key advice
    key_advice = generate_key_advice(
        direction,
        shift_hours,
        prep_days_count,
        uses_melatonin,
        uses_caffeine,
    )

    # Build summary
    summary = {
        "total_days": total_days,
        "prep_days": prep_days_count,
        "post_arrival_days": post_arrival_days,
        "shift_direction": direction,
        "shift_hours": abs(shift_hours),
        "key_advice": key_advice,
    }

    # Convert interventions to dicts
    days = [asdict(day) for day in response.interventions]

    return {
        "summary": summary,
        "days": days,
    }


def invoke_tool(tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """Router function for CLI/subprocess invocation."""
    if tool_name == "calculate_phase_shift":
        return calculate_phase_shift_py(**arguments)
    elif tool_name == "get_adaptation_plan":
        return get_adaptation_plan(arguments)
    else:
        raise ValueError(f"Unknown tool: {tool_name}")
