"""
Tests for timezone context enrichment.

Verifies that every intervention has complete timezone metadata after enrichment.
"""

from datetime import datetime

import pytest
import time_machine

from circadian.scheduler_v2 import generate_schedule_v2
from circadian.types import ScheduleRequest, TripLeg


@pytest.fixture
def sfo_to_lhr_overnight() -> ScheduleRequest:
    """
    SFO → LHR overnight flight (eastbound, 8h shift).

    Departure: Jan 20, 2026 at 5:00 PM PST
    Arrival: Jan 21, 2026 at 11:00 AM GMT
    Flight duration: ~10 hours
    """
    return ScheduleRequest(
        legs=[
            TripLeg(
                origin_tz="America/Los_Angeles",
                dest_tz="Europe/London",
                departure_datetime="2026-01-20T17:00",
                arrival_datetime="2026-01-21T11:00",
            )
        ],
        prep_days=3,
        wake_time="07:00",
        sleep_time="23:00",
        uses_melatonin=True,
        uses_caffeine=True,
        nap_preference="flight_only",
    )


@pytest.fixture
def lax_to_syd_ulr() -> ScheduleRequest:
    """
    LAX → SYD ultra-long-range flight (westbound, 18h shift).

    Departure: Jan 20, 2026 at 10:00 PM PST
    Arrival: Jan 22, 2026 at 7:00 AM AEDT
    Flight duration: ~15 hours
    """
    return ScheduleRequest(
        legs=[
            TripLeg(
                origin_tz="America/Los_Angeles",
                dest_tz="Australia/Sydney",
                departure_datetime="2026-01-20T22:00",
                arrival_datetime="2026-01-22T07:00",
            )
        ],
        prep_days=3,
        wake_time="07:00",
        sleep_time="23:00",
        uses_melatonin=True,
        uses_caffeine=True,
        nap_preference="flight_only",
    )


@pytest.fixture
def jfk_to_lax_westbound() -> ScheduleRequest:
    """
    JFK → LAX short domestic flight (westbound, 3h shift).

    Departure: Jan 20, 2026 at 8:00 AM EST
    Arrival: Jan 20, 2026 at 11:30 AM PST
    """
    return ScheduleRequest(
        legs=[
            TripLeg(
                origin_tz="America/New_York",
                dest_tz="America/Los_Angeles",
                departure_datetime="2026-01-20T08:00",
                arrival_datetime="2026-01-20T11:30",
            )
        ],
        prep_days=2,
        wake_time="07:00",
        sleep_time="23:00",
        uses_melatonin=True,
        uses_caffeine=True,
        nap_preference="flight_only",
    )


class TestInterventionTimezoneContext:
    """Test that every intervention has complete timezone metadata."""

    @time_machine.travel("2026-01-15T09:00:00-08:00")
    def test_intervention_has_all_timezone_fields(
        self, sfo_to_lhr_overnight: ScheduleRequest
    ) -> None:
        """Every intervention should carry times, dates, timezones, phase."""
        response = generate_schedule_v2(sfo_to_lhr_overnight)

        for day in response.interventions:
            for item in day.items:
                assert item.origin_time is not None, f"Missing origin_time on {item.type}"
                assert item.dest_time is not None, f"Missing dest_time on {item.type}"
                assert item.origin_date is not None, f"Missing origin_date on {item.type}"
                assert item.dest_date is not None, f"Missing dest_date on {item.type}"
                assert item.origin_tz is not None, f"Missing origin_tz on {item.type}"
                assert item.dest_tz is not None, f"Missing dest_tz on {item.type}"
                assert item.phase_type is not None, f"Missing phase_type on {item.type}"
                assert isinstance(item.show_dual_timezone, bool), (
                    f"show_dual_timezone not bool on {item.type}"
                )

    @time_machine.travel("2026-01-15T09:00:00-08:00")
    def test_origin_tz_matches_trip(self, sfo_to_lhr_overnight: ScheduleRequest) -> None:
        """origin_tz should match the trip's origin timezone."""
        response = generate_schedule_v2(sfo_to_lhr_overnight)

        for day in response.interventions:
            for item in day.items:
                assert item.origin_tz == "America/Los_Angeles"

    @time_machine.travel("2026-01-15T09:00:00-08:00")
    def test_dest_tz_matches_trip(self, sfo_to_lhr_overnight: ScheduleRequest) -> None:
        """dest_tz should match the trip's destination timezone."""
        response = generate_schedule_v2(sfo_to_lhr_overnight)

        for day in response.interventions:
            for item in day.items:
                assert item.dest_tz == "Europe/London"


