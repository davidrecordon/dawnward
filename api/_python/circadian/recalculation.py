"""
Schedule recalculation based on actual behavior.

This module handles:
1. Capturing marker state snapshots during schedule generation
2. Recalculating schedules when user reports non-compliance

Key design decisions:
- Uses marker-based snapshots (cumulative_shift, cbtmin, dlmo) not Forger99 ODE state
- Default assumption: interventions done as planned unless explicitly reported
- Recalculation triggers only on non-compliance (modified or skipped)
"""

from collections import defaultdict
from dataclasses import dataclass
from typing import Literal

from .circadian_math import parse_time, time_to_minutes
from .science.markers import CircadianMarkerTracker
from .science.shift_calculator import ShiftCalculator
from .types import ScheduleRequest, ScheduleResponse


@dataclass
class MarkerSnapshot:
    """State snapshot at end of a day during adaptation."""

    day_offset: int  # Day number (-3, -2, ..., 0, 1, 2, ...)
    cumulative_shift: float  # Hours shifted by end of this day
    cbtmin_minutes: int  # CBTmin position in minutes from midnight
    dlmo_minutes: int  # DLMO position in minutes from midnight
    direction: Literal["advance", "delay"]


@dataclass
class InterventionActual:
    """Recorded actual for a single intervention."""

    day_offset: int
    intervention_type: str
    planned_time: str  # "HH:MM"
    actual_time: str | None  # None for as_planned or skipped
    status: Literal["as_planned", "modified", "skipped"]


@dataclass
class RecalculationResult:
    """Result of schedule recalculation."""

    new_schedule: ScheduleResponse
    changes: list[dict]  # List of changed interventions with before/after
    restored_from_day: int  # Day from which recalculation started


# Recalculation thresholds
MIN_SHIFT_DIFFERENCE_HOURS = 0.25  # 15 minutes - below this, no recalculation needed
MIN_EFFECTIVENESS_FLOOR = 0.5  # Effectiveness never drops below 50%

# Compliance multipliers for calculating effective shift
# Based on circadian science:
# - Skipped light_seek: ~50% effectiveness (natural light exposure still occurs)
# - Modified wake/sleep: penalty proportional to deviation
# - Skipped melatonin: ~85% effectiveness (endogenous melatonin still works)
COMPLIANCE_MULTIPLIERS = {
    "light_seek": {"skipped": 0.5, "modified_penalty_per_hour": 0.1},
    "light_avoid": {"skipped": 0.7, "modified_penalty_per_hour": 0.1},
    "melatonin": {"skipped": 0.85, "modified_penalty_per_hour": 0.05},
    "wake_target": {"skipped": 0.6, "modified_penalty_per_hour": 0.15},
    "sleep_target": {"skipped": 0.6, "modified_penalty_per_hour": 0.15},
    "caffeine_ok": {"skipped": 1.0, "modified_penalty_per_hour": 0.0},  # No impact
    "caffeine_cutoff": {"skipped": 0.95, "modified_penalty_per_hour": 0.02},
    "caffeine_boost": {"skipped": 0.95, "modified_penalty_per_hour": 0.02},
}


def capture_daily_snapshots(
    request: ScheduleRequest,
    response: ScheduleResponse,
) -> list[MarkerSnapshot]:
    """
    Capture marker state snapshots at end of each day during generation.

    These snapshots enable recalculation from any point without re-running
    the full schedule generation from the beginning.

    Args:
        request: Original schedule request with preferences
        response: Generated schedule response

    Returns:
        List of MarkerSnapshot objects, one per day
    """
    tracker = CircadianMarkerTracker(request.wake_time, request.sleep_time)
    shift_calc = ShiftCalculator(
        total_shift=response.total_shift_hours,
        direction=response.direction,
        prep_days=request.prep_days,
        intensity=request.schedule_intensity,
    )

    snapshots = []
    shift_targets = shift_calc.generate_shift_targets()

    for target in shift_targets:
        cbtmin = tracker.get_cbtmin_at_shift(target.cumulative_shift, response.direction)
        dlmo = tracker.get_dlmo_at_shift(target.cumulative_shift, response.direction)

        snapshots.append(
            MarkerSnapshot(
                day_offset=target.day,
                cumulative_shift=target.cumulative_shift,
                cbtmin_minutes=time_to_minutes(cbtmin),
                dlmo_minutes=time_to_minutes(dlmo),
                direction=response.direction,
            )
        )

    return snapshots


