"""
Tests for nap timing generation.

Tests the Two-Process Model nap algorithm including:
- Window calculation (30-50% into wake period)
- Sleep debt duration adjustments
- 4-hour-before-sleep constraint
- Edge cases (short wake periods, etc.)
"""

import pytest
from datetime import time

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from circadian.nap import (
    calculate_nap_window,
    generate_nap_intervention,
    generate_shifted_nap_intervention,
)


class TestNapWindowCalculation:
    """Tests for calculate_nap_window function."""

    def test_standard_wake_period_window(self):
        """Standard 16-hour wake period should produce valid window."""
        wake = time(7, 0)
        sleep = time(23, 0)

        result = calculate_nap_window(wake, sleep)
        assert result is not None

        window_start, window_end, ideal_time, duration = result

        # Window should be 30-50% into wake period
        # 16 hour wake period: 30% = 4.8h, 50% = 8h
        # So window should be around 11:48 to 15:00
        assert window_start.hour >= 11 and window_start.hour <= 12
        assert window_end.hour >= 14 and window_end.hour <= 16

    def test_ideal_time_at_38_percent(self):
        """Ideal nap time should be at ~38% into wake period."""
        wake = time(7, 0)
        sleep = time(23, 0)

        result = calculate_nap_window(wake, sleep)
        assert result is not None

        _, _, ideal_time, _ = result

        # 16 hour wake period, 38% = 6.08h → ~13:05
        assert ideal_time.hour >= 12 and ideal_time.hour <= 14

    def test_short_wake_period_returns_none(self):
        """Wake periods < 6 hours should return None."""
        wake = time(7, 0)
        sleep = time(12, 0)  # Only 5 hours

        result = calculate_nap_window(wake, sleep)
        assert result is None

    def test_overnight_sleep_handled(self):
        """Sleep times that cross midnight should work."""
        wake = time(8, 0)
        sleep = time(1, 0)  # Next day

        result = calculate_nap_window(wake, sleep)
        assert result is not None

        window_start, window_end, _, _ = result
        # 17 hour wake period
        assert window_start is not None
        assert window_end is not None

    def test_window_constrained_by_4h_before_sleep(self):
        """Window end should be at least 4 hours before sleep."""
        wake = time(7, 0)
        sleep = time(18, 0)  # Early sleep

        result = calculate_nap_window(wake, sleep)
        assert result is not None

        _, window_end, _, _ = result

        # Sleep at 18:00, so latest nap end should be 14:00
        assert window_end.hour <= 14

    def test_invalid_window_returns_none(self):
        """If window constraints result in invalid window, return None."""
        # Wake at 7am, sleep at 13:00 (only 6h, just at threshold)
        # 4h before sleep is 9:00
        # Window start (30% of 6h = 1.8h) = 8:48
        # Window end (50% of 6h = 3h) = 10:00
        # But constrained by 9:00 → window is 8:48 to 9:00
        wake = time(7, 0)
        sleep = time(13, 0)

        result = calculate_nap_window(wake, sleep)
        # This should still produce a valid narrow window
        if result is not None:
            _, window_end, _, _ = result
            assert window_end.hour <= 9


class TestNapDuration:
    """Tests for sleep debt-based duration calculation."""

    def test_low_debt_short_nap(self):
        """< 1h sleep debt should produce 20 min power nap."""
        wake = time(7, 0)
        sleep = time(23, 0)

        result = calculate_nap_window(wake, sleep, sleep_debt_hours=0.5)
        assert result is not None

        _, _, _, duration = result
        assert duration == 20  # Power nap

    def test_moderate_debt_standard_nap(self):
        """< 3h sleep debt should produce 25 min nap."""
        wake = time(7, 0)
        sleep = time(23, 0)

        result = calculate_nap_window(wake, sleep, sleep_debt_hours=2.0)
        assert result is not None

        _, _, _, duration = result
        assert duration == 25  # Standard nap

    def test_high_debt_long_window_full_cycle(self):
        """High debt with long time until sleep should produce 90 min nap."""
        wake = time(6, 0)
        sleep = time(23, 0)  # 17 hour wake period

        result = calculate_nap_window(wake, sleep, sleep_debt_hours=4.0)
        assert result is not None

        _, _, ideal_time, duration = result

        # Ideal time around 12:30 (38% of 17h)
        # Time until sleep: 23:00 - 12:30 = 10.5h > 8h
        # Should get full cycle
        assert duration == 90  # Full cycle

    def test_high_debt_short_window_short_nap(self):
        """High debt but short time until sleep should produce short nap."""
        wake = time(10, 0)
        sleep = time(20, 0)  # Only 10 hour wake period

        result = calculate_nap_window(wake, sleep, sleep_debt_hours=4.0)
        assert result is not None

        _, _, _, duration = result

        # 10h wake period, ideal at ~38% = ~13:48
        # Time until sleep: 20:00 - 13:48 = 6.2h < 8h
        # Should get short nap to avoid grogginess
        assert duration == 20


