"""
Tests for intervention sorting logic.

Verifies that:
1. sleep_target at early AM (00:00-05:59) sorts as "late night" (end of day)
2. wake_target at early AM sorts as early morning (start of day)
3. Other interventions sort chronologically
"""

import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from circadian.scheduling.constraint_filter import ConstraintFilter
from circadian.types import Intervention, TravelPhase


class TestLateNightSorting:
    """Test that only sleep_target is treated as late night."""

    def _make_intervention(self, itype: str, time_str: str) -> Intervention:
        """Helper to create test interventions."""
        return Intervention(
            type=itype, time=time_str, title=f"Test {itype}", description="Test description"
        )

    def _make_phase(self, start_hour: int = 6, end_hour: int = 23) -> TravelPhase:
        """Helper to create a test phase."""
        base_date = datetime(2025, 1, 15)
        return TravelPhase(
            phase_type="adaptation",
            start_datetime=base_date.replace(hour=start_hour),
            end_datetime=base_date.replace(hour=end_hour),
            timezone="Europe/London",
            cumulative_shift=5.0,
            remaining_shift=0.0,
            day_number=2,
            available_for_interventions=True,
        )

    def test_sleep_target_at_2am_sorts_last(self):
        """sleep_target at 2:00 AM should sort after evening activities."""
        cf = ConstraintFilter()

        # Create phase that allows these times (crosses midnight)
        _phase = TravelPhase(
            phase_type="adaptation",
            start_datetime=datetime(2025, 1, 15, 10, 0),  # 10:00
            end_datetime=datetime(2025, 1, 16, 3, 0),  # 03:00 next day
            timezone="Europe/London",
            cumulative_shift=5.0,
            remaining_shift=0.0,
            day_number=2,
            available_for_interventions=True,
        )

        interventions = [
            self._make_intervention("sleep_target", "02:00"),  # Should be LAST
            self._make_intervention("caffeine_cutoff", "16:00"),
            self._make_intervention("wake_target", "10:00"),  # Should be FIRST
            self._make_intervention("melatonin", "19:00"),
        ]

        sorted_interventions = cf._sort_interventions(interventions)

        # wake_target should be first, sleep_target should be last
        assert sorted_interventions[0].type == "wake_target", (
            f"Expected wake_target first, got {sorted_interventions[0].type}"
        )
        assert sorted_interventions[-1].type == "sleep_target", (
            f"Expected sleep_target last, got {sorted_interventions[-1].type}"
        )

    def test_wake_target_at_4am_sorts_first(self):
        """wake_target at 4:00 AM should sort FIRST, not as late night."""
        cf = ConstraintFilter()

        # Phase that includes early morning
        _phase = TravelPhase(
            phase_type="pre_departure",
            start_datetime=datetime(2025, 1, 15, 4, 0),  # 04:00
            end_datetime=datetime(2025, 1, 15, 22, 0),  # 22:00
            timezone="America/Los_Angeles",
            cumulative_shift=3.0,
            remaining_shift=5.0,
            day_number=-1,
            available_for_interventions=True,
        )

        interventions = [
            self._make_intervention("caffeine_cutoff", "10:00"),
            self._make_intervention("wake_target", "04:00"),  # Should be FIRST
            self._make_intervention("melatonin", "14:00"),
            self._make_intervention("sleep_target", "20:00"),  # Should be LAST
        ]

        sorted_interventions = cf._sort_interventions(interventions)

        # wake_target at 4am should be first (not treated as late night)
        assert sorted_interventions[0].type == "wake_target", (
            f"Expected wake_target at 4am to be first, got {sorted_interventions[0].type}"
        )
        assert sorted_interventions[0].time == "04:00"

    def test_wake_target_at_5am_sorts_first(self):
        """wake_target at 5:00 AM should also sort FIRST."""
        cf = ConstraintFilter()

        interventions = [
            self._make_intervention("melatonin", "13:00"),
            self._make_intervention("wake_target", "05:00"),  # Should be FIRST
            self._make_intervention("caffeine_cutoff", "11:00"),
            self._make_intervention("sleep_target", "21:00"),
        ]

        sorted_interventions = cf._sort_interventions(interventions)

        assert sorted_interventions[0].type == "wake_target", (
            f"Expected wake_target at 5am first, got {sorted_interventions[0].type}"
        )

    def test_light_seek_at_5am_sorts_early(self):
        """light_seek at 5:00 AM should sort as early morning, not late night."""
        cf = ConstraintFilter()

        interventions = [
            self._make_intervention("caffeine_cutoff", "14:00"),
            self._make_intervention("light_seek", "05:30"),  # Should be early
            self._make_intervention("sleep_target", "22:00"),
        ]

        sorted_interventions = cf._sort_interventions(interventions)

        # light_seek at 5:30 should come before 14:00 caffeine_cutoff
        assert sorted_interventions[0].type == "light_seek", (
            f"Expected light_seek at 5:30 to be first, got {sorted_interventions[0].type}"
        )

    def test_sleep_target_at_1am_sorts_after_11pm(self):
        """sleep_target at 1:00 AM should sort after sleep_target at 11:00 PM."""
        cf = ConstraintFilter()

        interventions = [
            self._make_intervention("sleep_target", "01:00"),  # Late night - should be last
            self._make_intervention("wake_target", "10:00"),
            self._make_intervention("melatonin", "23:00"),  # 11 PM
        ]

        sorted_interventions = cf._sort_interventions(interventions)

        # Order should be: wake (10:00), melatonin (23:00), sleep (01:00 as late night)
        assert sorted_interventions[0].type == "wake_target"
        assert sorted_interventions[1].type == "melatonin"
        assert sorted_interventions[2].type == "sleep_target"


