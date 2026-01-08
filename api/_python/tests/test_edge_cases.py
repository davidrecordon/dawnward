"""
Layer 5: Edge Case Tests

Unusual scenarios that should fail gracefully.
These test the robustness of the scheduler.
"""

import pytest
from datetime import datetime, timedelta

import sys
from pathlib import Path
# Add both tests dir and parent dir to path
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent))

from helpers import (
    time_diff_hours,
    get_interventions_by_type,
    get_interventions_for_day,
)
from circadian.types import TripLeg, ScheduleRequest
from circadian.scheduler_v2 import ScheduleGeneratorV2 as ScheduleGenerator


class TestCircadianEquatorCrossing:
    """12-hour shifts where direction choice matters."""

    def test_12h_shift_chooses_optimal_direction(self):
        """Exactly 12h shift should work and choose a reasonable direction."""
        generator = ScheduleGenerator()
        future_date = datetime.now() + timedelta(days=7)

        # NYC (UTC-5) to Bangkok (UTC+7) = 12h east
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/New_York",
                    dest_tz="Asia/Bangkok",
                    departure_datetime=future_date.strftime("%Y-%m-%dT22:00"),
                    arrival_datetime=(future_date + timedelta(hours=17)).strftime("%Y-%m-%dT08:00")
                )
            ],
            prep_days=5,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        # Should successfully generate a schedule
        assert schedule is not None
        assert schedule.total_shift_hours <= 12

        # Should have reasonable adaptation timeline
        assert schedule.estimated_adaptation_days >= 4

    def test_11h_vs_13h_direction(self):
        """Verify >12h is treated as shorter direction."""
        generator = ScheduleGenerator()
        future_date = datetime.now() + timedelta(days=7)

        # Create a 13h east shift (should be treated as 11h west)
        # NYC (UTC-5) to somewhere at UTC+8 = 13h east
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/New_York",
                    dest_tz="Asia/Singapore",  # UTC+8
                    departure_datetime=future_date.strftime("%Y-%m-%dT22:00"),
                    arrival_datetime=(future_date + timedelta(hours=18)).strftime("%Y-%m-%dT10:00")
                )
            ],
            prep_days=5,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        # 13h east = 11h west, should choose the shorter/easier direction
        # Total shift should be <= 12h
        assert schedule.total_shift_hours <= 12, (
            f"13h shift should be optimized to <= 12h, got {schedule.total_shift_hours}"
        )

    def test_crossing_international_date_line(self):
        """Test crossing the international date line."""
        generator = ScheduleGenerator()
        future_date = datetime.now() + timedelta(days=7)

        # SFO to Sydney (crosses date line)
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Australia/Sydney",
                    departure_datetime=future_date.strftime("%Y-%m-%dT22:00"),
                    arrival_datetime=(future_date + timedelta(hours=15)).strftime("%Y-%m-%dT07:00")
                )
            ],
            prep_days=5,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        # Should handle date line crossing gracefully
        assert schedule is not None
        assert schedule.total_shift_hours <= 12


class TestShortTrips:
    """Trips too short for meaningful adaptation."""

    def test_very_short_trip_still_generates(self):
        """Even very short trips should generate a schedule."""
        generator = ScheduleGenerator()
        future_date = datetime.now() + timedelta(days=2)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/New_York",
                    dest_tz="Europe/London",
                    departure_datetime=future_date.strftime("%Y-%m-%dT19:00"),
                    arrival_datetime=(future_date + timedelta(hours=7)).strftime("%Y-%m-%dT07:00")
                )
            ],
            prep_days=1,  # Very short notice
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        # Should still generate something
        assert schedule is not None
        assert len(schedule.interventions) > 0

    def test_same_day_departure_handles_gracefully(self):
        """Schedule generated day-of should work with 0 prep days."""
        generator = ScheduleGenerator()

        # Departure in 12 hours
        departure = datetime.now() + timedelta(hours=12)
        arrival = departure + timedelta(hours=7)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/New_York",
                    dest_tz="Europe/London",
                    departure_datetime=departure.strftime("%Y-%m-%dT%H:%M"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT%H:%M")
                )
            ],
            prep_days=3,  # Will be auto-adjusted to 0 or 1
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        # Should handle gracefully (auto-adjust prep days)
        assert schedule is not None


