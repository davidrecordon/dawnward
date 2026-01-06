"""
Tests for circadian schedule generation.

Uses pytest with proper assertions to verify schedule generation logic.
"""

import pytest


class TestTimezoneShiftCalculation:
    """Tests for timezone shift direction and magnitude."""

    def test_westward_delay_direction(self, generator, westward_request):
        """SFO → Tokyo should produce delay direction."""
        response = generator.generate_schedule(westward_request)
        assert response.direction == "delay"

    def test_eastward_advance_direction(self, generator, eastward_request):
        """NYC → London should produce advance direction."""
        response = generator.generate_schedule(eastward_request)
        assert response.direction == "advance"

    def test_westward_shift_hours(self, generator, westward_request):
        """SFO → Tokyo should have reasonable shift hours."""
        response = generator.generate_schedule(westward_request)
        # Tokyo is UTC+9, LA is UTC-8, so raw diff is 17h
        # But going west (delay) might take the shorter path
        assert 5 <= response.total_shift_hours <= 17

    def test_eastward_shift_hours(self, generator, eastward_request):
        """NYC → London should have ~5h shift."""
        response = generator.generate_schedule(eastward_request)
        # London is UTC+0, NYC is UTC-5
        assert 4 <= response.total_shift_hours <= 6


class TestScheduleStructure:
    """Tests for schedule structure and format."""

    def test_schedule_has_prep_days(self, generator, eastward_request):
        """Schedule should include negative day numbers for prep days."""
        response = generator.generate_schedule(eastward_request)
        day_numbers = [day.day for day in response.interventions]
        assert any(d < 0 for d in day_numbers), "Should have prep days (negative)"

    def test_schedule_has_arrival_days(self, generator, eastward_request):
        """Schedule should include positive day numbers for arrival days."""
        response = generator.generate_schedule(eastward_request)
        day_numbers = [day.day for day in response.interventions]
        assert any(d > 0 for d in day_numbers), "Should have arrival days (positive)"

    def test_schedule_includes_day_zero(self, generator, eastward_request):
        """Schedule should include day 0 (flight day)."""
        response = generator.generate_schedule(eastward_request)
        day_numbers = [day.day for day in response.interventions]
        assert 0 in day_numbers, "Should include day 0 (flight day)"

    def test_interventions_sorted_by_time(self, generator, eastward_request):
        """Interventions within each day should be sorted by time."""
        response = generator.generate_schedule(eastward_request)
        for day in response.interventions:
            times = [item.time for item in day.items]
            assert times == sorted(times), f"Day {day.day} items not sorted by time"

    def test_each_day_has_date(self, generator, eastward_request):
        """Each day should have a date in ISO format."""
        response = generator.generate_schedule(eastward_request)
        for day in response.interventions:
            assert day.date is not None
            assert len(day.date) == 10  # "YYYY-MM-DD"
            assert day.date[4] == "-" and day.date[7] == "-"