class TestChronologicalSorting:
    """Test that same-type interventions sort chronologically."""

    def _make_intervention(self, itype: str, time_str: str) -> Intervention:
        return Intervention(
            type=itype, time=time_str, title=f"Test {itype}", description="Test description"
        )

    def test_daytime_activities_sort_chronologically(self):
        """Activities during normal hours should sort by time."""
        cf = ConstraintFilter()

        interventions = [
            self._make_intervention("caffeine_cutoff", "15:00"),
            self._make_intervention("light_seek", "08:00"),
            self._make_intervention("melatonin", "18:00"),
            self._make_intervention("light_avoid", "20:00"),
        ]

        sorted_interventions = cf._sort_interventions(interventions)
        times = [i.time for i in sorted_interventions]

        # Should be in chronological order
        assert times == ["08:00", "15:00", "18:00", "20:00"], (
            f"Expected chronological order, got {times}"
        )

    def test_same_time_priority_ordering(self):
        """Items at same time should follow priority: wake > light > caffeine > sleep."""
        cf = ConstraintFilter()

        interventions = [
            self._make_intervention("sleep_target", "22:00"),
            self._make_intervention("caffeine_cutoff", "10:00"),
            self._make_intervention("wake_target", "10:00"),  # Same time as caffeine
            self._make_intervention("light_seek", "10:00"),  # Same time
        ]

        sorted_interventions = cf._sort_interventions(interventions)

        # At 10:00, order should be: wake_target, light_seek, caffeine_cutoff
        ten_am_items = [i for i in sorted_interventions if i.time == "10:00"]
        types_at_10 = [i.type for i in ten_am_items]

        assert types_at_10[0] == "wake_target", (
            f"wake_target should come first at 10:00, got {types_at_10}"
        )
        assert types_at_10[1] == "light_seek", (
            f"light_seek should come second at 10:00, got {types_at_10}"
        )


class TestFlightDaySorting:
    """Test sorting scenarios specific to flight day."""

    def _make_intervention(self, itype: str, time_str: str) -> Intervention:
        return Intervention(
            type=itype, time=time_str, title=f"Test {itype}", description="Test description"
        )

    def test_flight_day_early_wake_sorts_first(self):
        """On flight day, wake_target at 4:00 AM should be first."""
        cf = ConstraintFilter()

        # Typical flight day scenario: early wake, evening departure
        interventions = [
            self._make_intervention("sleep_target", "19:00"),
            self._make_intervention("caffeine_cutoff", "09:00"),
            self._make_intervention("wake_target", "04:00"),  # Early wake
            self._make_intervention("melatonin", "12:00"),
        ]

        sorted_interventions = cf._sort_interventions(interventions)

        assert sorted_interventions[0].type == "wake_target"
        assert sorted_interventions[0].time == "04:00"
        # sleep_target at 19:00 is last (evening, not late night)
        assert sorted_interventions[-1].type == "sleep_target"