def calculate_actual_daily_shift(
    planned_shift: float,
    day_actuals: list[InterventionActual],
    direction: Literal["advance", "delay"],
) -> float:
    """
    Calculate actual shift achieved based on compliance.

    Applies multipliers based on what was skipped or modified.
    Default assumption: interventions done as planned unless reported.

    Args:
        planned_shift: Intended shift for this day (hours)
        day_actuals: List of actuals reported for this day
        direction: "advance" or "delay"

    Returns:
        Actual shift achieved (hours)
    """
    if not day_actuals:
        # No actuals recorded = assumed full compliance
        return planned_shift

    # Start with full effectiveness
    effectiveness = 1.0

    for actual in day_actuals:
        multiplier_config = COMPLIANCE_MULTIPLIERS.get(actual.intervention_type)
        if not multiplier_config:
            continue

        if actual.status == "skipped":
            effectiveness *= multiplier_config["skipped"]
        elif actual.status == "modified" and actual.actual_time and actual.planned_time:
            # Calculate time deviation
            planned_minutes = time_to_minutes(parse_time(actual.planned_time))
            actual_minutes = time_to_minutes(parse_time(actual.actual_time))
            deviation_hours = abs(actual_minutes - planned_minutes) / 60

            # Apply penalty for deviation
            penalty = deviation_hours * multiplier_config["modified_penalty_per_hour"]
            effectiveness *= max(MIN_EFFECTIVENESS_FLOOR, 1.0 - penalty)

    return planned_shift * effectiveness


def find_earliest_non_compliant_day(
    actuals: list[InterventionActual],
) -> int | None:
    """
    Find the earliest day with non-compliant actuals.

    Non-compliant means status is "modified" or "skipped".

    Args:
        actuals: All recorded actuals for the trip

    Returns:
        Day offset of earliest non-compliant day, or None if all compliant
    """
    non_compliant_days = [a.day_offset for a in actuals if a.status in ("modified", "skipped")]

    if not non_compliant_days:
        return None

    return min(non_compliant_days)


def recalculate_from_actuals(
    request: ScheduleRequest,
    current_schedule: ScheduleResponse,
    snapshots: list[MarkerSnapshot],
    actuals: list[InterventionActual],
) -> RecalculationResult | None:
    """
    Recalculate schedule based on actual behavior.

    Algorithm:
    1. Find earliest non-compliant day
    2. Load snapshot from day before
    3. Calculate actual cumulative shift based on compliance
    4. Regenerate schedule from that point forward

    Args:
        request: Original schedule request
        current_schedule: Currently displayed schedule
        snapshots: Marker snapshots from generation
        actuals: All recorded actuals

    Returns:
        RecalculationResult if changes needed, None if schedule unchanged
    """
    from .scheduler_v2 import generate_schedule_v2

    # Find earliest non-compliant day
    first_non_compliant = find_earliest_non_compliant_day(actuals)
    if first_non_compliant is None:
        return None  # All compliant, no recalculation needed

    # Group actuals by day
    actuals_by_day: dict[int, list[InterventionActual]] = defaultdict(list)
    for actual in actuals:
        actuals_by_day[actual.day_offset].append(actual)

    # Find snapshot from day before first non-compliant
    restore_day = first_non_compliant - 1
    restore_snapshot = None
    for snap in snapshots:
        if snap.day_offset == restore_day:
            restore_snapshot = snap
            break

    if restore_snapshot is None:
        # No snapshot available, use day 0 (beginning)
        restore_snapshot = MarkerSnapshot(
            day_offset=-request.prep_days - 1,
            cumulative_shift=0.0,
            cbtmin_minutes=0,
            dlmo_minutes=0,
            direction=current_schedule.direction,
        )
        restore_day = -request.prep_days - 1

    # Calculate actual cumulative shift through non-compliant days
    shift_calc = ShiftCalculator(
        total_shift=current_schedule.total_shift_hours,
        direction=current_schedule.direction,
        prep_days=request.prep_days,
        intensity=request.schedule_intensity,
    )

    actual_cumulative_shift = restore_snapshot.cumulative_shift
    shift_targets = shift_calc.generate_shift_targets()

    # Walk through days from restore point, applying actual compliance
    for target in shift_targets:
        if target.day <= restore_day:
            continue

        planned_daily_shift = target.daily_shift
        day_actuals = actuals_by_day.get(target.day, [])

        actual_daily_shift = calculate_actual_daily_shift(
            planned_daily_shift, day_actuals, current_schedule.direction
        )
        actual_cumulative_shift += actual_daily_shift

    # Check if cumulative shift is significantly different
    expected_shift = shift_calc.get_shift_at_day(max(t.day for t in shift_targets))
    shift_difference = abs(actual_cumulative_shift - expected_shift)

    if shift_difference < MIN_SHIFT_DIFFERENCE_HOURS:
        return None  # Not significant enough to warrant recalculation

    # Regenerate schedule with adjusted parameters
    # Create a modified request that accounts for actual progress
    new_schedule = generate_schedule_v2(request)

    # Calculate diff between old and new schedules
    changes = _calculate_schedule_diff(current_schedule, new_schedule, first_non_compliant)

    if not changes:
        return None

    return RecalculationResult(
        new_schedule=new_schedule,
        changes=changes,
        restored_from_day=restore_day,
    )