class TestInterventionGeneration:
    """Tests for intervention types and content."""

    def test_light_prc_module_generates_interventions(self):
        """Light PRC module should generate light_seek interventions.

        Note: light_avoid may be filtered if it falls entirely during sleep.
        This test verifies the underlying light generation works.
        """
        from datetime import time
        from circadian.light_prc import generate_light_windows

        wake = time(7, 0)
        sleep = time(23, 0)
        cbtmin = time(4, 30)

        # Test advance direction (eastward)
        interventions = generate_light_windows(wake, sleep, cbtmin, "advance")
        types = [i.type for i in interventions]
        assert "light_seek" in types, "Should generate light_seek for advance"

        # Test delay direction (westward)
        interventions = generate_light_windows(wake, sleep, cbtmin, "delay")
        types = [i.type for i in interventions]
        assert "light_seek" in types, "Should generate light_seek for delay"

    def test_melatonin_when_enabled(self, generator, eastward_request):
        """Melatonin should appear when uses_melatonin=True."""
        response = generator.generate_schedule(eastward_request)
        all_types = []
        for day in response.interventions:
            all_types.extend([item.type for item in day.items])

        assert "melatonin" in all_types, "Should have melatonin when enabled"

    def test_no_melatonin_when_disabled(self, generator, no_supplements_request):
        """Melatonin should not appear when uses_melatonin=False."""
        response = generator.generate_schedule(no_supplements_request)
        all_types = []
        for day in response.interventions:
            all_types.extend([item.type for item in day.items])

        assert "melatonin" not in all_types, "Should not have melatonin when disabled"

    def test_caffeine_when_enabled(self, generator, eastward_request):
        """Caffeine interventions should appear when uses_caffeine=True."""
        response = generator.generate_schedule(eastward_request)
        all_types = []
        for day in response.interventions:
            all_types.extend([item.type for item in day.items])

        assert "caffeine_ok" in all_types, "Should have caffeine_ok when enabled"
        assert "caffeine_cutoff" in all_types, "Should have caffeine_cutoff when enabled"

    def test_no_caffeine_when_disabled(self, generator, no_supplements_request):
        """Caffeine should not appear when uses_caffeine=False."""
        response = generator.generate_schedule(no_supplements_request)
        all_types = []
        for day in response.interventions:
            all_types.extend([item.type for item in day.items])

        assert "caffeine_ok" not in all_types
        assert "caffeine_cutoff" not in all_types

    def test_exercise_when_enabled(self, generator, westward_request):
        """Exercise should appear when uses_exercise=True."""
        response = generator.generate_schedule(westward_request)
        all_types = []
        for day in response.interventions:
            all_types.extend([item.type for item in day.items])

        assert "exercise" in all_types, "Should have exercise when enabled"

    def test_no_exercise_when_disabled(self, generator, eastward_request):
        """Exercise should not appear when uses_exercise=False."""
        # eastward_request has uses_exercise=False
        response = generator.generate_schedule(eastward_request)
        all_types = []
        for day in response.interventions:
            all_types.extend([item.type for item in day.items])

        assert "exercise" not in all_types, "Should not have exercise when disabled"

    def test_sleep_wake_targets_present(self, generator, eastward_request):
        """Sleep and wake targets should always be present."""
        response = generator.generate_schedule(eastward_request)
        all_types = []
        for day in response.interventions:
            all_types.extend([item.type for item in day.items])

        assert "sleep_target" in all_types, "Should have sleep_target"
        assert "wake_target" in all_types, "Should have wake_target"


class TestEdgeCases:
    """Tests for edge cases and special scenarios."""

    def test_short_notice_adjusts_prep_days(self, generator, short_notice_request):
        """Prep days should be auto-adjusted when departure is soon."""
        response = generator.generate_schedule(short_notice_request)
        # With departure tomorrow, can't have 3 prep days
        # Should have at most 1 prep day (day -1)
        day_numbers = [day.day for day in response.interventions]
        prep_days = [d for d in day_numbers if d < 0]
        assert len(prep_days) <= 1, "Should auto-adjust prep days for short notice"

    def test_multi_leg_calculates_total_shift(self, generator, multi_leg_request):
        """Multi-leg should calculate shift from first origin to last dest."""
        response = generator.generate_schedule(multi_leg_request)
        # SFO (UTC-8) to London (UTC+0) = 8h advance
        assert response.direction == "advance"
        assert 7 <= response.total_shift_hours <= 9

    def test_estimated_adaptation_days_reasonable(self, generator, eastward_request):
        """Estimated adaptation days should be reasonable."""
        response = generator.generate_schedule(eastward_request)
        # For a 5h shift, should take ~4-6 days
        assert 3 <= response.estimated_adaptation_days <= 10