class TestSleepTargetNearDeparture:
    """Test filtering of sleep_target within 4 hours of departure."""

    def _make_intervention(self, itype: str, time_str: str) -> Intervention:
        return Intervention(
            type=itype, time=time_str, title=f"Test {itype}", description="Test description"
        )

    def _make_phase(self, start_hour: int = 6, end_hour: int = 22) -> TravelPhase:
        """Helper to create a pre-departure test phase."""
        base_date = datetime(2025, 1, 15)
        return TravelPhase(
            phase_type="pre_departure",
            start_datetime=base_date.replace(hour=start_hour),
            end_datetime=base_date.replace(hour=end_hour),
            timezone="America/Los_Angeles",
            cumulative_shift=3.0,
            remaining_shift=5.0,
            day_number=0,
            available_for_interventions=True,
        )

    def test_sleep_target_within_4h_of_departure_filtered(self):
        """sleep_target within 4h of departure should be filtered out."""
        cf = ConstraintFilter()

        # Flight at 20:45, sleep_target at 19:00 (1h 45m before) - should be filtered
        phase = self._make_phase(start_hour=6, end_hour=17)  # Phase ends at airport time
        departure = datetime(2025, 1, 15, 20, 45)  # 8:45 PM departure

        interventions = [
            self._make_intervention("wake_target", "06:00"),
            self._make_intervention("light_seek", "08:00"),
            self._make_intervention("sleep_target", "19:00"),  # 1h 45m before - FILTER
        ]

        filtered = cf.filter_phase(interventions, phase, departure)

        # sleep_target should be filtered out
        types = [i.type for i in filtered]
        assert "sleep_target" not in types, (
            f"sleep_target within 4h of departure should be filtered, got {types}"
        )

        # Check violation was recorded
        sleep_violations = [v for v in cf.violations if v.intervention_type == "sleep_target"]
        assert len(sleep_violations) == 1
        assert "departure" in sleep_violations[0].reason.lower()

    def test_sleep_target_exactly_4h_before_departure_filtered(self):
        """sleep_target exactly 4h before departure should be filtered."""
        cf = ConstraintFilter()

        # Flight at 20:00, sleep_target at 16:00 (exactly 4h before) - should be filtered
        phase = self._make_phase(start_hour=6, end_hour=17)
        departure = datetime(2025, 1, 15, 20, 0)

        interventions = [
            self._make_intervention("wake_target", "06:00"),
            self._make_intervention("sleep_target", "16:00"),  # Exactly 4h before - FILTER
        ]

        filtered = cf.filter_phase(interventions, phase, departure)

        types = [i.type for i in filtered]
        assert "sleep_target" not in types, (
            "sleep_target exactly 4h before departure should be filtered"
        )

    def test_sleep_target_more_than_4h_before_departure_kept(self):
        """sleep_target more than 4h before departure should be kept."""
        cf = ConstraintFilter()

        # Flight at 22:00, sleep_target at 17:00 (5h before) - should be KEPT
        phase = self._make_phase(start_hour=6, end_hour=19)
        departure = datetime(2025, 1, 15, 22, 0)

        interventions = [
            self._make_intervention("wake_target", "06:00"),
            self._make_intervention("sleep_target", "17:00"),  # 5h before - KEEP
        ]

        filtered = cf.filter_phase(interventions, phase, departure)

        types = [i.type for i in filtered]
        assert "sleep_target" in types, (
            f"sleep_target 5h before departure should be kept, got {types}"
        )

    def test_sleep_target_after_departure_kept(self):
        """sleep_target after departure time should be kept (edge case)."""
        cf = ConstraintFilter()

        # Flight at 10:00, sleep_target at 22:00 (after departure, different phase)
        phase = self._make_phase(start_hour=6, end_hour=23)
        departure = datetime(2025, 1, 15, 10, 0)

        interventions = [
            self._make_intervention("wake_target", "06:00"),
            self._make_intervention("sleep_target", "22:00"),  # After departure - KEEP
        ]

        filtered = cf.filter_phase(interventions, phase, departure)

        types = [i.type for i in filtered]
        assert "sleep_target" in types, f"sleep_target after departure should be kept, got {types}"

    def test_wake_target_not_affected_by_departure_proximity(self):
        """wake_target should never be filtered based on departure time."""
        cf = ConstraintFilter()

        # Flight at 08:00, wake_target at 06:00 (2h before) - should be KEPT
        phase = self._make_phase(start_hour=6, end_hour=7)
        departure = datetime(2025, 1, 15, 8, 0)

        interventions = [
            self._make_intervention("wake_target", "06:00"),  # 2h before - still KEEP
        ]

        filtered = cf.filter_phase(interventions, phase, departure)

        types = [i.type for i in filtered]
        assert "wake_target" in types, "wake_target should never be filtered by departure proximity"

    def test_no_departure_time_sleep_target_kept(self):
        """Without departure_datetime, sleep_target should always be kept."""
        cf = ConstraintFilter()

        phase = self._make_phase(start_hour=6, end_hour=23)

        interventions = [
            self._make_intervention("wake_target", "06:00"),
            self._make_intervention("sleep_target", "22:00"),
        ]

        # No departure_datetime passed
        filtered = cf.filter_phase(interventions, phase, departure_datetime=None)

        types = [i.type for i in filtered]
        assert "sleep_target" in types, (
            "sleep_target should be kept when no departure_datetime provided"
        )