class TestExtremeChronotypes:
    """Handle users with unusual sleep schedules."""

    def test_extreme_owl_cbtmin_at_8am(self):
        """Extreme owl (wake 10:30, sleep 02:30) → CBT_min ~08:00.

        Verify PRC-relative recommendations still work.
        """
        generator = ScheduleGenerator()
        future_date = datetime.now() + timedelta(days=5)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/New_York",
                    dest_tz="Europe/London",
                    departure_datetime=future_date.strftime("%Y-%m-%dT19:00"),
                    arrival_datetime=(future_date + timedelta(hours=7)).strftime("%Y-%m-%dT07:00")
                )
            ],
            prep_days=3,
            wake_time="10:30",  # Extreme owl
            sleep_time="02:30",  # After midnight
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        # Should generate valid schedule
        assert schedule is not None

        # Light timing should still make sense
        for day_schedule in schedule.interventions:
            wake_targets = [i for i in day_schedule.items if i.type == "wake_target"]
            light_seeks = [i for i in day_schedule.items if i.type == "light_seek"]

            if wake_targets and light_seeks:
                wake_time = wake_targets[0].time
                light_time = light_seeks[0].time

                # Light should be during waking hours (not in the middle of sleep)
                hours_after_wake = time_diff_hours(wake_time, light_time)

                # Light should be within waking day (not way before wake)
                assert hours_after_wake >= -2, (
                    f"Day {day_schedule.day}: light at {light_time} is too early "
                    f"for owl with wake at {wake_time}"
                )

    def test_extreme_lark_cbtmin_at_3am(self):
        """Extreme lark (wake 05:30, sleep 21:30) → CBT_min ~03:00.

        Verify recommendations work for early birds.
        """
        generator = ScheduleGenerator()
        future_date = datetime.now() + timedelta(days=5)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/New_York",
                    dest_tz="Europe/London",
                    departure_datetime=future_date.strftime("%Y-%m-%dT19:00"),
                    arrival_datetime=(future_date + timedelta(hours=7)).strftime("%Y-%m-%dT07:00")
                )
            ],
            prep_days=3,
            wake_time="05:30",  # Extreme lark
            sleep_time="21:30",  # Early to bed
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        assert schedule is not None

        # Sleep targets should reflect early schedule
        for day_schedule in schedule.interventions:
            sleep_targets = [i for i in day_schedule.items if i.type == "sleep_target"]

            if sleep_targets:
                sleep_hour = int(sleep_targets[0].time.split(":")[0])
                # Even shifted, sleep should be in reasonable evening hours
                # (allowing for shift, 16:00 - 02:00 range to accommodate
                # shifted schedules shown on Day 0/1 per user preference)
                is_evening = (16 <= sleep_hour <= 23) or (0 <= sleep_hour <= 2)
                assert is_evening, (
                    f"Day {day_schedule.day}: sleep target {sleep_targets[0].time} "
                    f"seems unreasonable for lark schedule"
                )


class TestMultiLegComplexity:
    """Multi-destination trips with insufficient adaptation time."""

    def test_two_leg_trip_generates_schedule(self):
        """Multi-leg trip should generate complete schedule."""
        generator = ScheduleGenerator()
        future_date = datetime.now() + timedelta(days=5)

        leg1_departure = future_date
        leg1_arrival = leg1_departure + timedelta(hours=5)
        leg2_departure = leg1_arrival + timedelta(hours=4)
        leg2_arrival = leg2_departure + timedelta(hours=7)

        request = ScheduleRequest(
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
        )

        schedule = generator.generate_schedule(request)

        # Should handle multi-leg trips
        assert schedule is not None
        assert len(schedule.interventions) > 0

        # Total shift should reflect full journey (SFO to London = 8h)
        assert schedule.total_shift_hours >= 4

    def test_connecting_flight_same_day(self):
        """Same-day connection should work."""
        generator = ScheduleGenerator()
        future_date = datetime.now() + timedelta(days=5)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="America/Chicago",
                    departure_datetime=future_date.strftime("%Y-%m-%dT06:00"),
                    arrival_datetime=future_date.strftime("%Y-%m-%dT11:00")
                ),
                TripLeg(
                    origin_tz="America/Chicago",
                    dest_tz="Europe/London",
                    departure_datetime=future_date.strftime("%Y-%m-%dT13:00"),
                    arrival_datetime=(future_date + timedelta(hours=7)).strftime("%Y-%m-%dT02:00")
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        assert schedule is not None


class TestZeroTimezoneChange:
    """Same timezone, different location."""

    def test_same_timezone_minimal_intervention(self):
        """Same timezone travel should have minimal circadian intervention."""
        generator = ScheduleGenerator()
        future_date = datetime.now() + timedelta(days=5)

        # NYC and Montreal are both in same timezone
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/New_York",
                    dest_tz="America/Toronto",  # Same timezone as NYC
                    departure_datetime=future_date.strftime("%Y-%m-%dT08:00"),
                    arrival_datetime=future_date.strftime("%Y-%m-%dT09:30")
                )
            ],
            prep_days=1,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        # Zero timezone shift
        assert schedule.total_shift_hours == 0

        # No circadian shifting needed
        assert schedule.direction in ("advance", "delay")  # Will default to one