class TestInterventionContent:
    """Tests for intervention titles and descriptions."""

    def test_interventions_have_titles(self, generator, eastward_request):
        """All interventions should have non-empty titles."""
        response = generator.generate_schedule(eastward_request)
        for day in response.interventions:
            for item in day.items:
                assert item.title, f"Intervention {item.type} missing title"
                assert len(item.title) > 0

    def test_interventions_have_descriptions(self, generator, eastward_request):
        """All interventions should have non-empty descriptions."""
        response = generator.generate_schedule(eastward_request)
        for day in response.interventions:
            for item in day.items:
                assert item.description, f"Intervention {item.type} missing description"
                assert len(item.description) > 0

    def test_intervention_times_valid_format(self, generator, eastward_request):
        """All intervention times should be in HH:MM format."""
        response = generator.generate_schedule(eastward_request)
        for day in response.interventions:
            for item in day.items:
                assert len(item.time) == 5, f"Time {item.time} not HH:MM format"
                assert item.time[2] == ":", f"Time {item.time} missing colon"
                hour, minute = item.time.split(":")
                assert 0 <= int(hour) <= 23, f"Invalid hour in {item.time}"
                assert 0 <= int(minute) <= 59, f"Invalid minute in {item.time}"

    def test_duration_interventions_have_duration(self, generator, eastward_request):
        """Light and exercise interventions should have duration_min set."""
        response = generator.generate_schedule(eastward_request)
        for day in response.interventions:
            for item in day.items:
                if item.type in ["light_seek", "light_avoid", "exercise"]:
                    assert item.duration_min is not None, \
                        f"{item.type} should have duration_min"
                    assert item.duration_min > 0


