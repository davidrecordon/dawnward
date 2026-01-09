"""
Tests for shift rate calculations and phase bounds adjustments.

These tests verify:
1. ShiftCalculator uses correct direction-aware rates
2. Phase bounds are adjusted based on cumulative shift (not normal wake/sleep times)
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path

# Add paths for imports
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent))

from circadian.scheduling.phase_generator import PhaseGenerator
from circadian.science.shift_calculator import ShiftCalculator
from circadian.types import TripLeg


class TestShiftCalculatorRates:
    """Verify ShiftCalculator uses correct direction-aware rates.

    Per realistic-flight-responses.md:
    - Advance: 1.0h/day (harder direction, realistic with ~70% compliance)
    - Delay: 1.5h/day for < 5 prep days, 1.0h/day for >= 5 prep days
    """

    def test_advance_rate_is_1h_per_day(self):
        """Advance direction should always use 1.0h/day rate."""
        calc = ShiftCalculator(total_shift=8.0, direction="advance", prep_days=3)
        assert calc.daily_rate == 1.0, f"Expected 1.0h/day for advance, got {calc.daily_rate}"

    def test_advance_rate_same_for_all_prep_days(self):
        """Advance rate should be 1.0h/day regardless of prep days."""
        for prep_days in [1, 2, 3, 4, 5, 6, 7]:
            calc = ShiftCalculator(total_shift=8.0, direction="advance", prep_days=prep_days)
            assert calc.daily_rate == 1.0, (
                f"Expected 1.0h/day for advance with {prep_days} prep days, got {calc.daily_rate}"
            )

    def test_delay_rate_is_1_5h_for_short_prep(self):
        """Delay direction should use 1.5h/day for < 5 prep days."""
        for prep_days in [1, 2, 3, 4]:
            calc = ShiftCalculator(total_shift=8.0, direction="delay", prep_days=prep_days)
            assert calc.daily_rate == 1.5, (
                f"Expected 1.5h/day for delay with {prep_days} prep days, got {calc.daily_rate}"
            )

    def test_delay_rate_is_1h_for_long_prep(self):
        """Delay direction should use 1.0h/day for >= 5 prep days (gentle adaptation)."""
        for prep_days in [5, 6, 7]:
            calc = ShiftCalculator(total_shift=8.0, direction="delay", prep_days=prep_days)
            assert calc.daily_rate == 1.0, (
                f"Expected 1.0h/day for delay with {prep_days} prep days, got {calc.daily_rate}"
            )

    def test_estimated_days_advance_8h_shift(self):
        """8h advance at 1.0h/day should take 8 days."""
        calc = ShiftCalculator(total_shift=8.0, direction="advance", prep_days=3)
        assert calc.estimated_days == 8, (
            f"Expected 8 days for 8h advance, got {calc.estimated_days}"
        )

    def test_estimated_days_delay_8h_shift(self):
        """8h delay at 1.5h/day should take 6 days (ceil(8/1.5) = 6)."""
        calc = ShiftCalculator(total_shift=8.0, direction="delay", prep_days=3)
        assert calc.estimated_days == 6, f"Expected 6 days for 8h delay, got {calc.estimated_days}"

    def test_estimated_days_delay_gentle(self):
        """8h delay at 1.0h/day (gentle, >= 5 prep) should take 8 days."""
        calc = ShiftCalculator(total_shift=8.0, direction="delay", prep_days=5)
        assert calc.estimated_days == 8, (
            f"Expected 8 days for 8h delay (gentle), got {calc.estimated_days}"
        )


class TestPhaseBoundsAdjustment:
    """Verify preparation phase bounds are adjusted based on cumulative shift.

    The bug fix ensures that light interventions scheduled at early wake times
    (for advance schedules) don't get filtered out because they're "outside phase bounds".
    """

    def _create_phase_generator(
        self, direction: str, prep_days: int = 3
    ) -> tuple[PhaseGenerator, datetime]:
        """Helper to create a phase generator for testing."""
        future_date = datetime.now() + timedelta(days=5)
        departure_dt = future_date.replace(hour=10, minute=0, second=0, microsecond=0)
        arrival_dt = departure_dt + timedelta(hours=10)

        if direction == "advance":
            origin_tz = "America/Los_Angeles"
            dest_tz = "Europe/London"  # ~8h advance
            total_shift = 8.0
        else:
            origin_tz = "Europe/London"
            dest_tz = "America/Los_Angeles"  # ~8h delay
            total_shift = 8.0

        legs = [
            TripLeg(
                origin_tz=origin_tz,
                dest_tz=dest_tz,
                departure_datetime=departure_dt.isoformat(),
                arrival_datetime=arrival_dt.isoformat(),
            )
        ]

        generator = PhaseGenerator(
            legs=legs,
            prep_days=prep_days,
            wake_time="07:00",
            sleep_time="23:00",
            total_shift=total_shift,
            direction=direction,
        )

        return generator, departure_dt

    def test_advance_prep_phase_starts_earlier_than_normal(self):
        """For advance schedules, prep phase should start earlier than normal wake time."""
        generator, _ = self._create_phase_generator("advance", prep_days=3)
        phases = generator.generate_phases()

        # Find preparation phases
        prep_phases = [p for p in phases if p.phase_type == "preparation"]
        assert len(prep_phases) == 3, f"Expected 3 prep phases, got {len(prep_phases)}"

        # Each prep phase should start progressively earlier
        # Day -3: ~1h shift cumulative -> wake at ~6:00 AM
        # Day -2: ~2h shift cumulative -> wake at ~5:00 AM
        # Day -1: ~3h shift cumulative -> wake at ~4:00 AM
        normal_wake_hour = 7

        for phase in prep_phases:
            phase_start_hour = phase.start_datetime.hour
            # For advance, start should be AT OR BEFORE normal wake time
            assert phase_start_hour <= normal_wake_hour, (
                f"Advance prep phase should start at or before {normal_wake_hour}:00, "
                f"got {phase_start_hour}:00 on day {phase.day_number}"
            )

    def test_delay_prep_phase_starts_later_than_normal(self):
        """For delay schedules, prep phase may start later (wake time shifts later)."""
        generator, _ = self._create_phase_generator("delay", prep_days=3)
        phases = generator.generate_phases()

        prep_phases = [p for p in phases if p.phase_type == "preparation"]

        # For delay with cumulative shift, wake time shifts later
        # Day -3: ~1.5h shift cumulative -> wake at ~8:30 AM
        # Day -2: ~3h shift cumulative -> wake at ~10:00 AM
        # etc.
        normal_wake_hour = 7

        for phase in prep_phases:
            phase_start_hour = phase.start_datetime.hour
            # For delay, start should be AT OR AFTER normal wake time
            assert phase_start_hour >= normal_wake_hour, (
                f"Delay prep phase should start at or after {normal_wake_hour}:00, "
                f"got {phase_start_hour}:00 on day {phase.day_number}"
            )

    def test_pre_departure_phase_uses_adjusted_wake(self):
        """Pre-departure phase should start at adjusted wake time, not normal."""
        generator, departure_dt = self._create_phase_generator("advance", prep_days=3)
        phases = generator.generate_phases()

        pre_dep_phases = [p for p in phases if p.phase_type == "pre_departure"]
        assert len(pre_dep_phases) == 1, (
            f"Expected 1 pre_departure phase, got {len(pre_dep_phases)}"
        )

        pre_dep = pre_dep_phases[0]
        normal_wake_hour = 7

        # For advance, departure day wake should be earlier than normal
        assert pre_dep.start_datetime.hour <= normal_wake_hour, (
            f"Advance pre_departure should start at or before {normal_wake_hour}:00, "
            f"got {pre_dep.start_datetime.hour}:00"
        )

    def test_phase_bounds_allow_early_light_interventions(self):
        """Phase bounds should be wide enough to include early light interventions."""
        generator, _ = self._create_phase_generator("advance", prep_days=3)
        phases = generator.generate_phases()

        # Get the last prep phase (day -1, most shifted)
        prep_phases = [p for p in phases if p.phase_type == "preparation"]
        last_prep = sorted(prep_phases, key=lambda p: p.day_number)[-1]

        # With 3 prep days and 1h/day advance rate, day -1 has ~3h cumulative shift
        # Normal wake 7:00 - 3h = 4:00 AM
        # Light seek window should be around 4:00-5:00 AM
        # Phase bounds must include this time

        phase_start_hour = last_prep.start_datetime.hour
        expected_light_window_hour = 4  # Approximately

        assert phase_start_hour <= expected_light_window_hour, (
            f"Phase start ({phase_start_hour}:00) should allow light intervention "
            f"at ~{expected_light_window_hour}:00"
        )
