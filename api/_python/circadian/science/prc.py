"""
Phase Response Curves for circadian interventions.

Scientific basis:
- Light PRC: Khalsa SBS et al. (2003). J Physiol, 549(3), 945-952.
- Melatonin PRC: Burgess HJ et al. (2010). J Clin Endocrinol Metab, 95(7), 3325-3331.

This module provides pure science functions that return optimal timing windows.
No flight awareness or practical constraints - that's handled by the scheduling layer.
"""

from datetime import time
from typing import Tuple, Literal

from ..circadian_math import time_to_minutes, minutes_to_time


class LightPRC:
    """
    Khalsa et al. (2003) Phase Response Curve for bright light.

    Key findings:
    - Peak-to-trough amplitude: ~5 hours
    - Maximum phase delays: ~3.4 hours (light 0-4h before CBTmin)
    - Maximum phase advances: ~2.0 hours (light 0-4h after CBTmin)
    - Crossover point near CBTmin (critical - avoid light here)
    """

    # PRC constants (hours relative to CBTmin)
    ADVANCE_ZONE_START = 0      # Hours after CBTmin
    ADVANCE_ZONE_END = 4        # Hours after CBTmin
    ADVANCE_PEAK = 2.5          # Peak effect at +2.5h

    DELAY_ZONE_START = -4       # Hours before CBTmin
    DELAY_ZONE_END = 0          # Hours before CBTmin (at CBTmin)
    DELAY_PEAK = -2.5           # Peak effect at -2.5h

    # Maximum achievable shifts per day
    MAX_ADVANCE_PER_DAY = 2.0   # hours
    MAX_DELAY_PER_DAY = 3.4     # hours

    @staticmethod
    def optimal_light_window(
        cbtmin: time,
        direction: Literal["advance", "delay"],
        duration_min: int = 60
    ) -> Tuple[time, time]:
        """
        Calculate optimal light exposure window for maximum phase shift.

        Args:
            cbtmin: Current CBTmin time
            direction: "advance" (eastward) or "delay" (westward)
            duration_min: Desired exposure duration in minutes

        Returns:
            Tuple of (start_time, end_time) for optimal light exposure
        """
        cbtmin_minutes = time_to_minutes(cbtmin)

        if direction == "advance":
            # ADVANCE: Light 0-4h AFTER CBTmin, peak at +2.5h
            # Center the window around peak effect
            center = cbtmin_minutes + int(LightPRC.ADVANCE_PEAK * 60)
            start = center - duration_min // 2
            end = center + duration_min // 2
        else:
            # DELAY: Light 0-4h BEFORE CBTmin, peak at -2.5h
            center = cbtmin_minutes + int(LightPRC.DELAY_PEAK * 60)
            start = center - duration_min // 2
            end = center + duration_min // 2

        return (minutes_to_time(start), minutes_to_time(end))

    @staticmethod
    def light_avoid_window(
        cbtmin: time,
        direction: Literal["advance", "delay"]
    ) -> Tuple[time, time]:
        """
        Calculate window to avoid bright light (prevents antidromic shifts).

        Light in the opposite zone would shift the clock the wrong direction.

        Args:
            cbtmin: Current CBTmin time
            direction: The adaptation direction

        Returns:
            Tuple of (start_time, end_time) for light avoidance
        """
        cbtmin_minutes = time_to_minutes(cbtmin)

        if direction == "advance":
            # When advancing, avoid light BEFORE CBTmin (delay zone)
            start = cbtmin_minutes + int(LightPRC.DELAY_ZONE_START * 60)
            end = cbtmin_minutes + int(LightPRC.DELAY_ZONE_END * 60)
        else:
            # When delaying, avoid light AFTER CBTmin (advance zone)
            start = cbtmin_minutes + int(LightPRC.ADVANCE_ZONE_START * 60)
            end = cbtmin_minutes + int(LightPRC.ADVANCE_ZONE_END * 60)

        return (minutes_to_time(start), minutes_to_time(end))

    @staticmethod
    def light_sensitivity(cbtmin: time, check_time: time) -> float:
        """
        Calculate relative light sensitivity (0-1) at a given time.

        Peak sensitivity at CBTmin crossover, decreasing toward edges of zones.
        Useful for understanding how effective light will be at different times.

        Args:
            cbtmin: Current CBTmin time
            check_time: Time to check sensitivity

        Returns:
            Sensitivity factor 0-1 (0 = no effect, 1 = maximum effect)
        """
        cbtmin_minutes = time_to_minutes(cbtmin)
        check_minutes = time_to_minutes(check_time)

        # Calculate hours from CBTmin
        diff_minutes = check_minutes - cbtmin_minutes
        if diff_minutes > 12 * 60:
            diff_minutes -= 24 * 60
        elif diff_minutes < -12 * 60:
            diff_minutes += 24 * 60

        hours_from_cbtmin = diff_minutes / 60

        # Within advance zone (0 to +4h from CBTmin)
        if 0 <= hours_from_cbtmin <= 4:
            # Peak at +2.5h
            distance_from_peak = abs(hours_from_cbtmin - LightPRC.ADVANCE_PEAK)
            return max(0, 1 - distance_from_peak / 2.5)

        # Within delay zone (-4h to 0 from CBTmin)
        if -4 <= hours_from_cbtmin < 0:
            # Peak at -2.5h
            distance_from_peak = abs(hours_from_cbtmin - LightPRC.DELAY_PEAK)
            return max(0, 1 - distance_from_peak / 2.5)

        # Outside sensitive zones
        return 0.0


