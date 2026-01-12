"""
Pytest fixtures for circadian schedule tests.

Uses freezegun for deterministic, date-independent testing.
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest
import time_machine

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from circadian.scheduler_v2 import ScheduleGeneratorV2
from circadian.types import ScheduleRequest, TripLeg

# Re-export helper functions for backwards compatibility
# Tests can import from either conftest or helpers
from tests.helpers import (
    estimate_cbtmin_time,
    estimate_dlmo_time,
    get_interventions_by_type,
    get_interventions_for_day,
    time_diff_hours,
)

__all__ = [
    "time_diff_hours",
    "get_interventions_by_type",
    "get_interventions_for_day",
    "estimate_cbtmin_time",
    "estimate_dlmo_time",
]

# Standard frozen time: Jan 1, 2026 at noon UTC
# This ensures tests with flight dates in Jan 2026+ work correctly
FROZEN_TIME = "2026-01-01T12:00:00"


@pytest.fixture
def frozen_time():
    """Freeze time to a consistent point for deterministic tests.

    Use this fixture in tests that have hardcoded dates and need
    consistent behavior regardless of when tests are run.
    The frozen time is Jan 1, 2026 at noon, before most test dates.

    Uses time-machine for C-level patching that catches all datetime
    calls including in third-party libraries like Arcascope.

    Usage:
        def test_something(frozen_time):
            # System time is now frozen to Jan 1, 2026
            ...
    """
    with time_machine.travel(FROZEN_TIME, tick=False):
        yield


@pytest.fixture
def generator():
    """ScheduleGeneratorV2 instance."""
    return ScheduleGeneratorV2()


@pytest.fixture
def future_date():
    """A date 5 days in the future for testing."""
    return datetime.now() + timedelta(days=5)


@pytest.fixture
def westward_request(future_date):
    """SFO -> Tokyo request (westward, delay direction)."""
    departure = future_date
    arrival = departure + timedelta(hours=12)

    return ScheduleRequest(
        legs=[
            TripLeg(
                origin_tz="America/Los_Angeles",
                dest_tz="Asia/Tokyo",
                departure_datetime=departure.strftime("%Y-%m-%dT10:00"),
                arrival_datetime=arrival.strftime("%Y-%m-%dT14:00"),
            )
        ],
        prep_days=3,
        wake_time="07:00",
        sleep_time="23:00",
        uses_melatonin=True,
        uses_caffeine=True,
        uses_exercise=True,
    )


@pytest.fixture
def eastward_request(future_date):
    """NYC -> London request (eastward, advance direction)."""
    departure = future_date
    arrival = departure + timedelta(hours=7)

    return ScheduleRequest(
        legs=[
            TripLeg(
                origin_tz="America/New_York",
                dest_tz="Europe/London",
                departure_datetime=departure.strftime("%Y-%m-%dT19:00"),
                arrival_datetime=arrival.strftime("%Y-%m-%dT07:00"),
            )
        ],
        prep_days=3,
        wake_time="07:00",
        sleep_time="23:00",
        uses_melatonin=True,
        uses_caffeine=True,
        uses_exercise=False,
    )


@pytest.fixture
def multi_leg_request(future_date):
    """SFO -> NYC -> London multi-leg request."""
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
                arrival_datetime=leg1_arrival.strftime("%Y-%m-%dT16:00"),
            ),
            TripLeg(
                origin_tz="America/New_York",
                dest_tz="Europe/London",
                departure_datetime=leg2_departure.strftime("%Y-%m-%dT20:00"),
                arrival_datetime=leg2_arrival.strftime("%Y-%m-%dT08:00"),
            ),
        ],
        prep_days=3,
        wake_time="07:00",
        sleep_time="23:00",
        uses_melatonin=True,
        uses_caffeine=True,
        uses_exercise=True,
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
                arrival_datetime=arrival.strftime("%Y-%m-%dT11:00"),
            )
        ],
        prep_days=3,  # Should be auto-adjusted to 1
        wake_time="06:30",
        sleep_time="22:30",
        uses_melatonin=True,
        uses_caffeine=True,
        uses_exercise=False,
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
                arrival_datetime=arrival.strftime("%Y-%m-%dT07:00"),
            )
        ],
        prep_days=3,
        wake_time="07:00",
        sleep_time="23:00",
        uses_melatonin=False,
        uses_caffeine=False,
        uses_exercise=False,
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
                arrival_datetime=arrival.strftime("%Y-%m-%dT17:45"),
            )
        ],
        prep_days=3,
        wake_time="06:00",
        sleep_time="22:00",
        uses_melatonin=True,
        uses_caffeine=True,
        uses_exercise=False,
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
                arrival_datetime=arrival.strftime("%Y-%m-%dT07:00"),
            )
        ],
        prep_days=3,
        wake_time="07:00",
        sleep_time="23:00",
        uses_melatonin=True,
        uses_caffeine=True,
        uses_exercise=False,
        nap_preference="flight_only",
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
                arrival_datetime=arrival.strftime("%Y-%m-%dT07:00"),
            )
        ],
        prep_days=3,
        wake_time="07:00",
        sleep_time="23:00",
        uses_melatonin=True,
        uses_caffeine=True,
        uses_exercise=False,
        nap_preference="all_days",
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
                arrival_datetime=arrival.strftime("%Y-%m-%dT07:00"),
            )
        ],
        prep_days=3,
        wake_time="07:00",
        sleep_time="23:00",
        uses_melatonin=True,
        uses_caffeine=True,
        uses_exercise=False,
        nap_preference="no",
    )
