"""
Test helper functions for circadian schedule validation.

These functions can be imported by test modules for schedule analysis.
"""

import sys
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from circadian.circadian_math import (
    estimate_cbtmin_from_wake,
    estimate_dlmo_from_sleep,
    format_time,
    parse_time,
    time_to_minutes,
)
from circadian.types import Intervention, ScheduleResponse


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
    schedule: ScheduleResponse, intervention_type: str, day: int | None = None
) -> list[Intervention]:
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


def get_interventions_for_day(schedule: ScheduleResponse, day: int) -> list[Intervention]:
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


# =============================================================================
# Realistic Flight Validation Helpers
# =============================================================================


@dataclass
class FlightInfo:
    """Flight departure/arrival information for validation."""

    departure_datetime: datetime  # In origin timezone
    arrival_datetime: datetime  # In destination timezone
    origin_tz: str
    dest_tz: str


@dataclass
class ValidationIssue:
    """An issue found during schedule validation."""

    severity: str  # "error" or "warning"
    category: str  # e.g., "sleep_timing", "flight_conflict"
    message: str
    day: int
    time: str


def datetime_from_schedule_day(day_num: int, time_str: str, base_date: datetime) -> datetime:
    """
    Convert a schedule day number and time to a datetime.

    Args:
        day_num: Day number from schedule (0 = flight day, -1 = day before, etc.)
        time_str: Time in "HH:MM" format
        base_date: The flight departure date (day 0)

    Returns:
        datetime object
    """
    hour, minute = map(int, time_str.split(":"))
    target_date = base_date + timedelta(days=day_num)
    return target_date.replace(hour=hour, minute=minute, second=0, microsecond=0)


def validate_sleep_not_before_flight(
    schedule: ScheduleResponse, flight: FlightInfo, min_gap_hours: float = 4.0
) -> list[ValidationIssue]:
    """
    Validate that sleep_target is not scheduled within min_gap_hours before departure.

    A sleep_target right before a flight is problematic because:
    - Users need time to wake up, get ready, and travel to airport
    - Sleep_target implies a full night's sleep, not a nap

    Note: On Flight Day (day 0), sleep_target is an informational target showing
    the ideal shifted schedule. It's shown to help users understand their
    circadian target, even if not achievable due to travel. This is downgraded
    to a warning rather than an error.

    Args:
        schedule: The generated schedule
        flight: Flight information
        min_gap_hours: Minimum hours before departure that sleep is problematic

    Returns:
        List of validation issues found
    """
    issues = []
    base_date = flight.departure_datetime.replace(hour=0, minute=0, second=0, microsecond=0)

    for day_schedule in schedule.interventions:
        if day_schedule.day > 0:
            continue  # Only check pre-departure and departure day

        for item in day_schedule.items:
            if item.type != "sleep_target":
                continue

            sleep_dt = datetime_from_schedule_day(day_schedule.day, item.time, base_date)
            hours_before_flight = (flight.departure_datetime - sleep_dt).total_seconds() / 3600

            # Check if sleep is in the problematic window (0 to min_gap_hours before departure)
            if 0 < hours_before_flight <= min_gap_hours:
                # On Flight Day (day 0), sleep_target is informational, so downgrade to warning
                severity = "warning" if day_schedule.day == 0 else "error"
                issues.append(
                    ValidationIssue(
                        severity=severity,
                        category="sleep_before_flight",
                        message=f"sleep_target at {item.time} is {hours_before_flight:.1f}h before "
                        f"flight departure at {flight.departure_datetime.strftime('%H:%M')}",
                        day=day_schedule.day,
                        time=item.time,
                    )
                )

    return issues


def validate_no_activities_before_landing(
    schedule: ScheduleResponse,
    flight: FlightInfo,
) -> list[ValidationIssue]:
    """
    Validate that no activities are scheduled before the flight lands.

    On arrival day (day 1+), activities should not be scheduled before the
    plane actually lands - user can't follow recommendations while in the air.

    Note: wake_target and sleep_target are informational targets that show
    the user what their body's ideal schedule is, even if unachievable
    due to travel. These are exempt from this validation.

    Special handling for phases spanning midnight:
    When a phase spans midnight (phase_spans_midnight=True), early morning
    times (00:00-06:00) are actually on the NEXT calendar day, not before
    landing. For example, a flight landing at 19:05 with interventions at
    04:00 means 04:00 on the next day (after ~9 hours since landing).

    Args:
        schedule: The generated schedule
        flight: Flight information

    Returns:
        List of validation issues found
    """
    issues = []
    arrival_time = flight.arrival_datetime.strftime("%H:%M")
    arrival_minutes = time_to_minutes(parse_time(arrival_time))

    # Types that are informational targets (always OK to show)
    informational_targets = {"wake_target", "sleep_target"}

    # Early morning threshold - times before this are considered "next day"
    # when a phase spans midnight
    early_morning_threshold = 6 * 60  # 06:00 = 360 minutes

    # Find the first post-arrival day (usually day 1, but depends on flight timing)
    for day_schedule in schedule.interventions:
        if day_schedule.day < 1:
            continue  # Only check post-arrival days

        # For day 1, check if activities are before landing
        if day_schedule.day == 1:
            # Check if this phase spans midnight
            spans_midnight = getattr(day_schedule, "phase_spans_midnight", False) or False

            for item in day_schedule.items:
                # Skip informational targets - they show ideal schedule even if unachievable
                if item.type in informational_targets:
                    continue

                item_minutes = time_to_minutes(parse_time(item.time))

                # If phase spans midnight and time is early morning, it's actually next day
                if spans_midnight and item_minutes < early_morning_threshold:
                    # This is an early morning time on the next calendar day,
                    # not before landing. Skip validation.
                    continue

                # Check if this activity is before the flight lands
                if item_minutes < arrival_minutes:
                    issues.append(
                        ValidationIssue(
                            severity="error",
                            category="activity_before_landing",
                            message=f"{item.type} at {item.time} is before flight lands at {arrival_time}",
                            day=day_schedule.day,
                            time=item.time,
                        )
                    )

    return issues