class TestSleepFiltering:
    """Tests for filtering out interventions during sleep hours."""

    def _time_to_minutes(self, time_str: str) -> int:
        """Convert HH:MM to minutes since midnight."""
        h, m = time_str.split(":")
        return int(h) * 60 + int(m)

    def _is_during_sleep(self, time_str: str, sleep_time: str, wake_time: str) -> bool:
        """Check if time falls within sleep window."""
        t = self._time_to_minutes(time_str)
        sleep = self._time_to_minutes(sleep_time)
        wake = self._time_to_minutes(wake_time)

        if sleep > wake:  # Crosses midnight
            return t >= sleep or t < wake
        else:
            return sleep <= t < wake

    def test_no_light_seek_during_sleep(self, generator, eastward_request):
        """Light seek should not appear during sleep hours."""
        response = generator.generate_schedule(eastward_request)

        for day in response.interventions:
            # Find sleep and wake times for this day
            sleep_time = None
            wake_time = None
            for item in day.items:
                if item.type == "sleep_target":
                    sleep_time = item.time
                elif item.type == "wake_target":
                    wake_time = item.time

            if not sleep_time or not wake_time:
                continue

            # Check no light_seek during sleep
            for item in day.items:
                if item.type == "light_seek":
                    assert not self._is_during_sleep(item.time, sleep_time, wake_time), \
                        f"light_seek at {item.time} is during sleep ({sleep_time} to {wake_time})"

    def test_no_light_avoid_during_sleep(self, generator, eastward_request):
        """Light avoid should not appear during sleep hours."""
        response = generator.generate_schedule(eastward_request)

        for day in response.interventions:
            sleep_time = None
            wake_time = None
            for item in day.items:
                if item.type == "sleep_target":
                    sleep_time = item.time
                elif item.type == "wake_target":
                    wake_time = item.time

            if not sleep_time or not wake_time:
                continue

            for item in day.items:
                if item.type == "light_avoid":
                    assert not self._is_during_sleep(item.time, sleep_time, wake_time), \
                        f"light_avoid at {item.time} is during sleep ({sleep_time} to {wake_time})"

    def test_no_caffeine_during_sleep(self, generator, eastward_request):
        """Caffeine interventions should not appear during sleep hours."""
        response = generator.generate_schedule(eastward_request)

        for day in response.interventions:
            sleep_time = None
            wake_time = None
            for item in day.items:
                if item.type == "sleep_target":
                    sleep_time = item.time
                elif item.type == "wake_target":
                    wake_time = item.time

            if not sleep_time or not wake_time:
                continue

            for item in day.items:
                if item.type in ["caffeine_ok", "caffeine_cutoff"]:
                    assert not self._is_during_sleep(item.time, sleep_time, wake_time), \
                        f"{item.type} at {item.time} is during sleep ({sleep_time} to {wake_time})"

    def test_no_exercise_during_sleep(self, generator, westward_request):
        """Exercise should not appear during sleep hours."""
        response = generator.generate_schedule(westward_request)

        for day in response.interventions:
            sleep_time = None
            wake_time = None
            for item in day.items:
                if item.type == "sleep_target":
                    sleep_time = item.time
                elif item.type == "wake_target":
                    wake_time = item.time

            if not sleep_time or not wake_time:
                continue

            for item in day.items:
                if item.type == "exercise":
                    assert not self._is_during_sleep(item.time, sleep_time, wake_time), \
                        f"exercise at {item.time} is during sleep ({sleep_time} to {wake_time})"

    def test_sleep_wake_targets_always_preserved(self, generator, eastward_request):
        """Sleep and wake targets should never be filtered out."""
        response = generator.generate_schedule(eastward_request)

        for day in response.interventions:
            types = [item.type for item in day.items]
            assert "sleep_target" in types, f"Day {day.day} missing sleep_target"
            assert "wake_target" in types, f"Day {day.day} missing wake_target"

    def test_melatonin_preserved(self, generator, eastward_request):
        """Melatonin should be preserved (it's taken before sleep, so actionable)."""
        response = generator.generate_schedule(eastward_request)

        # Check melatonin appears in at least one day
        all_types = []
        for day in response.interventions:
            all_types.extend([item.type for item in day.items])

        assert "melatonin" in all_types, "Melatonin should be preserved"

    def test_sleep_window_crosses_midnight(self, generator, westward_request):
        """Sleep filtering should work when sleep crosses midnight."""
        # Westward trips (delays) can result in late sleep times
        response = generator.generate_schedule(westward_request)

        for day in response.interventions:
            sleep_time = None
            wake_time = None
            for item in day.items:
                if item.type == "sleep_target":
                    sleep_time = item.time
                elif item.type == "wake_target":
                    wake_time = item.time

            if not sleep_time or not wake_time:
                continue

            # Verify no filterable interventions during sleep
            filterable = ["light_seek", "light_avoid", "caffeine_ok", "caffeine_cutoff", "exercise"]
            for item in day.items:
                if item.type in filterable:
                    assert not self._is_during_sleep(item.time, sleep_time, wake_time), \
                        f"{item.type} at {item.time} during sleep ({sleep_time} to {wake_time})"

    def test_filtering_preserves_all_intervention_fields(self, generator, eastward_request):
        """Filtering should preserve all intervention data (title, description, etc.)."""
        response = generator.generate_schedule(eastward_request)

        for day in response.interventions:
            for item in day.items:
                assert item.time is not None
                assert item.type is not None
                assert item.title is not None
                assert item.description is not None
                # duration_min can be None for point-in-time interventions


