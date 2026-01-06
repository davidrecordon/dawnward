"""
Pytest fixtures for circadian schedule tests.
"""

import pytest
from datetime import datetime, timedelta
from typing import List, Optional

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from circadian.types import TripLeg, ScheduleRequest, ScheduleResponse, Intervention
from circadian.scheduler import ScheduleGenerator
from circadian.circadian_math import (
    estimate_cbtmin_from_wake,
    estimate_dlmo_from_sleep,
    parse_time,
    time_to_minutes,
    format_time,
)


# ============================================================================
# Helper Functions for Testing
# ============================================================================

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


@pytest.fixture
def generator():
    """ScheduleGenerator instance."""
    return ScheduleGenerator()


@pytest.fixture
def future_date():
    """A date 5 days in the future for testing."""
    return datetime.now() + timedelta(days=5)


@pytest.fixture
def westward_request(future_date):
    """SFO → Tokyo request (westward, delay direction)."""
    departure = future_date
    arrival = departure + timedelta(hours=12)

    return ScheduleRequest(
        legs=[
            TripLeg(
                origin_tz="America/Los_Angeles",
                dest_tz="Asia/Tokyo",
                departure_datetime=departure.strftime("%Y-%m-%dT10:00"),
                arrival_datetime=arrival.strftime("%Y-%m-%dT14:00")
            )
        ],
        prep_days=3,
        wake_time="07:00",
        sleep_time="23:00",
        uses_melatonin=True,
        uses_caffeine=True,
        uses_exercise=True
    )


@pytest.fixture
def eastward_request(future_date):
    """NYC → London request (eastward, advance direction)."""
    departure = future_date
    arrival = departure + timedelta(hours=7)

    return ScheduleRequest(
        legs=[
            TripLeg(
                origin_tz="America/New_York",
                dest_tz="Europe/London",
                departure_datetime=departure.strftime("%Y-%m-%dT19:00"),
                arrival_datetime=arrival.strftime("%Y-%m-%dT07:00")
            )
        ],
        prep_days=3,
        wake_time="07:00",
        sleep_time="23:00",
        uses_melatonin=True,
        uses_caffeine=True,
        uses_exercise=False
    )


@pytest.fixture
def multi_leg_request(future_date):
    """SFO → NYC → London multi-leg request."""
    leg1_departure = future_date
    leg1_arrival = leg1_departure + timedelta(hours=5)
    leg2_departure = leg1_arrival + timedelta(hours=4)
    leg2_arrival = leg2_departure + timedelta(hours=7)

    return ScheduleRequest(
        legs=[
            TripLeg(
                origin_tz="America/Los_Angeles",
                dest_tz="America/New_York",
                departure_datetime=leg1_departure.strftime("%Y-%m-%dT08:00"),
                arrival_datetime=leg1_arrival.strftime("%Y-%m-%dT16:00")
            ),
            TripLeg(
                origin_tz="America/New_York",
                dest_tz="Europe/London",
                departure_datetime=leg2_departure.strftime("%Y-%m-%dT20:00"),
                arrival_datetime=leg2_arrival.strftime("%Y-%m-%dT08:00")
            )
        ],
        prep_days=3,
        wake_time="07:00",
        sleep_time="23:00",
        uses_melatonin=True,
        uses_caffeine=True,
        uses_exercise=True
    )


@pytest.fixture
def short_notice_request():
    """Request with departure tomorrow (tests prep_days auto-adjustment)."""
    tomorrow = datetime.now() + timedelta(days=1)
    arrival = tomorrow + timedelta(hours=10)

    return ScheduleRequest(
        legs=[
            TripLeg(
                origin_tz="America/Los_Angeles",
                dest_tz="Europe/Paris",
                departure_datetime=tomorrow.strftime("%Y-%m-%dT16:00"),
                arrival_datetime=arrival.strftime("%Y-%m-%dT11:00")
            )
        ],
        prep_days=3,  # Should be auto-adjusted to 1
        wake_time="06:30",
        sleep_time="22:30",
        uses_melatonin=True,
        uses_caffeine=True,
        uses_exercise=False
    )


@pytest.fixture
def no_supplements_request(future_date):
    """Request with all optional interventions disabled."""
    departure = future_date
    arrival = departure + timedelta(hours=7)

    return ScheduleRequest(
        legs=[
            TripLeg(
                origin_tz="America/New_York",
                dest_tz="Europe/London",
                departure_datetime=departure.strftime("%Y-%m-%dT19:00"),
                arrival_datetime=arrival.strftime("%Y-%m-%dT07:00")
            )
        ],
        prep_days=3,
        wake_time="07:00",
        sleep_time="23:00",
        uses_melatonin=False,
        uses_caffeine=False,
        uses_exercise=False
    )


@pytest.fixture
def late_start_request():
    """Request generated mid-day today for flight tomorrow (tests same-day filtering).

    Simulates generating a schedule at 10 AM when the user's wake time is 06:00,
    meaning early morning interventions should be filtered out.
    """
    tomorrow = datetime.now() + timedelta(days=1)
    arrival = tomorrow + timedelta(hours=18)

    return ScheduleRequest(
        legs=[
            TripLeg(
                origin_tz="America/Los_Angeles",
                dest_tz="Asia/Singapore",
                departure_datetime=tomorrow.strftime("%Y-%m-%dT09:45"),
                arrival_datetime=arrival.strftime("%Y-%m-%dT17:45")
            )
        ],
        prep_days=3,
        wake_time="06:00",
        sleep_time="22:00",
        uses_melatonin=True,
        uses_caffeine=True,
        uses_exercise=False
    )


@pytest.fixture
def nap_flight_only_request(future_date):
    """Request with nap_preference='flight_only' (default)."""
    departure = future_date
    arrival = departure + timedelta(hours=7)

    return ScheduleRequest(
        legs=[
            TripLeg(
                origin_tz="America/New_York",
                dest_tz="Europe/London",
                departure_datetime=departure.strftime("%Y-%m-%dT19:00"),
                arrival_datetime=arrival.strftime("%Y-%m-%dT07:00")
            )
        ],
        prep_days=3,
        wake_time="07:00",
        sleep_time="23:00",
        uses_melatonin=True,
        uses_caffeine=True,
        uses_exercise=False,
        nap_preference="flight_only"
    )


@pytest.fixture
def nap_all_days_request(future_date):
    """Request with nap_preference='all_days'."""
    departure = future_date
    arrival = departure + timedelta(hours=7)

    return ScheduleRequest(
        legs=[
            TripLeg(
                origin_tz="America/New_York",
                dest_tz="Europe/London",
                departure_datetime=departure.strftime("%Y-%m-%dT19:00"),
                arrival_datetime=arrival.strftime("%Y-%m-%dT07:00")
            )
        ],
        prep_days=3,
        wake_time="07:00",
        sleep_time="23:00",
        uses_melatonin=True,
        uses_caffeine=True,
        uses_exercise=False,
        nap_preference="all_days"
    )


@pytest.fixture
def nap_disabled_request(future_date):
    """Request with nap_preference='no'."""
    departure = future_date
    arrival = departure + timedelta(hours=7)

    return ScheduleRequest(
        legs=[
            TripLeg(
                origin_tz="America/New_York",
                dest_tz="Europe/London",
                departure_datetime=departure.strftime("%Y-%m-%dT19:00"),
                arrival_datetime=arrival.strftime("%Y-%m-%dT07:00")
            )
        ],
        prep_days=3,
        wake_time="07:00",
        sleep_time="23:00",
        uses_melatonin=True,
        uses_caffeine=True,
        uses_exercise=False,
        nap_preference="no"
    )