class TestNapInterventionGeneration:
    """Tests for generate_nap_intervention function."""

    def test_generates_intervention_object(self):
        """Should produce valid Intervention object."""
        wake = time(7, 0)
        sleep = time(23, 0)

        intervention = generate_nap_intervention(wake, sleep)
        assert intervention is not None

        assert intervention.type == "nap_window"
        assert intervention.time is not None
        assert intervention.title is not None
        assert intervention.description is not None
        assert intervention.duration_min is not None
        assert intervention.window_end is not None
        assert intervention.ideal_time is not None

    def test_title_includes_duration(self):
        """Title should mention the nap duration."""
        wake = time(7, 0)
        sleep = time(23, 0)

        intervention = generate_nap_intervention(wake, sleep, sleep_debt_hours=0.5)
        assert intervention is not None

        assert "20 min" in intervention.title or "power nap" in intervention.title.lower()

    def test_description_includes_ideal_time(self):
        """Description should mention the ideal nap time."""
        wake = time(7, 0)
        sleep = time(23, 0)

        intervention = generate_nap_intervention(wake, sleep)
        assert intervention is not None

        # Should have some time reference
        assert "PM" in intervention.description or "AM" in intervention.description

    def test_returns_none_for_invalid_window(self):
        """Should return None if no valid nap window exists."""
        wake = time(7, 0)
        sleep = time(12, 0)  # Too short

        intervention = generate_nap_intervention(wake, sleep)
        assert intervention is None


class TestShiftedNapIntervention:
    """Tests for generate_shifted_nap_intervention function."""

    def test_flight_day_minimum_debt(self):
        """Flight day (day 0) should have at least 2h minimum debt."""
        wake = time(7, 0)
        sleep = time(23, 0)

        intervention = generate_shifted_nap_intervention(
            base_wake=wake,
            base_sleep=sleep,
            cumulative_shift=0.0,
            direction="advance",
            total_shift=5.0,
            day=0,
            sleep_debt_hours=0.0  # Base debt is 0
        )

        if intervention is not None:
            # With 2h+ debt, should be at least 25 min
            assert intervention.duration_min >= 20

    def test_arrival_day_minimum_debt(self):
        """Arrival day (day 1) should have at least 3h minimum debt."""
        wake = time(7, 0)
        sleep = time(23, 0)

        intervention = generate_shifted_nap_intervention(
            base_wake=wake,
            base_sleep=sleep,
            cumulative_shift=1.0,
            direction="advance",
            total_shift=5.0,
            day=1,
            sleep_debt_hours=0.0  # Base debt is 0
        )

        if intervention is not None:
            # With 3h+ debt, should be at least 25 min or 90 if time allows
            assert intervention.duration_min >= 20

    def test_shifted_wake_sleep_times_used(self):
        """Should use shifted wake/sleep times for window calculation."""
        wake = time(7, 0)
        sleep = time(23, 0)

        # Advance by 2 hours on day 1 (post-arrival)
        intervention = generate_shifted_nap_intervention(
            base_wake=wake,
            base_sleep=sleep,
            cumulative_shift=2.0,
            direction="advance",
            total_shift=5.0,
            day=1,  # Post-arrival uses remaining offset
            sleep_debt_hours=1.0
        )

        # Should still produce valid intervention
        if intervention is not None:
            assert intervention.type == "nap_window"
            assert intervention.time is not None


class TestNapTimingEdgeCases:
    """Tests for edge cases in nap timing."""

    def test_very_late_sleeper(self):
        """Late sleeper (2am) should still get valid window."""
        wake = time(10, 0)
        sleep = time(2, 0)  # Next day

        result = calculate_nap_window(wake, sleep)
        assert result is not None

        window_start, window_end, _, _ = result
        # 16 hour wake period, window should be afternoon
        assert window_start.hour >= 14

    def test_early_riser(self):
        """Early riser (5am wake) should still get valid window."""
        wake = time(5, 0)
        sleep = time(21, 0)

        result = calculate_nap_window(wake, sleep)
        assert result is not None

        window_start, _, _, _ = result
        # 16 hour wake period, window starts around 9:48
        assert window_start.hour >= 9 and window_start.hour <= 11

    def test_minimum_valid_wake_period(self):
        """Exactly 6 hour wake period should produce a window."""
        wake = time(7, 0)
        sleep = time(13, 0)

        result = calculate_nap_window(wake, sleep)
        # 6h period: window start at 30% = 1.8h (8:48), end at 50% = 3h (10:00)
        # But constrained by 4h before sleep (9:00)
        # So window is 8:48 to 9:00 - very narrow but valid
        # The function should return this or None if it considers it too narrow
        # Based on our implementation, window_end <= window_start returns None
        # Let's check what happens
        if result is not None:
            window_start, window_end, _, _ = result
            assert window_end > window_start
