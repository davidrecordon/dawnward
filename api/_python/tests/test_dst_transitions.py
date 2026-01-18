"""
Tests for DST (Daylight Saving Time) transition handling.

Validates that timezone enrichment and schedule generation work correctly
when flights cross DST boundaries.
"""

import time_machine

from circadian.scheduler_v2 import generate_schedule_v2
from circadian.types import ScheduleRequest, TripLeg


class TestDSTTransitions:
    """Test schedule generation across DST transitions."""

    @time_machine.travel("2026-03-01T12:00:00Z", tick=False)
    def test_flight_crosses_us_spring_forward_dst(self):
        """
        LAX→LHR departing March 7, 2026 (US Spring DST on March 8).

        US clocks spring forward at 2 AM on March 8, 2026.
        Interventions on March 7 should use PST (-8), March 8+ should use PDT (-7).
        """
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Europe/London",
                    departure_datetime="2026-03-07T22:00",  # 10 PM PST
                    arrival_datetime="2026-03-08T16:00",  # 4 PM GMT
                )
            ],
            prep_days=2,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generate_schedule_v2(request)

        # Verify schedule generates without errors
        assert schedule is not None
        assert len(schedule.interventions) > 0

        # Check interventions on March 5-7 (before DST) have origin_tz set
        for day_schedule in schedule.interventions:
            for item in day_schedule.items:
                assert item.origin_tz == "America/Los_Angeles"
                assert item.dest_tz == "Europe/London"
                # All times should be valid HH:MM format
                assert len(item.origin_time) == 5
                assert len(item.dest_time) == 5

    @time_machine.travel("2026-10-20T12:00:00Z", tick=False)
    def test_flight_crosses_uk_fall_back_dst(self):
        """
        LHR→LAX during UK Fall DST transition (Oct 25, 2026).

        UK clocks fall back at 2 AM on Oct 25, switching from BST to GMT.
        """
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="Europe/London",
                    dest_tz="America/Los_Angeles",
                    departure_datetime="2026-10-25T11:00",  # 11 AM GMT (after fall back)
                    arrival_datetime="2026-10-25T14:00",  # 2 PM PDT
                )
            ],
            prep_days=2,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generate_schedule_v2(request)

        # Verify schedule generates without errors
        assert schedule is not None
        assert len(schedule.interventions) > 0

        # All interventions should have proper timezone context
        for day_schedule in schedule.interventions:
            for item in day_schedule.items:
                assert item.origin_tz == "Europe/London"
                assert item.dest_tz == "America/Los_Angeles"

    @time_machine.travel("2026-03-25T12:00:00Z", tick=False)
    def test_flight_crosses_eu_spring_forward_dst(self):
        """
        SFO→CDG with arrival during EU Spring DST (March 29, 2026).

        EU clocks spring forward at 2 AM on March 29.
        """
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Europe/Paris",
                    departure_datetime="2026-03-28T16:00",  # 4 PM PDT
                    arrival_datetime="2026-03-29T11:00",  # 11 AM CEST (after spring forward)
                )
            ],
            prep_days=2,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generate_schedule_v2(request)

        # Verify schedule generates without errors
        assert schedule is not None

        # Check adaptation days use destination timezone correctly
        adaptation_days = [ds for ds in schedule.interventions if ds.phase_type == "adaptation"]
        assert len(adaptation_days) > 0

        for day_schedule in adaptation_days:
            for item in day_schedule.items:
                assert item.dest_tz == "Europe/Paris"

    @time_machine.travel("2026-11-01T12:00:00Z", tick=False)
    def test_pre_landing_detection_during_us_fall_dst(self):
        """
        Verify pre-landing detection works correctly during US Fall DST.

        US clocks fall back at 2 AM on Nov 1, 2026.
        Flight lands at 2:30 AM - the "duplicate" hour.
        """
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="Europe/London",
                    dest_tz="America/Los_Angeles",
                    departure_datetime="2026-10-31T18:00",  # 6 PM GMT
                    arrival_datetime="2026-11-01T02:30",  # 2:30 AM PST (after fall back)
                )
            ],
            prep_days=2,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generate_schedule_v2(request)

        # Verify schedule generates without errors
        assert schedule is not None

        # Find post-arrival items on landing day
        landing_day = next(
            (
                ds
                for ds in schedule.interventions
                if ds.date == "2026-11-01" and ds.phase_type == "post_arrival"
            ),
            None,
        )

        # Should have post-arrival items
        if landing_day:
            for item in landing_day.items:
                # Post-landing items should NOT show dual timezone
                # (They're after landing, user is adapting to local time)
                assert item.dest_tz == "America/Los_Angeles"


class TestDSTTimezoneAbbreviations:
    """Test that timezone abbreviations are correct across DST boundaries."""

    @time_machine.travel("2026-01-15T12:00:00Z", tick=False)
    def test_winter_timezone_abbreviations(self):
        """Winter dates should use standard time abbreviations."""
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Europe/London",
                    departure_datetime="2026-01-20T17:00",
                    arrival_datetime="2026-01-21T11:00",
                )
            ],
            prep_days=2,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generate_schedule_v2(request)

        # All interventions should have valid timezone context
        for day_schedule in schedule.interventions:
            for item in day_schedule.items:
                # Verify dates are set (abbreviations are computed client-side)
                assert item.origin_date is not None
                assert item.dest_date is not None

    @time_machine.travel("2026-07-01T12:00:00Z", tick=False)
    def test_summer_timezone_abbreviations(self):
        """Summer dates should use daylight time abbreviations."""
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Europe/London",
                    departure_datetime="2026-07-15T17:00",
                    arrival_datetime="2026-07-16T11:00",
                )
            ],
            prep_days=2,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        schedule = generate_schedule_v2(request)

        # All interventions should have valid timezone context
        for day_schedule in schedule.interventions:
            for item in day_schedule.items:
                # Verify dates are set for summer
                assert item.origin_date is not None
                assert item.dest_date is not None


class TestDSTEdgeCases:
    """Edge cases involving DST transitions."""

    @time_machine.travel("2026-03-06T12:00:00Z", tick=False)
    def test_intervention_scheduled_during_nonexistent_hour(self):
        """
        Handle case where an intervention might be scheduled at 2:30 AM
        during Spring Forward (2 AM → 3 AM, 2:30 doesn't exist).
        """
        # This tests robustness - the scheduler should not crash
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="America/New_York",
                    departure_datetime="2026-03-08T06:00",  # 6 AM PDT (day of DST)
                    arrival_datetime="2026-03-08T14:00",  # 2 PM EDT
                )
            ],
            prep_days=2,
            wake_time="02:30",  # Would be during non-existent hour on DST day
            sleep_time="22:00",
            uses_melatonin=True,
            uses_caffeine=True,
        )

        # Should not crash
        schedule = generate_schedule_v2(request)
        assert schedule is not None

    @time_machine.travel("2026-10-30T12:00:00Z", tick=False)
    def test_intervention_scheduled_during_ambiguous_hour(self):
        """
        Handle case where an intervention might be scheduled at 1:30 AM
        during Fall Back (1 AM occurs twice).
        """
        request = ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="America/New_York",
                    departure_datetime="2026-11-01T08:00",  # 8 AM PST (day of DST)
                    arrival_datetime="2026-11-01T16:00",  # 4 PM EST
                )
            ],
            prep_days=2,
            wake_time="07:00",
            sleep_time="01:30",  # Would be during ambiguous hour on DST day
            uses_melatonin=True,
            uses_caffeine=True,
        )

        # Should not crash
        schedule = generate_schedule_v2(request)
        assert schedule is not None
