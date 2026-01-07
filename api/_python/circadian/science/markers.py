"""
Circadian marker tracking (CBTmin and DLMO).

Scientific basis:
- CBTmin estimation: Czeisler & Gooley (2007)
- DLMO estimation: Burgess et al. (2010)
- Phase relationships: Duffy & Dijk (2002)

Key relationships:
- CBTmin occurs ~2.5 hours before habitual wake time
- DLMO occurs ~2 hours before habitual sleep time
- CBTmin and DLMO maintain ~14h offset (DLMO ~14h before CBTmin)
- Both markers shift together during adaptation (~1-2h/day with interventions)
"""

from datetime import time
from typing import Literal

from ..circadian_math import time_to_minutes, minutes_to_time, parse_time


# Phase relationships (hours)
CBTMIN_BEFORE_WAKE = 2.5      # CBTmin is 2.5h before wake
DLMO_BEFORE_SLEEP = 2.0       # DLMO is 2h before sleep
DLMO_TO_CBTMIN = 6.0          # DLMO to CBTmin is ~6 hours (sleep onset to temp nadir)


class CircadianMarkerTracker:
    """
    Track CBTmin and DLMO as they shift during adaptation.

    The circadian clock shifts gradually - this class models the current
    position of key markers based on cumulative interventions.

    Scientific basis:
    - CBTmin shifts ~1-2h/day with optimal light exposure (Khalsa 2003)
    - DLMO follows CBTmin with consistent phase relationship
    - Markers can be estimated from habitual sleep/wake times
    """

    def __init__(self, wake_time: str, sleep_time: str):
        """
        Initialize tracker from habitual sleep schedule.

        Args:
            wake_time: Habitual wake time in "HH:MM" format
            sleep_time: Habitual sleep time in "HH:MM" format
        """
        self._base_wake_minutes = time_to_minutes(parse_time(wake_time))
        self._base_sleep_minutes = time_to_minutes(parse_time(sleep_time))

        # Estimate baseline markers
        self._base_cbtmin_minutes = self._base_wake_minutes - int(CBTMIN_BEFORE_WAKE * 60)
        self._base_dlmo_minutes = self._base_sleep_minutes - int(DLMO_BEFORE_SLEEP * 60)

    @property
    def base_cbtmin(self) -> time:
        """Get baseline CBTmin (before any adaptation)."""
        return minutes_to_time(self._base_cbtmin_minutes)

    @property
    def base_dlmo(self) -> time:
        """Get baseline DLMO (before any adaptation)."""
        return minutes_to_time(self._base_dlmo_minutes)

    def get_cbtmin_at_shift(
        self,
        cumulative_shift: float,
        direction: Literal["advance", "delay"]
    ) -> time:
        """
        Get CBTmin position at a given cumulative shift.

        Args:
            cumulative_shift: Hours already shifted (always positive)
            direction: "advance" or "delay"

        Returns:
            Current CBTmin time accounting for shift
        """
        shift_minutes = int(cumulative_shift * 60)

        if direction == "advance":
            # Advancing = CBTmin moves earlier
            current_minutes = self._base_cbtmin_minutes - shift_minutes
        else:
            # Delaying = CBTmin moves later
            current_minutes = self._base_cbtmin_minutes + shift_minutes

        return minutes_to_time(current_minutes)

    def get_dlmo_at_shift(
        self,
        cumulative_shift: float,
        direction: Literal["advance", "delay"]
    ) -> time:
        """
        Get DLMO position at a given cumulative shift.

        Args:
            cumulative_shift: Hours already shifted (always positive)
            direction: "advance" or "delay"

        Returns:
            Current DLMO time accounting for shift
        """
        shift_minutes = int(cumulative_shift * 60)

        if direction == "advance":
            # Advancing = DLMO moves earlier
            current_minutes = self._base_dlmo_minutes - shift_minutes
        else:
            # Delaying = DLMO moves later
            current_minutes = self._base_dlmo_minutes + shift_minutes

        return minutes_to_time(current_minutes)

    def get_markers_for_day(
        self,
        day: int,
        cumulative_shift: float,
        total_shift: float,
        direction: Literal["advance", "delay"]
    ) -> dict:
        """
        Get all markers for a specific day of adaptation.

        Handles timezone context:
        - Pre-departure (day <= 0): Times in origin timezone
        - Post-arrival (day >= 1): Times in destination timezone

        Args:
            day: Day number (negative = prep, 0 = flight, positive = arrival)
            cumulative_shift: Hours shifted by this day
            total_shift: Total shift needed (absolute value)
            direction: "advance" or "delay"

        Returns:
            Dict with cbtmin, dlmo, wake_target, sleep_target times
        """
        if day <= 0:
            # Pre-departure: shift from baseline
            cbtmin = self.get_cbtmin_at_shift(cumulative_shift, direction)
            dlmo = self.get_dlmo_at_shift(cumulative_shift, direction)

            # Calculate wake/sleep from markers
            cbtmin_minutes = time_to_minutes(cbtmin)
            dlmo_minutes = time_to_minutes(dlmo)

            wake_minutes = cbtmin_minutes + int(CBTMIN_BEFORE_WAKE * 60)
            sleep_minutes = dlmo_minutes + int(DLMO_BEFORE_SLEEP * 60)
        else:
            # Post-arrival: offset from destination baseline by remaining shift
            remaining = total_shift - cumulative_shift

            if direction == "advance":
                # Body still behind destination time
                # Wake/sleep targets are later than ideal
                wake_minutes = self._base_wake_minutes + int(remaining * 60)
                sleep_minutes = self._base_sleep_minutes + int(remaining * 60)
            else:
                # Body still ahead of destination time
                # Wake/sleep targets are earlier than ideal
                wake_minutes = self._base_wake_minutes - int(remaining * 60)
                sleep_minutes = self._base_sleep_minutes - int(remaining * 60)

            # Derive markers from targets
            cbtmin_minutes = wake_minutes - int(CBTMIN_BEFORE_WAKE * 60)
            dlmo_minutes = sleep_minutes - int(DLMO_BEFORE_SLEEP * 60)

            cbtmin = minutes_to_time(cbtmin_minutes)
            dlmo = minutes_to_time(dlmo_minutes)

        return {
            "cbtmin": cbtmin,
            "dlmo": dlmo,
            "wake_target": minutes_to_time(wake_minutes),
            "sleep_target": minutes_to_time(sleep_minutes),
        }

    def estimate_adaptation_progress(
        self,
        current_cbtmin: time,
        target_cbtmin: time
    ) -> float:
        """
        Estimate adaptation progress as a percentage.

        Useful for user feedback: "You're 60% adapted to the new timezone."

        Args:
            current_cbtmin: Current estimated CBTmin
            target_cbtmin: Destination-adapted CBTmin

        Returns:
            Progress as 0-1 (0 = not started, 1 = fully adapted)
        """
        current_minutes = time_to_minutes(current_cbtmin)
        target_minutes = time_to_minutes(target_cbtmin)
        base_minutes = self._base_cbtmin_minutes

        # Calculate distances
        total_distance = abs(target_minutes - base_minutes)
        if total_distance > 12 * 60:
            total_distance = 24 * 60 - total_distance

        remaining_distance = abs(target_minutes - current_minutes)
        if remaining_distance > 12 * 60:
            remaining_distance = 24 * 60 - remaining_distance

        if total_distance == 0:
            return 1.0

        progress = 1 - (remaining_distance / total_distance)
        return max(0.0, min(1.0, progress))