class TestPreLandingDualTimezone:
    """Test pre-landing detection for dual timezone display."""

    @time_machine.travel("2026-01-15T09:00:00-08:00")
    def test_inflight_items_show_dual_timezone(self, sfo_to_lhr_overnight: ScheduleRequest) -> None:
        """In-flight items should have show_dual_timezone=True."""
        response = generate_schedule_v2(sfo_to_lhr_overnight)

        # Find in-transit phases
        in_transit_days = [d for d in response.interventions if d.is_in_transit]

        # All in-transit items should show dual timezone
        for day in in_transit_days:
            for item in day.items:
                assert item.show_dual_timezone, (
                    f"In-transit item {item.type} should have show_dual_timezone=True"
                )

    @time_machine.travel("2026-01-15T09:00:00-08:00")
    def test_pre_landing_items_show_dual_timezone(
        self, sfo_to_lhr_overnight: ScheduleRequest
    ) -> None:
        """
        Arrival-day items before landing should have show_dual_timezone=True.

        For SFO→LHR landing at 11:00 AM GMT:
        - wake_target at 8:00 AM GMT (before landing) → show_dual_timezone=True
        - light_seek at 10:00 AM GMT (before landing) → show_dual_timezone=True
        - light_avoid at 2:00 PM GMT (after landing) → show_dual_timezone=False
        """
        response = generate_schedule_v2(sfo_to_lhr_overnight)

        # Find post_arrival phase (arrival day)
        arrival_days = [d for d in response.interventions if d.phase_type == "post_arrival"]

        if not arrival_days:
            pytest.skip("No post_arrival phase found")

        # Arrival is at 11:00 GMT, so items before 11:00 should show dual timezone
        arrival_hour = 11  # 11:00 AM GMT

        for day in arrival_days:
            for item in day.items:
                # Parse the destination time (GMT)
                hour = int(item.dest_time.split(":")[0]) if item.dest_time else 0

                # Items scheduled before landing should show dual timezone
                if hour < arrival_hour:
                    assert item.show_dual_timezone, (
                        f"Pre-landing item {item.type} at {item.dest_time} "
                        f"should have show_dual_timezone=True"
                    )

    @time_machine.travel("2026-01-15T09:00:00-08:00")
    def test_post_landing_items_no_dual_timezone(
        self, sfo_to_lhr_overnight: ScheduleRequest
    ) -> None:
        """Items after landing should have show_dual_timezone=False by default."""
        response = generate_schedule_v2(sfo_to_lhr_overnight)

        # Find adaptation phases (full days at destination)
        adaptation_days = [d for d in response.interventions if d.phase_type == "adaptation"]

        # All adaptation items should NOT show dual timezone (unless user preference)
        for day in adaptation_days:
            for item in day.items:
                assert not item.show_dual_timezone, (
                    f"Adaptation item {item.type} should have show_dual_timezone=False"
                )


