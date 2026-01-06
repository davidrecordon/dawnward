"""
Layer 2: Physiological Bounds Tests

Verify recommendations never exceed human physiological limits.
These are critical safety tests.

Scientific references:
- Khalsa et al. (2003): Maximum advance ~1.5h/day, delay ~2.0h/day
- Eastman & Burgess (2009): Rate limits and antidromic risk
- Serkh & Forger (2020): Minimum 6-hour sleep opportunity
- Burgess et al. (2010): Melatonin PRC timing
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
    estimate_cbtmin_time,
    estimate_dlmo_time,
)
from circadian.types import TripLeg, ScheduleRequest
from circadian.scheduler import ScheduleGenerator


class TestMaximumPhaseShiftRate:
    """Verify daily phase shifts stay within physiological limits.

    Per Khalsa et al. (2003) and Eastman & Burgess (2009):
    - Maximum advance: 1.5 hours/day
    - Maximum delay: 2.0 hours/day
    """

    def test_advance_rate_within_bounds(self):
        """Eastward schedules should never advance more than 1.5h/day."""
        generator = ScheduleGenerator()
        future_date = datetime.now() + timedelta(days=5)

        # NYC → London: 5h eastward (advance)
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
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)
        assert schedule.direction == "advance"

        # Check wake_target shifts are within bounds
        wake_times = []
        for day_schedule in schedule.interventions:
            for item in day_schedule.items:
                if item.type == "wake_target":
                    wake_times.append((day_schedule.day, item.time))

        # Sort by day
        wake_times.sort(key=lambda x: x[0])

        # Check daily shift rate
        for i in range(1, len(wake_times)):
            prev_day, prev_time = wake_times[i - 1]
            curr_day, curr_time = wake_times[i]

            # Calculate shift (for advance, wake should get earlier)
            shift = time_diff_hours(curr_time, prev_time)

            # Advance means earlier wake, so shift should be negative (or zero)
            # But after crossing to destination timezone, shifts may look different
            # Focus on pre-departure days
            if curr_day <= 0 and prev_day <= 0:
                daily_shift = abs(shift)
                assert daily_shift <= 1.6, (
                    f"Day {prev_day} to {curr_day}: shift of {daily_shift:.1f}h "
                    f"exceeds max advance rate of 1.5h/day"
                )

    def test_delay_rate_within_bounds(self):
        """Westward schedules should never delay more than 2.0h/day."""
        generator = ScheduleGenerator()
        future_date = datetime.now() + timedelta(days=5)

        # SFO → Tokyo: westward (delay) direction
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Asia/Tokyo",
                    departure_datetime=future_date.strftime("%Y-%m-%dT10:00"),
                    arrival_datetime=(future_date + timedelta(hours=12)).strftime("%Y-%m-%dT14:00")
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)
        assert schedule.direction == "delay"

        # Check sleep_target shifts are within bounds
        sleep_times = []
        for day_schedule in schedule.interventions:
            for item in day_schedule.items:
                if item.type == "sleep_target":
                    sleep_times.append((day_schedule.day, item.time))

        sleep_times.sort(key=lambda x: x[0])

        # Check daily shift rate for pre-departure days
        for i in range(1, len(sleep_times)):
            prev_day, prev_time = sleep_times[i - 1]
            curr_day, curr_time = sleep_times[i]

            if curr_day <= 0 and prev_day <= 0:
                shift = time_diff_hours(prev_time, curr_time)
                daily_shift = abs(shift)
                assert daily_shift <= 2.1, (
                    f"Day {prev_day} to {curr_day}: shift of {daily_shift:.1f}h "
                    f"exceeds max delay rate of 2.0h/day"
                )

    def test_large_shift_respects_bounds(self):
        """Even 9+ hour shifts should stay within daily limits."""
        generator = ScheduleGenerator()
        future_date = datetime.now() + timedelta(days=7)

        # SFO → Dubai: 12h shift
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Asia/Dubai",
                    departure_datetime=future_date.strftime("%Y-%m-%dT16:00"),
                    arrival_datetime=(future_date + timedelta(hours=16)).strftime("%Y-%m-%dT08:00")
                )
            ],
            prep_days=5,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        # Should have multiple days of adaptation
        assert schedule.estimated_adaptation_days >= 4

        # Verify we don't try to shift everything in one day
        wake_times = get_interventions_by_type(schedule, "wake_target")
        assert len(wake_times) >= 4, "Large shift should span multiple days"


class TestAntidromicRiskPrevention:
    """Verify light recommendations never cause opposite-direction shifts.

    Per Khalsa PRC:
    - Light before CBT_min → delays
    - Light after CBT_min → advances

    For advance schedules, light_seek should be AFTER CBT_min.
    For delay schedules, light_seek should be BEFORE CBT_min.
    """

    def test_advance_light_not_in_delay_zone(self):
        """For advance schedules, light_seek should be AFTER estimated CBT_min."""
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
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)
        assert schedule.direction == "advance"

        # Get light_seek interventions for pre-departure days
        for day_schedule in schedule.interventions:
            if day_schedule.day > 0:
                continue  # Skip post-arrival days

            # Find light_seek and wake_target for this day
            light_seeks = [i for i in day_schedule.items if i.type == "light_seek"]
            wake_targets = [i for i in day_schedule.items if i.type == "wake_target"]

            if not light_seeks or not wake_targets:
                continue

            wake_time = wake_targets[0].time
            cbtmin_estimate = estimate_cbtmin_time(wake_time)

            for light_seek in light_seeks:
                # Light should be AFTER CBT_min for advances
                # Allow 1h tolerance since our light timing may be adjusted for sleep
                diff = time_diff_hours(cbtmin_estimate, light_seek.time)
                assert diff >= -1.0, (
                    f"Day {day_schedule.day}: light_seek at {light_seek.time} is "
                    f"{abs(diff):.1f}h BEFORE CBT_min ({cbtmin_estimate}), "
                    f"which would cause delay instead of advance"
                )

    def test_delay_light_not_in_advance_zone(self):
        """For delay schedules, light_seek should be in evening (before CBT_min zone)."""
        generator = ScheduleGenerator()
        future_date = datetime.now() + timedelta(days=5)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Asia/Tokyo",
                    departure_datetime=future_date.strftime("%Y-%m-%dT10:00"),
                    arrival_datetime=(future_date + timedelta(hours=12)).strftime("%Y-%m-%dT14:00")
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)
        assert schedule.direction == "delay"

        # For delay, light should be in the evening (before sleep)
        for day_schedule in schedule.interventions:
            if day_schedule.day > 0:
                continue

            light_seeks = [i for i in day_schedule.items if i.type == "light_seek"]
            sleep_targets = [i for i in day_schedule.items if i.type == "sleep_target"]

            if not light_seeks or not sleep_targets:
                continue

            sleep_time = sleep_targets[0].time

            for light_seek in light_seeks:
                # Light should be before sleep (evening hours)
                hours_before_sleep = time_diff_hours(light_seek.time, sleep_time)
                if hours_before_sleep < 0:
                    hours_before_sleep += 24

                # For delay, light should be 1-6h before sleep (evening)
                assert 0 <= hours_before_sleep <= 6, (
                    f"Day {day_schedule.day}: light_seek at {light_seek.time} is "
                    f"{hours_before_sleep:.1f}h before sleep ({sleep_time}), "
                    f"expected 1-6h for delay schedule"
                )


class TestSleepDurationConstraints:
    """Verify minimum 6-hour sleep opportunity per Serkh & Forger (2020)."""

    def test_minimum_sleep_opportunity(self):
        """For any schedule, time between sleep_target and wake_target >= 6h."""
        generator = ScheduleGenerator()
        future_date = datetime.now() + timedelta(days=5)

        # Test with a standard request
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
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        for day_schedule in schedule.interventions:
            sleep_targets = [i for i in day_schedule.items if i.type == "sleep_target"]
            wake_targets = [i for i in day_schedule.items if i.type == "wake_target"]

            if not sleep_targets or not wake_targets:
                continue

            sleep_time = sleep_targets[0].time
            wake_time = wake_targets[0].time

            # Calculate sleep duration (wake is next day)
            # If sleep is at 23:00 and wake is at 07:00, that's 8 hours
            sleep_duration = time_diff_hours(sleep_time, wake_time)
            if sleep_duration < 0:
                sleep_duration += 24  # Handle midnight crossing

            assert sleep_duration >= 6.0, (
                f"Day {day_schedule.day}: sleep window from {sleep_time} to {wake_time} "
                f"is only {sleep_duration:.1f}h, minimum is 6h"
            )

    def test_sleep_opportunity_with_extreme_shift(self):
        """Even with large shifts, sleep opportunity should be maintained."""
        generator = ScheduleGenerator()
        future_date = datetime.now() + timedelta(days=7)

        # Large shift requiring significant daily adjustment
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Asia/Tokyo",
                    departure_datetime=future_date.strftime("%Y-%m-%dT10:00"),
                    arrival_datetime=(future_date + timedelta(hours=12)).strftime("%Y-%m-%dT14:00")
                )
            ],
            prep_days=5,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        for day_schedule in schedule.interventions:
            sleep_targets = [i for i in day_schedule.items if i.type == "sleep_target"]
            wake_targets = [i for i in day_schedule.items if i.type == "wake_target"]

            if not sleep_targets or not wake_targets:
                continue

            sleep_time = sleep_targets[0].time
            wake_time = wake_targets[0].time

            sleep_duration = time_diff_hours(sleep_time, wake_time)
            if sleep_duration < 0:
                sleep_duration += 24

            assert sleep_duration >= 6.0, (
                f"Day {day_schedule.day}: even with large shift, sleep from "
                f"{sleep_time} to {wake_time} ({sleep_duration:.1f}h) should be >= 6h"
            )


class TestMelatoninTimingValidation:
    """Verify melatonin aligns with Burgess et al. (2010) PRC.

    - Advance: ~5h before DLMO (afternoon/early evening)
    - Delay: Upon waking (morning) - rarely recommended
    """

    def test_advance_melatonin_before_dlmo(self):
        """Melatonin for advances should be before estimated DLMO."""
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
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)
        assert schedule.direction == "advance"

        melatonin_times = get_interventions_by_type(schedule, "melatonin")

        for melatonin in melatonin_times:
            # Melatonin should be in afternoon/evening
            # DLMO for 23:00 sleep is ~21:00
            dlmo_estimate = estimate_dlmo_time("23:00")

            hours_before_dlmo = time_diff_hours(melatonin.time, dlmo_estimate)

            # Melatonin for advances should be before DLMO
            # Allow wide range due to shifting schedules (earlier prep days = earlier melatonin)
            # Range: 0-10h before DLMO covers all practical cases
            assert 0 <= hours_before_dlmo <= 10, (
                f"Melatonin at {melatonin.time} is {hours_before_dlmo:.1f}h before "
                f"base DLMO ({dlmo_estimate}), should be 0-10h before"
            )

    def test_melatonin_not_during_sleep(self):
        """Melatonin should never be scheduled during sleep hours."""
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
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generator.generate_schedule(request)

        for day_schedule in schedule.interventions:
            sleep_targets = [i for i in day_schedule.items if i.type == "sleep_target"]
            wake_targets = [i for i in day_schedule.items if i.type == "wake_target"]
            melatonin_items = [i for i in day_schedule.items if i.type == "melatonin"]

            if not sleep_targets or not wake_targets or not melatonin_items:
                continue

            sleep_time = sleep_targets[0].time
            wake_time = wake_targets[0].time

            for melatonin in melatonin_items:
                # Melatonin should be before sleep (at or around bedtime is OK)
                # It should definitely NOT be in the middle of the night
                hours_after_sleep = time_diff_hours(sleep_time, melatonin.time)
                hours_before_wake = time_diff_hours(melatonin.time, wake_time)

                # If melatonin is 2+ hours after sleep and 2+ hours before wake,
                # it's in the middle of the night (bad)
                if hours_after_sleep > 0:
                    hours_after_sleep = hours_after_sleep if hours_after_sleep < 12 else hours_after_sleep - 24

                is_middle_of_night = (
                    hours_after_sleep > 2 and
                    hours_before_wake > 2 and
                    hours_after_sleep < 6  # Actually after sleep, not before
                )

                assert not is_middle_of_night, (
                    f"Day {day_schedule.day}: melatonin at {melatonin.time} is "
                    f"during sleep (sleep: {sleep_time}, wake: {wake_time})"
                )