class MelatoninPRC:
    """
    Burgess et al. (2010) Phase Response Curve for melatonin.

    Key findings:
    - Melatonin PRC is inverted relative to light PRC
    - Evening melatonin (before DLMO) → phase ADVANCE
    - Morning melatonin (after DLMO) → phase DELAY
    - Both 0.5mg and 3.0mg doses were effective
    - Fast-release formulations preferred over slow-release

    Cochrane Review (Herxheimer & Petrie, 2002):
    - NNT = 2 for jet lag reduction
    - Effective for flights crossing 5+ timezones
    """

    # PRC constants (hours relative to DLMO)
    ADVANCE_OPTIMAL = -5.0      # 5h before DLMO (afternoon/early evening)
    DELAY_OPTIMAL = 10.0        # ~10h after DLMO (morning)

    # Maximum achievable shifts
    MAX_ADVANCE_PER_DAY = 1.5   # hours (with 0.5mg)
    MAX_DELAY_PER_DAY = 1.0     # hours (less commonly used)

    @staticmethod
    def optimal_melatonin_time(
        dlmo: time,
        direction: Literal["advance", "delay"]
    ) -> time:
        """
        Calculate optimal melatonin timing for maximum phase shift.

        Args:
            dlmo: Current DLMO time
            direction: "advance" (eastward) or "delay" (westward)

        Returns:
            Optimal time to take melatonin
        """
        dlmo_minutes = time_to_minutes(dlmo)

        if direction == "advance":
            # ADVANCE: Take ~5h before DLMO (afternoon/early evening)
            melatonin_minutes = dlmo_minutes + int(MelatoninPRC.ADVANCE_OPTIMAL * 60)
        else:
            # DELAY: Take ~10h after DLMO (morning)
            # Less commonly recommended as delays are easier without melatonin
            melatonin_minutes = dlmo_minutes + int(MelatoninPRC.DELAY_OPTIMAL * 60)

        return minutes_to_time(melatonin_minutes)

    @staticmethod
    def is_delay_melatonin_recommended(total_shift: float) -> bool:
        """
        Determine if melatonin should be used for delay (westward) travel.

        Morning melatonin for delays:
        - Can cause drowsiness
        - Natural circadian drift already favors delays
        - Only recommend for large shifts (>6h) where extra help is needed

        Args:
            total_shift: Total hours to shift

        Returns:
            True if melatonin recommended for delay direction
        """
        return abs(total_shift) >= 6.0