class TestLightTimingLogic:
    """Tests for sleep-aware light intervention timing."""

    def test_advance_light_seek_at_wake_time(self):
        """ADVANCE light_seek should be at or after wake time (not during sleep)."""
        from datetime import time
        from circadian.light_prc import generate_light_windows

        wake = time(7, 0)
        sleep = time(23, 0)
        cbtmin = time(4, 30)  # PRC optimal would be 06:30 (during sleep)

        interventions = generate_light_windows(wake, sleep, cbtmin, "advance")
        light_seek = next(i for i in interventions if i.type == "light_seek")

        # Should be at wake time (07:00), not 06:30
        assert light_seek.time == "07:00", \
            f"Expected light_seek at 07:00, got {light_seek.time}"

    def test_delay_light_seek_evening_timing(self):
        """DELAY light_seek should be in evening (2-3h before sleep), not pre-dawn."""
        from datetime import time
        from circadian.light_prc import generate_light_windows

        wake = time(7, 0)
        sleep = time(23, 0)
        cbtmin = time(4, 30)

        interventions = generate_light_windows(wake, sleep, cbtmin, "delay")
        light_seek = next(i for i in interventions if i.type == "light_seek")

        # Should be evening (around 20:00), not 02:30
        seek_hour = int(light_seek.time.split(":")[0])
        assert 18 <= seek_hour <= 22, \
            f"Expected evening time (18-22), got {light_seek.time}"

    def test_light_avoid_truncated_to_waking_hours(self):
        """light_avoid should be truncated to waking hours when it overlaps sleep."""
        from datetime import time
        from circadian.light_prc import generate_light_windows

        wake = time(7, 0)
        sleep = time(23, 0)
        cbtmin = time(6, 0)  # Avoid window 02:00-06:00 overlaps sleep; 06:00-10:00 partially awake

        # For DELAY: avoid window is 06:00-10:00 (CBTmin to CBTmin+4h)
        # Start is at 6am (during sleep), should be truncated to 7am wake
        interventions = generate_light_windows(wake, sleep, cbtmin, "delay")
        light_avoid = [i for i in interventions if i.type == "light_avoid"]

        if light_avoid:
            avoid = light_avoid[0]
            avoid_hour = int(avoid.time.split(":")[0])
            # Should start at or after wake time (7)
            assert avoid_hour >= 7, \
                f"light_avoid should start at wake time or later, got {avoid.time}"

    def test_light_avoid_fully_during_sleep_not_shown(self):
        """light_avoid should not appear if entirely during sleep."""
        from datetime import time
        from circadian.light_prc import generate_light_windows

        wake = time(7, 0)
        sleep = time(23, 0)
        cbtmin = time(4, 30)

        # ADVANCE avoid window (00:30-04:30) is fully during sleep (23:00-07:00)
        interventions = generate_light_windows(wake, sleep, cbtmin, "advance")
        light_avoid = [i for i in interventions if i.type == "light_avoid"]

        # Should be empty since the entire window is during sleep
        assert len(light_avoid) == 0, \
            f"light_avoid should not appear when fully during sleep, got {light_avoid}"

    def test_schedule_always_has_light_seek(self, generator, eastward_request):
        """Schedules should always include light_seek on every day (primary intervention)."""
        response = generator.generate_schedule(eastward_request)

        for day in response.interventions:
            types = [item.type for item in day.items]
            assert "light_seek" in types, \
                f"Day {day.day} missing light_seek - all days should have light guidance"

    def test_schedule_always_has_light_seek_delay(self, generator, westward_request):
        """Delay schedules should always include light_seek on every day."""
        response = generator.generate_schedule(westward_request)

        for day in response.interventions:
            types = [item.type for item in day.items]
            assert "light_seek" in types, \
                f"Day {day.day} missing light_seek - all days should have light guidance"

    def test_light_avoid_duration_adjusted(self):
        """light_avoid duration should be adjusted when truncated to waking hours."""
        from datetime import time
        from circadian.light_prc import generate_light_windows

        wake = time(7, 0)
        sleep = time(23, 0)
        cbtmin = time(6, 0)

        # For DELAY: avoid window is 06:00-10:00 (4 hours)
        # Truncated to 07:00-10:00 (3 hours = 180 min)
        interventions = generate_light_windows(wake, sleep, cbtmin, "delay")
        light_avoid = [i for i in interventions if i.type == "light_avoid"]

        if light_avoid:
            avoid = light_avoid[0]
            # Duration should be less than original 240 min
            assert avoid.duration_min < 240, \
                f"Duration should be truncated, got {avoid.duration_min}"


