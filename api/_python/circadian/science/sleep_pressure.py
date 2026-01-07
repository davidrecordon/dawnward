"""
Sleep pressure modeling using Two-Process Model.

Scientific basis:
- Two-Process Model: Borbély AA (1982). Human Neurobiology, 1(3), 195-204.
- Sleep debt effects: Dinges et al. (1997). Sleep, 20(4), 267-277.
- Nap recovery: Lovato & Lack (2010). Progress in Brain Research, 185, 155-166.

Key concepts:
- Process S (sleep pressure) builds during wakefulness
- Process C (circadian) modulates sleepiness throughout the day
- Sleep propensity = S × C (multiplicative)
- Wake maintenance zone: 1-3h before habitual sleep (high C, fights against S)
"""

from datetime import time
from typing import Tuple, Optional, Literal
from dataclasses import dataclass

from ..circadian_math import time_to_minutes, minutes_to_time, parse_time


# Sleep architecture constants
FULL_SLEEP_CYCLE_MIN = 90          # One complete NREM-REM cycle
SLEEP_CYCLES_FOR_RECOVERY = 4      # ~6 hours minimum for good recovery
NAP_INERTIA_THRESHOLD_MIN = 30     # Naps > 30 min risk sleep inertia

# Sleep pressure constants
STANDARD_WAKE_HOURS = 16           # Typical waking day
PRESSURE_BUILD_RATE = 1.0          # Normalized units per hour awake
PRESSURE_DECAY_RATE = 0.5          # Units per hour of sleep

# Nap window constants (percent of wake period)
STANDARD_NAP_START_PERCENT = 0.30  # 30% into wake period
STANDARD_NAP_END_PERCENT = 0.50    # 50% into wake period
HIGH_DEBT_NAP_START_PERCENT = 0.25 # Earlier when sleep-deprived
HIGH_DEBT_NAP_END_PERCENT = 0.55   # Wider window when sleep-deprived


@dataclass
class NapRecommendation:
    """Recommended nap window and parameters."""
    window_start: time
    window_end: time
    ideal_time: time              # Center of optimal window
    max_duration_min: int         # Maximum safe nap duration
    urgency: Literal["optional", "recommended", "important"]


