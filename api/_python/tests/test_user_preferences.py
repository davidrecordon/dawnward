"""
Tests for user-configurable preference settings.

Verifies that caffeine_cutoff_hours and light_exposure_minutes
actually affect the generated schedule interventions.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent))

from helpers import get_interventions_by_type

from circadian.scheduler_v2 import ScheduleGeneratorV2 as ScheduleGenerator
from circadian.types import ScheduleRequest, TripLeg


class TestCaffeineCutoffHours:
    """Tests that caffeine_cutoff_hours affects caffeine_cutoff intervention timing."""

    def _create_request(self, caffeine_cutoff_hours: int) -> ScheduleRequest:
        """Create a standard westbound request with specified caffeine cutoff."""
        return ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/New_York",
                    dest_tz="America/Los_Angeles",
                    departure_datetime="2026-01-15T18:00",
                    arrival_datetime="2026-01-15T21:00",
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
            caffeine_cutoff_hours=caffeine_cutoff_hours,
        )

    def test_cutoff_6h_before_sleep(self):
        """6-hour cutoff with 23:00 sleep should give 17:00 cutoff."""
        generator = ScheduleGenerator()
        request = self._create_request(caffeine_cutoff_hours=6)
        schedule = generator.generate_schedule(request)

        # Check a prep day (day -1) for caffeine_cutoff
        cutoffs = get_interventions_by_type(schedule, "caffeine_cutoff", day=-1)
        assert len(cutoffs) >= 1, "Should have caffeine_cutoff on prep day"
        assert cutoffs[0].time == "17:00", f"6h before 23:00 should be 17:00, got {cutoffs[0].time}"

    def test_cutoff_8h_before_sleep(self):
        """8-hour cutoff with 23:00 sleep should give 15:00 cutoff."""
        generator = ScheduleGenerator()
        request = self._create_request(caffeine_cutoff_hours=8)
        schedule = generator.generate_schedule(request)

        cutoffs = get_interventions_by_type(schedule, "caffeine_cutoff", day=-1)
        assert len(cutoffs) >= 1, "Should have caffeine_cutoff on prep day"
        assert cutoffs[0].time == "15:00", f"8h before 23:00 should be 15:00, got {cutoffs[0].time}"

    def test_cutoff_10h_before_sleep(self):
        """10-hour cutoff with 23:00 sleep should give 13:00 cutoff."""
        generator = ScheduleGenerator()
        request = self._create_request(caffeine_cutoff_hours=10)
        schedule = generator.generate_schedule(request)

        cutoffs = get_interventions_by_type(schedule, "caffeine_cutoff", day=-1)
        assert len(cutoffs) >= 1, "Should have caffeine_cutoff on prep day"
        assert cutoffs[0].time == "13:00", (
            f"10h before 23:00 should be 13:00, got {cutoffs[0].time}"
        )

    def test_cutoff_12h_before_sleep(self):
        """12-hour cutoff with 23:00 sleep should give 11:00 cutoff."""
        generator = ScheduleGenerator()
        request = self._create_request(caffeine_cutoff_hours=12)
        schedule = generator.generate_schedule(request)

        cutoffs = get_interventions_by_type(schedule, "caffeine_cutoff", day=-1)
        assert len(cutoffs) >= 1, "Should have caffeine_cutoff on prep day"
        assert cutoffs[0].time == "11:00", (
            f"12h before 23:00 should be 11:00, got {cutoffs[0].time}"
        )

    def test_different_cutoffs_produce_different_times(self):
        """Verify that different cutoff settings produce measurably different times."""
        generator = ScheduleGenerator()

        times = {}
        for hours in [6, 8, 10, 12]:
            request = self._create_request(caffeine_cutoff_hours=hours)
            schedule = generator.generate_schedule(request)
            cutoffs = get_interventions_by_type(schedule, "caffeine_cutoff", day=-1)
            if cutoffs:
                times[hours] = cutoffs[0].time

        # All four should have different times
        unique_times = set(times.values())
        assert len(unique_times) == len(times), (
            f"Different cutoff hours should produce different times, got {times}"
        )


class TestLightExposureMinutes:
    """Tests that light_exposure_minutes affects light intervention duration."""

    def _create_request(self, light_exposure_minutes: int) -> ScheduleRequest:
        """Create a standard eastbound request with specified light duration."""
        return ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="America/New_York",
                    departure_datetime="2026-01-15T08:00",
                    arrival_datetime="2026-01-15T16:00",
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
            light_exposure_minutes=light_exposure_minutes,
        )

    def test_light_duration_30min(self):
        """30-minute light exposure setting should produce 30-min interventions."""
        generator = ScheduleGenerator()
        request = self._create_request(light_exposure_minutes=30)
        schedule = generator.generate_schedule(request)

        light_seeks = get_interventions_by_type(schedule, "light_seek", day=-1)
        assert len(light_seeks) >= 1, "Should have light_seek on prep day"
        assert light_seeks[0].duration_min == 30, (
            f"Duration should be 30 min, got {light_seeks[0].duration_min}"
        )

    def test_light_duration_45min(self):
        """45-minute light exposure setting should produce 45-min interventions."""
        generator = ScheduleGenerator()
        request = self._create_request(light_exposure_minutes=45)
        schedule = generator.generate_schedule(request)

        light_seeks = get_interventions_by_type(schedule, "light_seek", day=-1)
        assert len(light_seeks) >= 1, "Should have light_seek on prep day"
        assert light_seeks[0].duration_min == 45, (
            f"Duration should be 45 min, got {light_seeks[0].duration_min}"
        )

    def test_light_duration_60min(self):
        """60-minute light exposure setting should produce 60-min interventions."""
        generator = ScheduleGenerator()
        request = self._create_request(light_exposure_minutes=60)
        schedule = generator.generate_schedule(request)

        light_seeks = get_interventions_by_type(schedule, "light_seek", day=-1)
        assert len(light_seeks) >= 1, "Should have light_seek on prep day"
        assert light_seeks[0].duration_min == 60, (
            f"Duration should be 60 min, got {light_seeks[0].duration_min}"
        )

    def test_light_duration_90min(self):
        """90-minute light exposure setting should produce 90-min interventions."""
        generator = ScheduleGenerator()
        request = self._create_request(light_exposure_minutes=90)
        schedule = generator.generate_schedule(request)

        light_seeks = get_interventions_by_type(schedule, "light_seek", day=-1)
        assert len(light_seeks) >= 1, "Should have light_seek on prep day"
        assert light_seeks[0].duration_min == 90, (
            f"Duration should be 90 min, got {light_seeks[0].duration_min}"
        )

    def test_different_durations_produce_different_values(self):
        """Verify that different duration settings produce measurably different durations."""
        generator = ScheduleGenerator()

        durations = {}
        for minutes in [30, 45, 60, 90]:
            request = self._create_request(light_exposure_minutes=minutes)
            schedule = generator.generate_schedule(request)
            light_seeks = get_interventions_by_type(schedule, "light_seek", day=-1)
            if light_seeks:
                durations[minutes] = light_seeks[0].duration_min

        # All four should have different durations
        unique_durations = set(durations.values())
        assert len(unique_durations) == len(durations), (
            f"Different duration settings should produce different durations, got {durations}"
        )


class TestPreferenceDefaults:
    """Tests that default values are applied correctly."""

    def test_default_caffeine_cutoff_is_8(self):
        """Default caffeine_cutoff_hours should be 8."""
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/New_York",
                    dest_tz="America/Los_Angeles",
                    departure_datetime="2026-01-15T18:00",
                    arrival_datetime="2026-01-15T21:00",
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="23:00",
        )
        assert request.caffeine_cutoff_hours == 8

    def test_default_light_exposure_is_60(self):
        """Default light_exposure_minutes should be 60."""
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="America/New_York",
                    departure_datetime="2026-01-15T08:00",
                    arrival_datetime="2026-01-15T16:00",
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="23:00",
        )
        assert request.light_exposure_minutes == 60
