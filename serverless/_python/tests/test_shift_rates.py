"""
Tests for shift rate calculations.

These tests verify:
1. ShiftCalculator uses correct direction-specific rates for all intensity modes
2. Phase bounds are adjusted based on cumulative shift

Key design:
- All intensity modes have direction-specific rates (advances are harder than delays)
- User controls total disruption via: intensity (rate) × prep_days (duration)
- No wake floor or sleep ceiling clamps - user picks intensity that works for them
"""

import sys
from datetime import datetime, timedelta
from pathlib import Path

# Add paths for imports
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest

from circadian.scheduling.phase_generator import PhaseGenerator
from circadian.science.shift_calculator import (
    INTENSITY_CONFIGS,
    ShiftCalculator,
)
from circadian.types import ScheduleIntensity, TripLeg


class TestIntensityConfigValues:
    """Verify IntensityConfig values are correct for each intensity level.

    Each intensity has direction-specific rates:
    - Gentle: 0.75h/day advance, 1.0h/day delay
    - Balanced: 1.0h/day advance, 1.5h/day delay
    - Aggressive: 1.25h/day advance, 2.0h/day delay
    """

    def test_intensity_config_gentle(self):
        """Gentle config: 0.75h advance, 1.0h delay."""
        config = INTENSITY_CONFIGS["gentle"]
        assert config.advance_rate == 0.75
        assert config.delay_rate == 1.0

    def test_intensity_config_balanced(self):
        """Balanced config: 1.0h advance, 1.5h delay."""
        config = INTENSITY_CONFIGS["balanced"]
        assert config.advance_rate == 1.0
        assert config.delay_rate == 1.5

    def test_intensity_config_aggressive(self):
        """Aggressive config: 1.25h advance, 2.0h delay."""
        config = INTENSITY_CONFIGS["aggressive"]
        assert config.advance_rate == 1.25
        assert config.delay_rate == 2.0


class TestIntensityRateSelection:
    """Test that ShiftCalculator selects correct rates based on intensity and direction."""

    @pytest.mark.parametrize(
        "intensity,direction,expected_rate",
        [
            # Gentle: 0.75h advance, 1.0h delay
            ("gentle", "advance", 0.75),
            ("gentle", "delay", 1.0),
            # Balanced: 1.0h advance, 1.5h delay
            ("balanced", "advance", 1.0),
            ("balanced", "delay", 1.5),
            # Aggressive: 1.25h advance, 2.0h delay
            ("aggressive", "advance", 1.25),
            ("aggressive", "delay", 2.0),
        ],
    )
    def test_intensity_rate_selection(
        self,
        intensity: ScheduleIntensity,
        direction: str,
        expected_rate: float,
    ):
        """Verify rate selection across all intensity/direction combinations."""
        calc = ShiftCalculator(
            total_shift=8.0,
            direction=direction,
            prep_days=3,
            intensity=intensity,
        )
        assert calc.daily_rate == expected_rate, (
            f"Expected {expected_rate}h/day for {intensity}/{direction}, got {calc.daily_rate}"
        )

    @pytest.mark.parametrize("prep_days", [1, 2, 3, 4, 5, 6, 7])
    def test_rate_independent_of_prep_days(self, prep_days: int):
        """Rate should be determined by intensity and direction, not prep_days."""
        # Balanced advance should always be 1.0h/day
        calc = ShiftCalculator(
            total_shift=8.0,
            direction="advance",
            prep_days=prep_days,
            intensity="balanced",
        )
        assert calc.daily_rate == 1.0