class SleepPressureModel:
    """
    Model sleep pressure for nap timing and arrival-day management.

    Uses the Two-Process Model (Borbély 1982):
    - Process S: Homeostatic sleep pressure (builds during wake)
    - Process C: Circadian alertness rhythm
    - Sleepiness = interaction of S and C
    """

    def __init__(self, wake_time: str, sleep_time: str):
        """
        Initialize model from habitual sleep schedule.

        Args:
            wake_time: Habitual wake time in "HH:MM" format
            sleep_time: Habitual sleep time in "HH:MM" format
        """
        self._wake_minutes = time_to_minutes(parse_time(wake_time))
        self._sleep_minutes = time_to_minutes(parse_time(sleep_time))

        # Calculate wake duration (handles midnight crossing)
        wake_duration = self._sleep_minutes - self._wake_minutes
        if wake_duration <= 0:
            wake_duration += 24 * 60
        self._standard_wake_minutes = wake_duration

        # Initialize pressure at normal baseline
        self._current_pressure = 0.0
        self._sleep_debt_hours = 0.0

    @property
    def sleep_debt_hours(self) -> float:
        """Get current estimated sleep debt in hours."""
        return self._sleep_debt_hours

    def add_sleep_debt(self, hours: float) -> None:
        """
        Add sleep debt (e.g., from red-eye flight with poor sleep).

        Args:
            hours: Hours of additional sleep debt
        """
        self._sleep_debt_hours = max(0, self._sleep_debt_hours + hours)

    def reduce_sleep_debt(self, sleep_hours: float, is_nap: bool = False) -> None:
        """
        Reduce sleep debt from sleep/nap.

        Naps only partially reduce debt - full night's sleep needed for full recovery.

        Args:
            sleep_hours: Hours of sleep obtained
            is_nap: True if this is a nap (less efficient recovery)
        """
        if is_nap:
            # Naps are ~50% efficient at reducing debt
            recovery = sleep_hours * 0.5
        else:
            # Full sleep is ~100% efficient (up to debt amount)
            recovery = sleep_hours

        self._sleep_debt_hours = max(0, self._sleep_debt_hours - recovery)

    def calculate_nap_window(
        self,
        wake_time: time,
        sleep_time: time,
    ) -> NapRecommendation:
        """
        Calculate optimal nap window based on current sleep pressure.

        Standard nap window: 25-50% into wake period
        With sleep debt: Earlier window (25%), longer allowed duration

        Args:
            wake_time: Wake time for this day
            sleep_time: Target sleep time for this day

        Returns:
            NapRecommendation with optimal window and parameters
        """
        wake_minutes = time_to_minutes(wake_time)
        sleep_minutes = time_to_minutes(sleep_time)

        # Calculate wake duration
        wake_duration = sleep_minutes - wake_minutes
        if wake_duration <= 0:
            wake_duration += 24 * 60

        # Adjust window based on sleep debt
        if self._sleep_debt_hours >= 2:
            start_percent = HIGH_DEBT_NAP_START_PERCENT
            end_percent = HIGH_DEBT_NAP_END_PERCENT
            max_duration = 90  # One full cycle allowed when tired
            urgency = "recommended" if self._sleep_debt_hours >= 4 else "optional"
        else:
            start_percent = STANDARD_NAP_START_PERCENT
            end_percent = STANDARD_NAP_END_PERCENT
            max_duration = 30  # Keep short to avoid inertia
            urgency = "optional"

        # Calculate window times
        start_offset = int(wake_duration * start_percent)
        end_offset = int(wake_duration * end_percent)

        window_start = minutes_to_time(wake_minutes + start_offset)
        window_end = minutes_to_time(wake_minutes + end_offset)
        ideal_time = minutes_to_time(wake_minutes + (start_offset + end_offset) // 2)

        return NapRecommendation(
            window_start=window_start,
            window_end=window_end,
            ideal_time=ideal_time,
            max_duration_min=max_duration,
            urgency=urgency
        )

    def calculate_arrival_recovery_nap(
        self,
        arrival_time: time,
        target_sleep_time: time,
        sleep_debt_hours: float = 4.0
    ) -> Optional[NapRecommendation]:
        """
        Calculate arrival-day recovery nap per design doc.

        Special handling for red-eye arrivals:
        - Window start: As soon as practical post-arrival
        - Window end: No later than 1pm local (or 6-8h before target sleep)
        - Max duration: 90 min (one full cycle)

        Args:
            arrival_time: Time of arrival
            target_sleep_time: Target bedtime for arrival night
            sleep_debt_hours: Estimated hours of sleep debt

        Returns:
            NapRecommendation or None if no nap recommended
        """
        arrival_minutes = time_to_minutes(arrival_time)
        sleep_minutes = time_to_minutes(target_sleep_time)

        # Calculate hard cutoff (1pm or 6-8h before sleep, whichever is earlier)
        one_pm_minutes = 13 * 60  # 1:00 PM
        buffer_before_sleep = 7 * 60  # 7 hours
        sleep_cutoff = sleep_minutes - buffer_before_sleep
        if sleep_cutoff < 0:
            sleep_cutoff += 24 * 60

        hard_cutoff = min(one_pm_minutes, sleep_cutoff)

        # If arrival is after cutoff, no nap (push through)
        # Per design doc: "For arrivals after ~4pm local, recommend pushing through"
        if arrival_minutes >= hard_cutoff or arrival_minutes >= 16 * 60:
            return None

        # Nap window starts 30-60 min after arrival (settle in time)
        settle_in_minutes = 45
        window_start = minutes_to_time(arrival_minutes + settle_in_minutes)

        # Window ends at hard cutoff
        window_end = minutes_to_time(hard_cutoff)

        # Ideal time is midpoint, but favor earlier
        ideal_minutes = arrival_minutes + settle_in_minutes + 60
        ideal_time = minutes_to_time(min(ideal_minutes, hard_cutoff - 30))

        # Determine urgency based on sleep debt
        if sleep_debt_hours >= 5:
            urgency = "important"
        elif sleep_debt_hours >= 3:
            urgency = "recommended"
        else:
            urgency = "optional"

        return NapRecommendation(
            window_start=window_start,
            window_end=window_end,
            ideal_time=ideal_time,
            max_duration_min=90,  # One full cycle for recovery
            urgency=urgency
        )

    def is_wake_maintenance_zone(self, check_time: time, sleep_time: time) -> bool:
        """
        Check if a time falls within the wake maintenance zone.

        The wake maintenance zone (1-3h before habitual bedtime) actively
        suppresses sleepiness - napping here is difficult and counterproductive.

        Args:
            check_time: Time to check
            sleep_time: Target sleep time

        Returns:
            True if in wake maintenance zone
        """
        check_minutes = time_to_minutes(check_time)
        sleep_minutes = time_to_minutes(sleep_time)

        # Wake maintenance zone is 1-3h before sleep
        zone_start = sleep_minutes - 3 * 60
        zone_end = sleep_minutes - 1 * 60

        # Handle midnight crossing
        if zone_start < 0:
            zone_start += 24 * 60
            return check_minutes >= zone_start or check_minutes <= zone_end
        else:
            return zone_start <= check_minutes <= zone_end

    def classify_sleep_duration(self, duration_hours: float) -> Tuple[str, float]:
        """
        Classify sleep duration and estimate pressure reset.

        Categories per design doc:
        - < 90 min: Nap (minimal pressure reset)
        - 90 min - 4h: Short sleep (partial ~50% reset)
        - 4h+: Sleep (meaningful reset with deficit)

        Args:
            duration_hours: Sleep duration in hours

        Returns:
            Tuple of (category, pressure_reset_percent)
        """
        if duration_hours < 1.5:
            return ("nap", 0.15)
        elif duration_hours < 4:
            return ("short_sleep", 0.50)
        else:
            # Full sleep resets most pressure, but may leave deficit
            reset = min(1.0, duration_hours / 8)
            return ("sleep", reset)
