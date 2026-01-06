"""
Test helper functions for circadian schedule validation.

These functions can be imported by test modules for schedule analysis.
"""

from typing import List, Optional

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from circadian.types import ScheduleResponse, Intervention
from circadian.circadian_math import (
    estimate_cbtmin_from_wake,
    estimate_dlmo_from_sleep,
    parse_time,
    time_to_minutes,
    format_time,
)


def time_diff_hours(time1: str, time2: str) -> float:
    """
    Calculate hours between two HH:MM times.

    Returns the difference (time2 - time1) in hours.
    Handles midnight crossing correctly.

    Args:
        time1: First time in "HH:MM" format
        time2: Second time in "HH:MM" format

    Returns:
        Hours between times (positive if time2 is after time1)
    """
    t1_minutes = time_to_minutes(parse_time(time1))
    t2_minutes = time_to_minutes(parse_time(time2))

    diff_minutes = t2_minutes - t1_minutes

    # Handle midnight crossing (if diff is large negative, time2 is next day)
    if diff_minutes < -12 * 60:  # More than 12h negative
        diff_minutes += 24 * 60
    elif diff_minutes > 12 * 60:  # More than 12h positive
        diff_minutes -= 24 * 60

    return diff_minutes / 60


def get_interventions_by_type(
    schedule: ScheduleResponse,
    intervention_type: str,
    day: Optional[int] = None
) -> List[Intervention]:
    """
    Extract all interventions of a specific type from a schedule.

    Args:
        schedule: ScheduleResponse from generator
        intervention_type: Type to filter (e.g., "light_seek", "melatonin")
        day: Optional day filter (e.g., 0 for flight day, -1 for day before)

    Returns:
        List of matching Intervention objects
    """
    results = []
    for day_schedule in schedule.interventions:
        if day is not None and day_schedule.day != day:
            continue
        for item in day_schedule.items:
            if item.type == intervention_type:
                results.append(item)
    return results


def get_interventions_for_day(
    schedule: ScheduleResponse,
    day: int
) -> List[Intervention]:
    """
    Get all interventions for a specific day.

    Args:
        schedule: ScheduleResponse from generator
        day: Day number (e.g., -2, -1, 0, 1, 2)

    Returns:
        List of Intervention objects for that day
    """
    for day_schedule in schedule.interventions:
        if day_schedule.day == day:
            return day_schedule.items
    return []


def estimate_cbtmin_time(wake_time: str) -> str:
    """
    Estimate CBT_min time from wake time.

    CBT_min is ~2.5 hours before wake time.

    Args:
        wake_time: Wake time in "HH:MM" format

    Returns:
        Estimated CBT_min in "HH:MM" format
    """
    cbtmin = estimate_cbtmin_from_wake(wake_time)
    return format_time(cbtmin)


def estimate_dlmo_time(sleep_time: str) -> str:
    """
    Estimate DLMO time from sleep time.

    DLMO is ~2 hours before sleep time.

    Args:
        sleep_time: Sleep time in "HH:MM" format

    Returns:
        Estimated DLMO in "HH:MM" format
    """
    dlmo = estimate_dlmo_from_sleep(sleep_time)
    return format_time(dlmo)
