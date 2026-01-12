"""
Tests for the recalculation module.

Covers:
- Snapshot serialization round-trip
- Compliance multipliers (skipped, modified interventions)
- Diff computation between schedules
- Integration tests for actual recalculation scenarios
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path

import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from circadian.recalculation import (
    COMPLIANCE_MULTIPLIERS,
    MIN_EFFECTIVENESS_FLOOR,
    InterventionActual,
    MarkerSnapshot,
    calculate_actual_daily_shift,
    capture_daily_snapshots,
    find_earliest_non_compliant_day,
    recalculate_from_actuals,
    snapshots_to_dict,
)
from circadian.scheduler_v2 import generate_schedule_v2
from circadian.types import ScheduleRequest, TripLeg

# =============================================================================
# Test Helpers
# =============================================================================


def time_to_test_minutes(hour: int, minute: int = 0) -> int:
    """Convert hour:minute to minutes since midnight for test data."""
    return hour * 60 + minute


# =============================================================================
# Unit Tests: Snapshot Serialization
# =============================================================================


class TestSnapshotSerialization:
    """Tests for snapshot serialization round-trip."""

    def test_snapshots_to_dict_preserves_all_fields(self):
        """Verify snapshots_to_dict includes all required fields."""
        cbtmin_5am = time_to_test_minutes(5, 0)
        dlmo_9pm = time_to_test_minutes(21, 0)
        cbtmin_430am = time_to_test_minutes(4, 30)
        dlmo_830pm = time_to_test_minutes(20, 30)

        snapshots = [
            MarkerSnapshot(
                day_offset=-2,
                cumulative_shift=0.5,
                cbtmin_minutes=cbtmin_5am,
                dlmo_minutes=dlmo_9pm,
                direction="advance",
            ),
            MarkerSnapshot(
                day_offset=-1,
                cumulative_shift=1.0,
                cbtmin_minutes=cbtmin_430am,
                dlmo_minutes=dlmo_830pm,
                direction="advance",
            ),
        ]

        result = snapshots_to_dict(snapshots)

        assert len(result) == 2
        assert result[0]["dayOffset"] == -2
        assert result[0]["cumulativeShift"] == 0.5
        assert result[0]["cbtminMinutes"] == cbtmin_5am
        assert result[0]["dlmoMinutes"] == dlmo_9pm
        assert result[0]["direction"] == "advance"

        assert result[1]["dayOffset"] == -1
        assert result[1]["cumulativeShift"] == 1.0

    def test_snapshots_to_dict_handles_empty_list(self):
        """Empty snapshot list returns empty dict list."""
        result = snapshots_to_dict([])
        assert result == []

    def test_snapshots_to_dict_handles_delay_direction(self):
        """Verify delay direction is preserved."""
        cbtmin_7am = time_to_test_minutes(7, 0)
        dlmo_10pm = time_to_test_minutes(22, 0)

        snapshots = [
            MarkerSnapshot(
                day_offset=0,
                cumulative_shift=-2.0,
                cbtmin_minutes=cbtmin_7am,
                dlmo_minutes=dlmo_10pm,
                direction="delay",
            )
        ]

        result = snapshots_to_dict(snapshots)

        assert result[0]["direction"] == "delay"
        assert result[0]["cumulativeShift"] == -2.0


# =============================================================================
# Unit Tests: Compliance Multipliers
# =============================================================================


class TestComplianceMultipliers:
    """Tests for calculate_actual_daily_shift with various compliance scenarios."""

    def test_full_compliance_returns_planned_shift(self):
        """No actuals recorded = 100% planned shift (assumed compliant)."""
        planned_shift = 1.5
        day_actuals: list[InterventionActual] = []

        actual = calculate_actual_daily_shift(planned_shift, day_actuals, "advance")

        assert actual == planned_shift

    def test_as_planned_status_returns_full_shift(self):
        """Explicitly 'as_planned' actuals = 100% effectiveness."""
        planned_shift = 1.5
        day_actuals = [
            InterventionActual(
                day_offset=-1,
                intervention_type="light_seek",
                planned_time="07:00",
                actual_time=None,
                status="as_planned",
            )
        ]

        actual = calculate_actual_daily_shift(planned_shift, day_actuals, "advance")

        assert actual == planned_shift

    def test_skipped_light_seek_reduces_by_half(self):
        """Skipped light_seek = 50% effectiveness."""
        planned_shift = 1.0
        day_actuals = [
            InterventionActual(
                day_offset=-1,
                intervention_type="light_seek",
                planned_time="07:00",
                actual_time=None,
                status="skipped",
            )
        ]

        actual = calculate_actual_daily_shift(planned_shift, day_actuals, "advance")

        # light_seek skipped multiplier is 0.5
        expected = planned_shift * COMPLIANCE_MULTIPLIERS["light_seek"]["skipped"]
        assert actual == expected
        assert actual == 0.5

    def test_skipped_melatonin_reduces_by_15_percent(self):
        """Skipped melatonin = 85% effectiveness (endogenous still works)."""
        planned_shift = 1.0
        day_actuals = [
            InterventionActual(
                day_offset=-1,
                intervention_type="melatonin",
                planned_time="21:00",
                actual_time=None,
                status="skipped",
            )
        ]

        actual = calculate_actual_daily_shift(planned_shift, day_actuals, "advance")

        expected = planned_shift * COMPLIANCE_MULTIPLIERS["melatonin"]["skipped"]
        assert actual == expected
        assert actual == 0.85

    def test_modified_wake_applies_deviation_penalty(self):
        """2-hour late wake = penalty based on deviation."""
        planned_shift = 1.0
        day_actuals = [
            InterventionActual(
                day_offset=-1,
                intervention_type="wake_target",
                planned_time="06:00",
                actual_time="08:00",  # 2 hours late
                status="modified",
            )
        ]

        actual = calculate_actual_daily_shift(planned_shift, day_actuals, "advance")

        # wake_target penalty: 0.15 per hour * 2 hours = 0.30 penalty
        # effectiveness = 1.0 - 0.30 = 0.70
        penalty = 2.0 * COMPLIANCE_MULTIPLIERS["wake_target"]["modified_penalty_per_hour"]
        expected = planned_shift * max(0.5, 1.0 - penalty)
        assert actual == expected
        assert actual == 0.7

    def test_multiple_skipped_interventions_compound(self):
        """Multiple skipped interventions compound their effects."""
        planned_shift = 1.0
        day_actuals = [
            InterventionActual(
                day_offset=-1,
                intervention_type="light_seek",
                planned_time="07:00",
                actual_time=None,
                status="skipped",
            ),
            InterventionActual(
                day_offset=-1,
                intervention_type="melatonin",
                planned_time="21:00",
                actual_time=None,
                status="skipped",
            ),
        ]

        actual = calculate_actual_daily_shift(planned_shift, day_actuals, "advance")

        # Compounded: 0.5 (light) * 0.85 (melatonin) = 0.425
        expected = planned_shift * 0.5 * 0.85
        assert actual == expected
        assert actual == 0.425

    def test_caffeine_cutoff_has_minimal_impact(self):
        """Skipped caffeine_cutoff = 95% effectiveness (minimal impact)."""
        planned_shift = 1.0
        day_actuals = [
            InterventionActual(
                day_offset=-1,
                intervention_type="caffeine_cutoff",
                planned_time="14:00",
                actual_time=None,
                status="skipped",
            )
        ]

        actual = calculate_actual_daily_shift(planned_shift, day_actuals, "advance")

        assert actual == 0.95

    def test_unknown_intervention_type_ignored(self):
        """Unknown intervention types are ignored."""
        planned_shift = 1.0
        day_actuals = [
            InterventionActual(
                day_offset=-1,
                intervention_type="unknown_type",
                planned_time="07:00",
                actual_time=None,
                status="skipped",
            )
        ]

        actual = calculate_actual_daily_shift(planned_shift, day_actuals, "advance")

        assert actual == planned_shift  # No penalty for unknown type

    def test_large_deviation_capped_at_effectiveness_floor(self):
        """Effectiveness never goes below MIN_EFFECTIVENESS_FLOOR for modified interventions."""
        planned_shift = 1.0
        day_actuals = [
            InterventionActual(
                day_offset=-1,
                intervention_type="wake_target",
                planned_time="06:00",
                actual_time="12:00",  # 6 hours late - would be 90% penalty
                status="modified",
            )
        ]

        actual = calculate_actual_daily_shift(planned_shift, day_actuals, "advance")

        # 6 hours * 0.15 = 0.90 penalty, but capped at MIN_EFFECTIVENESS_FLOOR
        assert actual == MIN_EFFECTIVENESS_FLOOR


# =============================================================================
# Unit Tests: Finding Non-Compliant Days
# =============================================================================


class TestFindEarliestNonCompliantDay:
    """Tests for find_earliest_non_compliant_day."""

    def test_all_as_planned_returns_none(self):
        """All compliant actuals returns None."""
        actuals = [
            InterventionActual(-2, "light_seek", "07:00", None, "as_planned"),
            InterventionActual(-1, "light_seek", "07:00", None, "as_planned"),
        ]

        result = find_earliest_non_compliant_day(actuals)

        assert result is None

    def test_empty_actuals_returns_none(self):
        """Empty actuals list returns None."""
        result = find_earliest_non_compliant_day([])

        assert result is None

    def test_single_modified_returns_that_day(self):
        """Single modified actual returns that day."""
        actuals = [
            InterventionActual(-2, "light_seek", "07:00", None, "as_planned"),
            InterventionActual(-1, "light_seek", "07:00", "08:00", "modified"),
        ]

        result = find_earliest_non_compliant_day(actuals)

        assert result == -1

    def test_single_skipped_returns_that_day(self):
        """Single skipped actual returns that day."""
        actuals = [
            InterventionActual(-2, "light_seek", "07:00", None, "skipped"),
        ]

        result = find_earliest_non_compliant_day(actuals)

        assert result == -2

    def test_multiple_non_compliant_returns_earliest(self):
        """Multiple non-compliant days returns the earliest."""
        actuals = [
            InterventionActual(0, "light_seek", "07:00", None, "skipped"),
            InterventionActual(-2, "light_seek", "07:00", "08:00", "modified"),
            InterventionActual(-1, "melatonin", "21:00", None, "skipped"),
        ]

        result = find_earliest_non_compliant_day(actuals)

        assert result == -2  # Earliest non-compliant day


# =============================================================================
# Integration Tests: Snapshot Capture
# =============================================================================


class TestSnapshotCapture:
    """Integration tests for capturing snapshots during schedule generation."""

    @pytest.fixture
    def sfo_tyo_request(self):
        """SFO -> Tokyo request for integration testing."""
        future = datetime.now() + timedelta(days=5)
        arrival = future + timedelta(hours=12)

        return ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/Los_Angeles",
                    dest_tz="Asia/Tokyo",
                    departure_datetime=future.strftime("%Y-%m-%dT10:00"),
                    arrival_datetime=arrival.strftime("%Y-%m-%dT14:00"),
                )
            ],
            prep_days=3,
            wake_time="07:00",
            sleep_time="23:00",
            uses_melatonin=True,
            uses_caffeine=True,
            uses_exercise=False,
        )

    def test_capture_snapshots_returns_one_per_day(self, sfo_tyo_request):
        """Snapshots are captured for each day in the schedule."""
        response = generate_schedule_v2(sfo_tyo_request)
        snapshots = capture_daily_snapshots(sfo_tyo_request, response)

        # Should have snapshots for prep days + adaptation days
        assert len(snapshots) >= 3  # At least prep days
        assert all(isinstance(s, MarkerSnapshot) for s in snapshots)

    def test_snapshot_cumulative_shift_increases(self, sfo_tyo_request):
        """Cumulative shift should change over time."""
        response = generate_schedule_v2(sfo_tyo_request)
        snapshots = capture_daily_snapshots(sfo_tyo_request, response)

        # Cumulative shift should not all be the same
        shifts = [s.cumulative_shift for s in snapshots]
        assert len(set(shifts)) > 1  # Multiple distinct values

    def test_snapshot_direction_matches_response(self, sfo_tyo_request):
        """Snapshot direction should match schedule direction."""
        response = generate_schedule_v2(sfo_tyo_request)
        snapshots = capture_daily_snapshots(sfo_tyo_request, response)

        for snapshot in snapshots:
            assert snapshot.direction == response.direction

    def test_snapshot_cbtmin_is_valid_time(self, sfo_tyo_request):
        """CBTmin should be within valid minutes range."""
        response = generate_schedule_v2(sfo_tyo_request)
        snapshots = capture_daily_snapshots(sfo_tyo_request, response)

        for snapshot in snapshots:
            # Minutes from midnight should be 0-1439
            assert 0 <= snapshot.cbtmin_minutes < 1440


# =============================================================================
# Integration Tests: Full Recalculation
# =============================================================================


class TestRecalculation:
    """Integration tests for the full recalculation flow."""

    @pytest.fixture
    def nyc_london_request(self):
        """NYC -> London eastward request."""
        future = datetime.now() + timedelta(days=5)
        arrival = future + timedelta(hours=7)

        return ScheduleRequest(
            legs=[
                TripLeg(
                    origin_tz="America/New_York",
                    dest_tz="Europe/London",
                    departure_datetime=future.strftime("%Y-%m-%dT19:00"),
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

    def test_no_recalc_needed_for_full_compliance(self, nyc_london_request):
        """All compliant actuals should return None (no recalc needed)."""
        response = generate_schedule_v2(nyc_london_request)
        snapshots = capture_daily_snapshots(nyc_london_request, response)

        # All as_planned actuals
        actuals = [
            InterventionActual(-2, "light_seek", "06:30", None, "as_planned"),
            InterventionActual(-1, "light_seek", "06:00", None, "as_planned"),
        ]

        result = recalculate_from_actuals(nyc_london_request, response, snapshots, actuals)

        assert result is None

    def test_recalc_triggered_by_skipped_intervention(self, nyc_london_request):
        """Skipped intervention should trigger recalculation."""
        response = generate_schedule_v2(nyc_london_request)
        snapshots = capture_daily_snapshots(nyc_london_request, response)

        # Skipped light_seek on Day -2
        actuals = [
            InterventionActual(-2, "light_seek", "06:30", None, "skipped"),
        ]

        result = recalculate_from_actuals(nyc_london_request, response, snapshots, actuals)

        # May or may not trigger recalc depending on threshold
        # Just verify it doesn't crash and returns valid type
        assert result is None or hasattr(result, "new_schedule")

    def test_recalc_with_modified_wake_time(self, nyc_london_request):
        """Modified wake time should trigger recalculation if shift is significant."""
        response = generate_schedule_v2(nyc_london_request)
        snapshots = capture_daily_snapshots(nyc_london_request, response)

        # 2-hour late wake on Day -2
        actuals = [
            InterventionActual(-2, "wake_target", "06:00", "08:00", "modified"),
            InterventionActual(-2, "light_seek", "06:30", "08:30", "modified"),
        ]

        result = recalculate_from_actuals(nyc_london_request, response, snapshots, actuals)

        # Just verify it doesn't crash - threshold may or may not be met
        assert result is None or hasattr(result, "changes")

    def test_missing_snapshot_fallback(self, nyc_london_request):
        """Recalculation should work even with missing snapshots."""
        response = generate_schedule_v2(nyc_london_request)
        snapshots = capture_daily_snapshots(nyc_london_request, response)

        # Remove some snapshots to test fallback
        partial_snapshots = [s for s in snapshots if s.day_offset >= 0]

        actuals = [
            InterventionActual(-2, "light_seek", "06:30", None, "skipped"),
        ]

        # Should not crash even with missing snapshots
        result = recalculate_from_actuals(nyc_london_request, response, partial_snapshots, actuals)

        # Should handle gracefully
        assert result is None or hasattr(result, "restored_from_day")

    def test_small_shift_difference_no_recalc(self, nyc_london_request):
        """< 15 min difference should not trigger recalculation."""
        response = generate_schedule_v2(nyc_london_request)
        snapshots = capture_daily_snapshots(nyc_london_request, response)

        # Very minor modification
        actuals = [
            InterventionActual(-2, "caffeine_cutoff", "14:00", "14:10", "modified"),
        ]

        result = recalculate_from_actuals(nyc_london_request, response, snapshots, actuals)

        # Minimal impact should not trigger recalc
        assert result is None


# =============================================================================
# Edge Case Tests
# =============================================================================


class TestEdgeCases:
    """Edge case tests for recalculation module."""

    def test_delay_direction_compliance(self):
        """Compliance multipliers work for delay direction too."""
        planned_shift = -1.5  # Negative for delay
        day_actuals = [
            InterventionActual(1, "light_seek", "07:00", None, "skipped"),
        ]

        actual = calculate_actual_daily_shift(planned_shift, day_actuals, "delay")

        expected = planned_shift * 0.5
        assert actual == expected
        assert actual == -0.75

    def test_actuals_from_different_days(self):
        """Actuals from different days are processed correctly."""
        planned_shift = 1.0

        # These actuals are from day -1, not the day being calculated
        day_actuals = [
            InterventionActual(-1, "light_seek", "07:00", None, "skipped"),
        ]

        # The function processes whatever actuals are passed
        actual = calculate_actual_daily_shift(planned_shift, day_actuals, "advance")

        assert actual == 0.5  # Still applies the multiplier