class TestBoundaryConditions:
    """Test boundary conditions and edge values."""

    def test_maximum_prep_days(self):
        """Maximum prep days (7) should work."""
        generator = ScheduleGenerator()
        future_date = datetime.now() + timedelta(days=10)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/New_York",
                    dest_tz="Asia/Tokyo",
                    departure_datetime=future_date.strftime("%Y-%m-%dT19:00"),
                    arrival_datetime=(future_date + timedelta(hours=14)).strftime("%Y-%m-%dT14:00")
                )
            ],
            prep_days=7,  # Maximum
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        assert schedule is not None
        # With 7 prep days far in advance, should have many intervention days
        assert len(schedule.interventions) >= 7

    def test_minimum_prep_days(self):
        """Minimum prep days (1) should work."""
        generator = ScheduleGenerator()
        future_date = datetime.now() + timedelta(days=5)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/New_York",
                    dest_tz="Europe/London",
                    departure_datetime=future_date.strftime("%Y-%m-%dT19:00"),
                    arrival_datetime=(future_date + timedelta(hours=7)).strftime("%Y-%m-%dT07:00")
                )
            ],
            prep_days=1,  # Minimum
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        assert schedule is not None
        assert len(schedule.interventions) >= 1

    def test_all_supplements_disabled(self):
        """Schedule with no optional interventions should still work."""
        generator = ScheduleGenerator()
        future_date = datetime.now() + timedelta(days=5)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/New_York",
                    dest_tz="Europe/London",
                    departure_datetime=future_date.strftime("%Y-%m-%dT19:00"),
                    arrival_datetime=(future_date + timedelta(hours=7)).strftime("%Y-%m-%dT07:00")
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=False,
            uses_caffeine=False,
            uses_exercise=False,
        )

        schedule = generator.generate_schedule(request)

        assert schedule is not None

        # Should still have light and sleep/wake
        all_types = set()
        for day_schedule in schedule.interventions:
            for item in day_schedule.items:
                all_types.add(item.type)

        assert "light_seek" in all_types
        assert "wake_target" in all_types
        assert "sleep_target" in all_types

        # Should NOT have melatonin or caffeine
        assert "melatonin" not in all_types
        assert "caffeine_ok" not in all_types
        assert "caffeine_cutoff" not in all_types


class TestMelatoninTimingConstraints:
    """Test that melatonin is never scheduled before wake time."""

    def test_delay_melatonin_not_before_wake(self):
        """For delay direction, melatonin should be at or after wake time.

        Previously a bug allowed morning melatonin at 8am when wake was 9am.
        """
        generator = ScheduleGenerator()
        future_date = datetime.now() + timedelta(days=5)

        # CDG to SFO (westbound = delay, 9h shift)
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="Europe/Paris",
                    dest_tz="America/Los_Angeles",
                    departure_datetime=future_date.strftime("%Y-%m-%dT13:30"),
                    arrival_datetime=future_date.strftime("%Y-%m-%dT15:15")
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)
        assert schedule is not None
        assert schedule.direction == "delay", "CDG→SFO should be delay direction"

        # Check all days: melatonin time should be >= wake time
        for day_schedule in schedule.interventions:
            melatonin_items = [i for i in day_schedule.items if i.type == "melatonin"]
            wake_items = [i for i in day_schedule.items if i.type == "wake_target"]

            if melatonin_items and wake_items:
                mel_time = melatonin_items[0].time  # HH:MM format
                wake_time = wake_items[0].time

                # Parse times
                mel_minutes = int(mel_time.split(":")[0]) * 60 + int(mel_time.split(":")[1])
                wake_minutes = int(wake_time.split(":")[0]) * 60 + int(wake_time.split(":")[1])

                # For delay direction (morning melatonin), melatonin should be >= wake
                assert mel_minutes >= wake_minutes, (
                    f"Day {day_schedule.day}: melatonin at {mel_time} is before "
                    f"wake at {wake_time}. Can't take melatonin while asleep!"
                )

    def test_delay_melatonin_clamped_to_late_wake(self):
        """Test that late wake time (9am) properly clamps melatonin."""
        generator = ScheduleGenerator()
        future_date = datetime.now() + timedelta(days=5)

        # Westbound with late wake time
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="Europe/Paris",
                    dest_tz="America/Los_Angeles",
                    departure_datetime=future_date.strftime("%Y-%m-%dT13:30"),
                    arrival_datetime=future_date.strftime("%Y-%m-%dT15:15")
                )
            ],
            prep_days=3,
            wake_time="09:00",  # Late wake
            sleep_time="01:00",  # Late sleep (owl chronotype)
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)
        assert schedule is not None

        # All melatonin should be at or after 9am wake
        for day_schedule in schedule.interventions:
            melatonin_items = [i for i in day_schedule.items if i.type == "melatonin"]
            wake_items = [i for i in day_schedule.items if i.type == "wake_target"]

            if melatonin_items and wake_items:
                mel_time = melatonin_items[0].time
                wake_time = wake_items[0].time

                mel_minutes = int(mel_time.split(":")[0]) * 60 + int(mel_time.split(":")[1])
                wake_minutes = int(wake_time.split(":")[0]) * 60 + int(wake_time.split(":")[1])

                assert mel_minutes >= wake_minutes, (
                    f"Day {day_schedule.day}: melatonin at {mel_time} scheduled before "
                    f"wake at {wake_time}"
                )
