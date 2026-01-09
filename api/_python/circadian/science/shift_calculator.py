"""
Optimal shift rate calculations.

Scientific basis:
- Phase advance limit: ~1.0h/day realistic with ~70% compliance (literature: up to 1.5h/day optimal)
- Phase delay limit: ~1.5h/day realistic with ~70% compliance (literature: up to 2.0h/day optimal)
- Natural circadian period: ~24.2h (favors delays)

Key principles:
- Advances are harder than delays (different rates per direction)
- Rates assume real-world compliance, not lab-optimal conditions
- Total adaptation time = total_shift / daily_rate
- User controls disruption via: intensity (rate) × prep_days (duration)
"""

import math
from dataclasses import dataclass
from typing import Literal

from circadian.types import ScheduleIntensity


@dataclass
class DailyShiftTarget:
    """Target phase shift for a single day."""

    day: int  # Day number (negative = prep, 0 = flight, positive = arrival)
    daily_shift: float  # Hours to shift this day
    cumulative_shift: float  # Total hours shifted by end of this day


@dataclass
class IntensityConfig:
    """Configuration for a schedule intensity level.

    Each intensity has direction-specific rates since advances are physiologically
    harder than delays. User controls total disruption via intensity × prep_days.
    """

    advance_rate: float  # Hours per day for eastward (advance) shifts
    delay_rate: float  # Hours per day for westward (delay) shifts


# Intensity configurations with direction-specific rates:
# - Advances are physiologically harder than delays
# - User controls total disruption via: intensity (rate) × prep_days (duration)
#
# Rates based on circadian science:
# - Gentle: Conservative rates for those with less flexible schedules
# - Balanced: Good trade-off between speed and comfort
# - Aggressive: Fastest adaptation for those who can handle disruption
INTENSITY_CONFIGS: dict[ScheduleIntensity, IntensityConfig] = {
    "gentle": IntensityConfig(
        advance_rate=0.75,  # 0.75h/day for eastward
        delay_rate=1.0,  # 1.0h/day for westward
    ),
    "balanced": IntensityConfig(
        advance_rate=1.0,  # 1.0h/day for eastward
        delay_rate=1.5,  # 1.5h/day for westward
    ),
    "aggressive": IntensityConfig(
        advance_rate=1.25,  # 1.25h/day for eastward
        delay_rate=2.0,  # 2.0h/day for westward
    ),
}


def get_intensity_config(intensity: ScheduleIntensity) -> IntensityConfig:
    """Get the configuration for a given intensity level."""
    return INTENSITY_CONFIGS[intensity]


class ShiftCalculator:
    """
    Calculate optimal daily shift rates for circadian adaptation.

    Balances speed of adaptation against circadian health.
    Rate is now controlled primarily by schedule_intensity setting.
    """

    def __init__(
        self,
        total_shift: float,
        direction: Literal["advance", "delay"],
        prep_days: int,
        intensity: ScheduleIntensity = "balanced",
    ):
        """
        Initialize calculator.

        Args:
            total_shift: Total hours to shift (absolute value)
            direction: "advance" (eastward) or "delay" (westward)
            prep_days: Number of preparation days before departure
            intensity: Schedule intensity level (gentle/balanced/aggressive)
        """
        self.total_shift = abs(total_shift)
        self.direction = direction
        self.prep_days = prep_days
        self.intensity = intensity
        self._intensity_config = get_intensity_config(intensity)
        self._daily_rate = self._calculate_optimal_rate()

    def _calculate_optimal_rate(self) -> float:
        """
        Calculate optimal daily shift rate based on intensity and direction.

        All intensity levels use direction-specific rates since advances are
        physiologically harder than delays.
        """
        config = self._intensity_config
        return config.advance_rate if self.direction == "advance" else config.delay_rate

    @property
    def intensity_config(self) -> IntensityConfig:
        """Get the intensity configuration for this calculator."""
        return self._intensity_config

    @property
    def daily_rate(self) -> float:
        """Get the calculated optimal daily shift rate."""
        return self._daily_rate

    @property
    def estimated_days(self) -> int:
        """Estimate total days needed for full adaptation."""
        return math.ceil(self.total_shift / self._daily_rate)

    def generate_shift_targets(self) -> list[DailyShiftTarget]:
        """
        Generate daily shift targets for the entire adaptation period.

        Starts from day -prep_days, through flight day (0), and into
        arrival days until fully adapted.

        Returns:
            List of DailyShiftTarget objects
        """
        targets = []
        cumulative = 0.0
        day = -self.prep_days

        while cumulative < self.total_shift:
            remaining = self.total_shift - cumulative
            daily_shift = min(self._daily_rate, remaining)
            cumulative += daily_shift

            targets.append(
                DailyShiftTarget(
                    day=day,
                    daily_shift=round(daily_shift, 2),
                    cumulative_shift=round(cumulative, 2),
                )
            )
            day += 1

        return targets

    def get_shift_at_day(self, day: int) -> float:
        """
        Get cumulative shift at a specific day number.

        Args:
            day: Day number (negative = prep, 0 = flight, positive = arrival)

        Returns:
            Cumulative hours shifted by end of that day
        """
        targets = self.generate_shift_targets()

        for target in targets:
            if target.day == day:
                return target.cumulative_shift

        # Day not in targets - either before start or after full adaptation
        if day < -self.prep_days:
            return 0.0
        else:
            return self.total_shift

    def calculate_partial_day_target(self, available_hours: float) -> float:
        """
        Calculate shift target for a partial day (per flight-timing-edge-cases.md).

        Pro-rates the daily target based on available hours:
        - 16+ hours: Full daily target
        - 8-16 hours: 50-100% of target (scaled linearly)
        - < 8 hours: 0 (single recommendation mode)

        Args:
            available_hours: Hours available for interventions

        Returns:
            Pro-rated shift target for this partial day
        """
        if available_hours >= 16:
            return self._daily_rate
        elif available_hours >= 8:
            scale = available_hours / 16
            return self._daily_rate * scale
        else:
            return 0.0  # Single recommendation mode