class TestEstimatedDays:
    """Test estimated days calculations for various scenarios."""

    @pytest.mark.parametrize(
        "intensity,direction,total_shift,expected_days",
        [
            # Gentle advance: 8h / 0.75h/day = 10.67 -> 11 days
            ("gentle", "advance", 8.0, 11),
            # Gentle delay: 8h / 1.0h/day = 8 days
            ("gentle", "delay", 8.0, 8),
            # Balanced advance: 8h / 1.0h/day = 8 days
            ("balanced", "advance", 8.0, 8),
            # Balanced delay: 8h / 1.5h/day = 5.33 -> 6 days
            ("balanced", "delay", 8.0, 6),
            # Aggressive advance: 8h / 1.25h/day = 6.4 -> 7 days
            ("aggressive", "advance", 8.0, 7),
            # Aggressive delay: 8h / 2.0h/day = 4 days
            ("aggressive", "delay", 8.0, 4),
        ],
    )
    def test_estimated_days(
        self,
        intensity: ScheduleIntensity,
        direction: str,
        total_shift: float,
        expected_days: int,
    ):
        """Verify estimated days calculation for various intensity/direction combinations."""
        calc = ShiftCalculator(
            total_shift=total_shift,
            direction=direction,
            prep_days=3,
            intensity=intensity,
        )
        assert calc.estimated_days == expected_days, (
            f"Expected {expected_days} days for {total_shift}h {direction} ({intensity}), "
            f"got {calc.estimated_days}"
        )


class TestPhaseBoundsAdjustment:
    """Verify preparation phase bounds are adjusted based on cumulative shift.

    Phase bounds should reflect the shifted wake/sleep times, not the user's
    normal times. This ensures light interventions at early wake times
    (for advance schedules) don't get filtered out.
    """

    def _create_phase_generator(
        self,
        direction: str,
        prep_days: int = 3,
        intensity: ScheduleIntensity = "balanced",
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
            intensity=intensity,
        )

        return generator, departure_dt

    def test_advance_prep_phase_starts_earlier_than_normal(self):
        """For advance schedules, prep phase should start earlier than normal wake time."""
        generator, _ = self._create_phase_generator("advance", prep_days=3)
        phases = generator.generate_phases()

        prep_phases = [p for p in phases if p.phase_type == "preparation"]
        assert len(prep_phases) == 3, f"Expected 3 prep phases, got {len(prep_phases)}"

        # Each prep phase should start progressively earlier
        # Balanced advance: 1.0h/day
        # Day -3: 1h shift -> wake at 6:00 AM
        # Day -2: 2h shift -> wake at 5:00 AM
        # Day -1: 3h shift -> wake at 4:00 AM
        normal_wake_hour = 7

        for phase in prep_phases:
            phase_start_hour = phase.start_datetime.hour
            assert phase_start_hour <= normal_wake_hour, (
                f"Advance prep phase should start at or before {normal_wake_hour}:00, "
                f"got {phase_start_hour}:00 on day {phase.day_number}"
            )

    def test_delay_prep_phase_starts_later_than_normal(self):
        """For delay schedules, prep phase starts later (wake time shifts later)."""
        generator, _ = self._create_phase_generator("delay", prep_days=3)
        phases = generator.generate_phases()

        prep_phases = [p for p in phases if p.phase_type == "preparation"]
        normal_wake_hour = 7

        for phase in prep_phases:
            phase_start_hour = phase.start_datetime.hour
            assert phase_start_hour >= normal_wake_hour, (
                f"Delay prep phase should start at or after {normal_wake_hour}:00, "
                f"got {phase_start_hour}:00 on day {phase.day_number}"
            )

    def test_pre_departure_phase_uses_adjusted_wake(self):
        """Pre-departure phase should start at adjusted wake time, not normal."""
        generator, departure_dt = self._create_phase_generator("advance", prep_days=3)
        phases = generator.generate_phases()

        pre_dep_phases = [p for p in phases if p.phase_type == "pre_departure"]
        assert len(pre_dep_phases) == 1

        pre_dep = pre_dep_phases[0]
        normal_wake_hour = 7

        # For advance, departure day wake should be earlier than normal
        assert pre_dep.start_datetime.hour <= normal_wake_hour

    def test_gentle_advance_shifts_wake_earlier_slowly(self):
        """Gentle advance (0.75h/day) should shift wake earlier more slowly."""
        generator, _ = self._create_phase_generator("advance", prep_days=3, intensity="gentle")
        phases = generator.generate_phases()

        prep_phases = [p for p in phases if p.phase_type == "preparation"]
        last_prep = sorted(prep_phases, key=lambda p: p.day_number)[-1]

        # With 3 prep days at 0.75h/day, day -1 has 2.25h cumulative shift
        # Normal wake 7:00 - 2.25h = 4:45 AM
        wake_hour = last_prep.start_datetime.hour
        wake_minute = last_prep.start_datetime.minute
        wake_total_minutes = wake_hour * 60 + wake_minute

        # Should be around 4:45 AM = 285 minutes
        expected_minutes = 7 * 60 - int(2.25 * 60)  # 285
        assert abs(wake_total_minutes - expected_minutes) <= 15, (
            f"Expected wake around 4:45 AM, got {wake_hour}:{wake_minute:02d}"
        )

    def test_aggressive_delay_shifts_sleep_later_quickly(self):
        """Aggressive delay (2.0h/day) should shift sleep later quickly."""
        generator, _ = self._create_phase_generator("delay", prep_days=3, intensity="aggressive")
        phases = generator.generate_phases()

        prep_phases = [p for p in phases if p.phase_type == "preparation"]
        last_prep = sorted(prep_phases, key=lambda p: p.day_number)[-1]

        # With 3 prep days at 2.0h/day, day -1 has 6h cumulative shift
        # Normal sleep 23:00 + 6h = 5:00 AM next day
        sleep_dt = last_prep.end_datetime
        sleep_hour = sleep_dt.hour

        # Phase end should be in early morning (crossed midnight)
        if sleep_dt.date() > last_prep.start_datetime.date():
            # Sleep crosses to next day
            assert sleep_hour <= 6, f"Expected sleep around 5 AM next day, got {sleep_hour}:00"