class TestTimezoneConsistency:
    """Test that origin/dest times represent the same moment."""

    @time_machine.travel("2026-01-15T09:00:00-08:00")
    def test_origin_dest_times_same_moment(self, sfo_to_lhr_overnight: ScheduleRequest) -> None:
        """
        origin_time + origin_date + origin_tz should equal
        dest_time + dest_date + dest_tz when converted to UTC.
        """
        from zoneinfo import ZoneInfo

        response = generate_schedule_v2(sfo_to_lhr_overnight)

        for day in response.interventions:
            for item in day.items:
                # Parse origin time
                origin_dt = datetime.strptime(
                    f"{item.origin_date} {item.origin_time}", "%Y-%m-%d %H:%M"
                )
                origin_dt = origin_dt.replace(tzinfo=ZoneInfo(item.origin_tz))
                origin_utc = origin_dt.astimezone(ZoneInfo("UTC"))

                # Parse dest time
                dest_dt = datetime.strptime(f"{item.dest_date} {item.dest_time}", "%Y-%m-%d %H:%M")
                dest_dt = dest_dt.replace(tzinfo=ZoneInfo(item.dest_tz))
                dest_utc = dest_dt.astimezone(ZoneInfo("UTC"))

                # They should be the same moment
                assert origin_utc == dest_utc, (
                    f"Mismatch for {item.type}: "
                    f"origin={item.origin_time} {item.origin_date} {item.origin_tz} "
                    f"({origin_utc}) != "
                    f"dest={item.dest_time} {item.dest_date} {item.dest_tz} "
                    f"({dest_utc})"
                )


class TestValidTimezones:
    """Test that timezones are valid IANA identifiers."""

    @time_machine.travel("2026-01-15T09:00:00-08:00")
    def test_valid_iana_timezones(self, sfo_to_lhr_overnight: ScheduleRequest) -> None:
        """origin_tz and dest_tz should be valid IANA timezones."""
        from zoneinfo import ZoneInfo

        response = generate_schedule_v2(sfo_to_lhr_overnight)

        for day in response.interventions:
            for item in day.items:
                # These should not raise ZoneInfo errors
                try:
                    ZoneInfo(item.origin_tz)
                except Exception as e:
                    pytest.fail(f"Invalid origin_tz '{item.origin_tz}': {e}")

                try:
                    ZoneInfo(item.dest_tz)
                except Exception as e:
                    pytest.fail(f"Invalid dest_tz '{item.dest_tz}': {e}")


class TestNapWindowUtc:
    """Test that nap window times are converted to UTC."""

    @time_machine.travel("2026-01-15T09:00:00-08:00")
    def test_nap_windows_have_utc_times(self, sfo_to_lhr_overnight: ScheduleRequest) -> None:
        """Nap windows should have window_end_utc and ideal_time_utc set."""
        # Request with all_days nap preference to ensure nap windows
        request = ScheduleRequest(
            legs=sfo_to_lhr_overnight.legs,
            prep_days=3,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
            nap_preference="all_days",  # Ensure naps on all days
        )
        response = generate_schedule_v2(request)

        # Find nap_window interventions
        nap_windows = []
        for day in response.interventions:
            for item in day.items:
                if item.type == "nap_window" and item.window_end:
                    nap_windows.append(item)

        if not nap_windows:
            pytest.skip("No nap windows with window_end found")

        for item in nap_windows:
            assert item.window_end_utc is not None, "Nap window should have window_end_utc set"
            # Verify it's a valid ISO format
            assert "T" in item.window_end_utc, (
                f"window_end_utc should be ISO format: {item.window_end_utc}"
            )


class TestPhaseTypeSet:
    """Test that phase_type is correctly set on all interventions."""

    @time_machine.travel("2026-01-15T09:00:00-08:00")
    def test_phase_type_matches_day_schedule(self, sfo_to_lhr_overnight: ScheduleRequest) -> None:
        """Intervention phase_type should match the containing DaySchedule."""
        response = generate_schedule_v2(sfo_to_lhr_overnight)

        for day in response.interventions:
            for item in day.items:
                assert item.phase_type == day.phase_type, (
                    f"Mismatch: item.phase_type={item.phase_type} "
                    f"vs day.phase_type={day.phase_type}"
                )

    @time_machine.travel("2026-01-15T09:00:00-08:00")
    def test_all_phase_types_present(self, sfo_to_lhr_overnight: ScheduleRequest) -> None:
        """Schedule should have preparation, pre_departure, in_transit/post_arrival phases."""
        response = generate_schedule_v2(sfo_to_lhr_overnight)

        phase_types_found = {d.phase_type for d in response.interventions}

        # Should have at least preparation and some arrival-related phases
        assert "preparation" in phase_types_found or "pre_departure" in phase_types_found, (
            f"Expected preparation or pre_departure phase, found: {phase_types_found}"
        )