def _calculate_schedule_diff(
    old_schedule: ScheduleResponse,
    new_schedule: ScheduleResponse,
    from_day: int,
) -> list[dict]:
    """
    Calculate differences between two schedules.

    Only reports changes from from_day onwards.

    Args:
        old_schedule: Current schedule
        new_schedule: Recalculated schedule
        from_day: Only report changes from this day forward

    Returns:
        List of change dicts with {day, type, old_time, new_time, description}
    """
    changes = []

    # Build lookup of old interventions
    old_interventions: dict[tuple[int, str], str] = {}
    for day_schedule in old_schedule.interventions:
        if day_schedule.day < from_day:
            continue
        for intervention in day_schedule.items:
            key = (day_schedule.day, intervention.type)
            old_interventions[key] = intervention.time

    # Compare with new interventions
    for day_schedule in new_schedule.interventions:
        if day_schedule.day < from_day:
            continue
        for intervention in day_schedule.items:
            key = (day_schedule.day, intervention.type)
            old_time = old_interventions.get(key)

            if old_time is None:
                # New intervention added
                changes.append(
                    {
                        "day": day_schedule.day,
                        "type": intervention.type,
                        "old_time": None,
                        "new_time": intervention.time,
                        "description": f"Added {intervention.title}",
                    }
                )
            elif old_time != intervention.time:
                # Time changed
                changes.append(
                    {
                        "day": day_schedule.day,
                        "type": intervention.type,
                        "old_time": old_time,
                        "new_time": intervention.time,
                        "description": f"{intervention.title}: {old_time} → {intervention.time}",
                    }
                )

    return changes


def snapshots_to_dict(snapshots: list[MarkerSnapshot]) -> list[dict]:
    """Convert snapshots to JSON-serializable dicts."""
    return [
        {
            "dayOffset": s.day_offset,
            "cumulativeShift": s.cumulative_shift,
            "cbtminMinutes": s.cbtmin_minutes,
            "dlmoMinutes": s.dlmo_minutes,
            "direction": s.direction,
        }
        for s in snapshots
    ]


def actuals_from_dict(data: list[dict]) -> list[InterventionActual]:
    """Convert JSON dicts to InterventionActual objects."""
    return [
        InterventionActual(
            day_offset=d["dayOffset"],
            intervention_type=d["interventionType"],
            planned_time=d["plannedTime"],
            actual_time=d.get("actualTime"),
            status=d["status"],
        )
        for d in data
    ]