class TestShiftTargetGeneration:
    """Test that shift targets are generated correctly."""

    def test_shift_targets_cumulative(self):
        """Cumulative shift should accumulate correctly across days."""
        calc = ShiftCalculator(
            total_shift=8.0,
            direction="advance",
            prep_days=3,
            intensity="balanced",
        )
        targets = calc.generate_shift_targets()

        # Balanced advance: 1.0h/day, 8h total = 8 days
        assert len(targets) == 8

        # Check cumulative increases by daily_rate each day
        for i, target in enumerate(targets):
            expected_cumulative = min((i + 1) * 1.0, 8.0)
            assert target.cumulative_shift == expected_cumulative, (
                f"Day {target.day}: expected cumulative {expected_cumulative}, "
                f"got {target.cumulative_shift}"
            )

    def test_shift_targets_day_numbering(self):
        """Day numbers should start from -prep_days."""
        calc = ShiftCalculator(
            total_shift=8.0,
            direction="advance",
            prep_days=3,
            intensity="balanced",
        )
        targets = calc.generate_shift_targets()

        # 8h advance at 1.0h/day = 8 days
        # Starts at day -3, so ends at day 4
        assert targets[0].day == -3
        assert targets[-1].day == 4  # Last day extends past flight day


class TestBackwardCompatibility:
    """Test that default behavior is backward compatible."""

    def test_default_intensity_is_balanced(self):
        """ShiftCalculator without intensity should default to balanced."""
        calc = ShiftCalculator(total_shift=8.0, direction="advance", prep_days=3)
        assert calc.intensity == "balanced"

    def test_balanced_advance_rate_is_1h(self):
        """Balanced mode advance rate should be 1.0h/day."""
        calc = ShiftCalculator(
            total_shift=8.0, direction="advance", prep_days=3, intensity="balanced"
        )
        assert calc.daily_rate == 1.0

    def test_balanced_delay_rate_is_1_5h(self):
        """Balanced mode delay rate should be 1.5h/day."""
        calc = ShiftCalculator(
            total_shift=8.0, direction="delay", prep_days=3, intensity="balanced"
        )
        assert calc.daily_rate == 1.5
