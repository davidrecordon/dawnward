"""
Optimal shift rate calculations.

Scientific basis:
- Phase advance limit: ~1.0h/day realistic with ~70% compliance (literature: up to 1.5h/day optimal)
- Phase delay limit: ~1.5h/day realistic with ~70% compliance (literature: up to 2.0h/day optimal)
- Natural circadian period: ~24.2h (favors delays)

Key principles:
- Advances are harder than delays
- Rates assume real-world compliance, not lab-optimal conditions
- Total adaptation time = total_shift / daily_rate
"""

from dataclasses import dataclass
from typing import Literal


@dataclass
class DailyShiftTarget:
    """Target phase shift for a single day."""

    day: int  # Day number (negative = prep, 0 = flight, positive = arrival)
    daily_shift: float  # Hours to shift this day
    cumulative_shift: float  # Total hours shifted by end of this day


class ShiftCalculator:
    """
    Calculate optimal daily shift rates for circadian adaptation.

    Balances speed of adaptation against circadian health.
    More prep days = gentler daily shifts.
    """

    # Physiological limits (hours per day)
    MAX_ADVANCE_AGGRESSIVE = 1.5  # Hard limit for advances
    MAX_ADVANCE_MODERATE = 1.0  # Comfortable for advances
    MAX_DELAY_AGGRESSIVE = 2.0  # Safe limit for delays
    MAX_DELAY_MODERATE = 1.5  # Comfortable for delays
    MAX_GENTLE = 1.0  # Very gentle (5+ prep days)

    def __init__(self, total_shift: float, direction: Literal["advance", "delay"], prep_days: int):
        """
        Initialize calculator.

        Args:
            total_shift: Total hours to shift (absolute value)
            direction: "advance" (eastward) or "delay" (westward)
            prep_days: Number of preparation days before departure
        """
        self.total_shift = abs(total_shift)
        self.direction = direction
        self.prep_days = prep_days
        self._daily_rate = self._calculate_optimal_rate()

    def _calculate_optimal_rate(self) -> float:
        """
        Calculate optimal daily shift rate based on prep days and direction.

        Conservative rates assuming ~70% user compliance (realistic-flight-responses.md):
        - Advance: 1.0h/day (physiologically harder, literature-supported)
        - Delay: 1.5h/day (easier but still conservative for real-world compliance)

        With 5+ prep days, use gentler 1.0h/day for both directions.
        """
        if self.direction == "advance":
            # Advances are harder - 1.0h/day is realistic with compliance
            return self.MAX_ADVANCE_MODERATE  # 1.0h/day
        else:
            # Delays are easier but still use conservative rate
            if self.prep_days >= 5:
                return self.MAX_GENTLE  # 1.0h/day for very gentle adaptation
            else:
                return self.MAX_DELAY_MODERATE  # 1.5h/day (was 2.0 for < 3 days)

    @property
    def daily_rate(self) -> float:
        """Get the calculated optimal daily shift rate."""
        return self._daily_rate

    @property
    def estimated_days(self) -> int:
        """Estimate total days needed for full adaptation."""
        import math

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
