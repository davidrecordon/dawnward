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

    def test_light_interventions_always_present(self, generator, eastward_request):
        """Light seek and avoid should always be generated."""
        response = generator.generate_schedule(eastward_request)
        all_types = []
        for day in response.interventions:
            all_types.extend([item.type for item in day.items])

        assert "light_seek" in all_types, "Should have light_seek interventions"
        assert "light_avoid" in all_types, "Should have light_avoid interventions"

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