def validate_daily_sleep_opportunity(
    schedule: ScheduleResponse, max_gap_hours: float = 24.0
) -> list[ValidationIssue]:
    """
    Validate that every 24-hour period has a sleep opportunity.

    Users need to sleep! A schedule that goes more than 24h without a
    sleep_target is potentially dangerous.

    Args:
        schedule: The generated schedule
        max_gap_hours: Maximum hours between sleep opportunities

    Returns:
        List of validation issues found
    """
    issues = []

    # Collect all sleep_targets with their day numbers
    sleep_times = []
    for day_schedule in schedule.interventions:
        for item in day_schedule.items:
            if item.type == "sleep_target":
                sleep_times.append((day_schedule.day, item.time))

    # Sort by day and time
    sleep_times.sort(key=lambda x: (x[0], x[1]))

    # Check gaps between consecutive sleep targets
    for i in range(len(sleep_times) - 1):
        day1, time1 = sleep_times[i]
        day2, time2 = sleep_times[i + 1]

        # Calculate approximate gap
        h1, m1 = map(int, time1.split(":"))
        h2, m2 = map(int, time2.split(":"))

        # Gap in hours = (day difference * 24) + (time difference)
        day_diff = day2 - day1
        time_diff_h = (h2 + m2 / 60) - (h1 + m1 / 60)

        gap_hours = day_diff * 24 + time_diff_h

        if gap_hours > max_gap_hours:
            issues.append(
                ValidationIssue(
                    severity="warning",
                    category="sleep_gap",
                    message=f"{gap_hours:.1f}h gap between sleep opportunities "
                    f"(day {day1} {time1} to day {day2} {time2})",
                    day=day1,
                    time=time1,
                )
            )

    return issues


def validate_sleep_wake_order(schedule: ScheduleResponse) -> list[ValidationIssue]:
    """
    Validate that each day has coherent sleep→wake ordering.

    Within a single day, wake_target should come before sleep_target
    (you wake up, then go to sleep). Having sleep_target before wake_target
    on the same day suggests a timezone transition issue.

    Args:
        schedule: The generated schedule

    Returns:
        List of validation issues found
    """
    issues = []

    for day_schedule in schedule.interventions:
        wake_times = []
        sleep_times = []

        for item in day_schedule.items:
            if item.type == "wake_target":
                wake_times.append(item.time)
            elif item.type == "sleep_target":
                sleep_times.append(item.time)

        # Check ordering: wake should generally come before sleep
        # Exception: very early morning sleep (before 06:00) is previous night's sleep
        for sleep_time in sleep_times:
            sleep_h = int(sleep_time.split(":")[0])

            # Early morning sleep (00:00-06:00) is from previous night
            if sleep_h < 6:
                continue

            for wake_time in wake_times:
                wake_h = int(wake_time.split(":")[0])

                # If sleep is before wake on same day (and both in normal hours)
                if sleep_h < wake_h and wake_h < 12:
                    issues.append(
                        ValidationIssue(
                            severity="warning",
                            category="sleep_wake_order",
                            message=f"sleep_target at {sleep_time} is before wake_target at {wake_time}",
                            day=day_schedule.day,
                            time=sleep_time,
                        )
                    )

    return issues


def run_all_validations(schedule: ScheduleResponse, flight: FlightInfo) -> list[ValidationIssue]:
    """
    Run all validation checks on a schedule.

    Args:
        schedule: The generated schedule
        flight: Flight information

    Returns:
        All validation issues found
    """
    issues = []
    issues.extend(validate_sleep_not_before_flight(schedule, flight))
    issues.extend(validate_no_activities_before_landing(schedule, flight))
    issues.extend(validate_daily_sleep_opportunity(schedule))
    issues.extend(validate_sleep_wake_order(schedule))
    return issues