class TestLateStartFiltering:
    """Tests for filtering past interventions when generating late in the day."""

    def _time_to_minutes(self, time_str: str) -> int:
        """Convert HH:MM to minutes since midnight."""
        parts = time_str.split(":")
        return int(parts[0]) * 60 + int(parts[1])

    def test_same_day_filters_past_interventions(self, generator, late_start_request):
        """Interventions before current time should be filtered on today."""
        from datetime import datetime, timedelta

        # Simulate generating at 10:00 AM today
        now = datetime.now().replace(hour=10, minute=0, second=0, microsecond=0)

        response = generator.generate_schedule(late_start_request, current_datetime=now)

        # Find today's schedule
        today_date = now.date().isoformat()
        today_schedule = next(
            (d for d in response.interventions if d.date == today_date),
            None
        )

        if today_schedule:
            # With 30-min buffer, cutoff is 09:30
            cutoff_minutes = 9 * 60 + 30

            for intervention in today_schedule.items:
                # Skip preserved types
                if intervention.type in ("sleep_target", "wake_target"):
                    continue

                intervention_minutes = self._time_to_minutes(intervention.time)
                assert intervention_minutes >= cutoff_minutes, \
                    f"Intervention {intervention.type} at {intervention.time} should be filtered (cutoff 09:30)"

    def test_sleep_wake_targets_always_preserved(self, generator, late_start_request):
        """Sleep and wake targets should never be filtered even if past."""
        from datetime import datetime

        # Simulate generating at 2:00 PM (after morning wake_target)
        now = datetime.now().replace(hour=14, minute=0, second=0, microsecond=0)

        response = generator.generate_schedule(late_start_request, current_datetime=now)

        # Find today's schedule
        today_date = now.date().isoformat()
        today_schedule = next(
            (d for d in response.interventions if d.date == today_date),
            None
        )

        if today_schedule:
            types = [item.type for item in today_schedule.items]
            assert "wake_target" in types, "wake_target should always be preserved"
            assert "sleep_target" in types, "sleep_target should always be preserved"

    def test_future_days_not_filtered(self, generator, late_start_request):
        """Days in the future should not have any interventions filtered."""
        from datetime import datetime

        # Generate at 10 AM today
        now = datetime.now().replace(hour=10, minute=0, second=0, microsecond=0)

        response = generator.generate_schedule(late_start_request, current_datetime=now)

        # Find tomorrow's schedule (flight day)
        tomorrow_date = (now.date() + __import__('datetime').timedelta(days=1)).isoformat()
        tomorrow_schedule = next(
            (d for d in response.interventions if d.date == tomorrow_date),
            None
        )

        if tomorrow_schedule:
            # Future days should have morning interventions (if any exist)
            # At minimum, wake_target should exist at whatever the shifted time is
            types = [item.type for item in tomorrow_schedule.items]
            assert "wake_target" in types, "Future days should have wake_target"

    def test_30_minute_buffer_includes_near_future(self, generator):
        """Interventions within 30 minutes of now should be included."""
        from datetime import datetime, timedelta
        from circadian.types import TripLeg, ScheduleRequest

        # Create a request where we generate at exactly 09:15
        # An intervention at 09:00 should be filtered (35 min ago)
        # An intervention at 09:00 should be filtered (buffer is 30 min, so cutoff is 08:45)
        now = datetime.now().replace(hour=9, minute=15, second=0, microsecond=0)
        tomorrow = now + timedelta(days=1)

        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Asia/Singapore",
                    departure_datetime=tomorrow.strftime("%Y-%m-%dT09:00"),
                    arrival_datetime=(tomorrow + timedelta(hours=18)).strftime("%Y-%m-%dT17:00")
                )
            ],
            prep_days=3,
            wake_time="06:00",
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
            uses_exercise=False
        )

        response = generator.generate_schedule(request, current_datetime=now)

        # Find today's schedule
        today_date = now.date().isoformat()
        today_schedule = next(
            (d for d in response.interventions if d.date == today_date),
            None
        )

        if today_schedule:
            # Cutoff should be 08:45 (09:15 - 30 min)
            # Any intervention at 08:45 or later should be included
            cutoff_minutes = 8 * 60 + 45

            for intervention in today_schedule.items:
                if intervention.type in ("sleep_target", "wake_target"):
                    continue

                intervention_minutes = self._time_to_minutes(intervention.time)
                assert intervention_minutes >= cutoff_minutes, \
                    f"Intervention at {intervention.time} should be included (cutoff 08:45)"
