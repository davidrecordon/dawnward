"""
Light intervention generation using Khalsa et al. 2003 Phase Response Curve.

Scientific basis: Khalsa SBS et al. (2003). A phase response curve to single
bright light pulses in human subjects. J Physiol, 549(3), 945-952.

Key findings:
- Peak-to-trough amplitude: ~5 hours
- Maximum phase delays: ~3.4 hours (light 0-4h before CBTmin)
- Maximum phase advances: ~2.0 hours (light 0-4h after CBTmin)
- Crossover point near CBTmin (critical - avoid light here)

Sleep-aware adjustments:
- Light timing is adjusted to fall within waking hours
- ADVANCE: light_seek clamped to wake time if PRC timing is during sleep
- DELAY: light_seek moved to evening (2-3h before sleep) for practicality
- light_avoid windows truncated to waking hours only
"""

from datetime import time
from typing import List, Optional, Tuple

from .types import Intervention
from .circadian_math import (
    time_to_minutes,
    minutes_to_time,
    format_time,
    format_time_12h,
    shift_time,
    calculate_intervention_time,
)


def _is_during_sleep(time_minutes: int, sleep_minutes: int, wake_minutes: int) -> bool:
    """
    Check if a time (in minutes) falls during the sleep window.

    Handles the common case where sleep crosses midnight (e.g., 23:00 to 07:00).

    Args:
        time_minutes: Time to check (minutes since midnight)
        sleep_minutes: Sleep time (minutes since midnight)
        wake_minutes: Wake time (minutes since midnight)

    Returns:
        True if time falls within the sleep window
    """
    time_minutes = time_minutes % (24 * 60)

    if sleep_minutes > wake_minutes:  # Sleep crosses midnight
        return time_minutes >= sleep_minutes or time_minutes < wake_minutes
    else:  # Sleep doesn't cross midnight (rare)
        return sleep_minutes <= time_minutes < wake_minutes


def _truncate_to_waking_hours(
    start_minutes: int,
    end_minutes: int,
    sleep_minutes: int,
    wake_minutes: int
) -> Optional[Tuple[int, int, int]]:
    """
    Truncate a time window to only include waking hours.

    Args:
        start_minutes: Window start (minutes since midnight)
        end_minutes: Window end (minutes since midnight)
        sleep_minutes: Sleep time (minutes since midnight)
        wake_minutes: Wake time (minutes since midnight)

    Returns:
        Tuple of (adjusted_start, adjusted_end, duration_minutes) or None if fully during sleep
    """
    start_minutes = start_minutes % (24 * 60)
    end_minutes = end_minutes % (24 * 60)

    # Check if both start and end are during sleep
    start_during_sleep = _is_during_sleep(start_minutes, sleep_minutes, wake_minutes)
    end_during_sleep = _is_during_sleep(end_minutes, sleep_minutes, wake_minutes)

    if start_during_sleep and end_during_sleep:
        # Both endpoints during sleep - check if window spans waking hours
        # (e.g., start at 2am, end at 10am spans wake at 7am)
        # For simplicity, if both are during sleep, skip the intervention
        return None

    adjusted_start = start_minutes
    adjusted_end = end_minutes

    # Adjust start if it falls during sleep
    if start_during_sleep:
        adjusted_start = wake_minutes

    # Adjust end if it falls during sleep
    if end_during_sleep:
        adjusted_end = sleep_minutes

    # Calculate new duration
    duration = adjusted_end - adjusted_start
    if duration <= 0:
        duration += 24 * 60  # Handle midnight crossing

    # If duration is too short (less than 30 min), skip
    if duration < 30:
        return None

    return (adjusted_start, adjusted_end, duration)


def generate_light_windows(
    wake_time: time,
    sleep_time: time,
    cbtmin_time: time,
    direction: str,
    duration_min: int = 60
) -> List[Intervention]:
    """
    Generate light seek and avoid windows based on Khalsa PRC.

    PRC Rules (from J Physiol 549:945-952):
    - ADVANCE: Seek light 0-4h AFTER CBTmin (peak effect at +2.5h)
    - DELAY: Seek light 0-4h BEFORE CBTmin (peak effect at -2.5h)
    - AVOID: Light in opposite window to prevent antidromic shifts

    Sleep-aware adjustments:
    - ADVANCE light_seek: Clamped to wake_time if PRC timing is during sleep
    - DELAY light_seek: Evening timing (3h before sleep) for practicality
    - light_avoid: Truncated to waking hours only

    Args:
        wake_time: User's target wake time for this day
        sleep_time: User's target sleep time for this day
        cbtmin_time: Estimated CBTmin for this day
        direction: "advance" or "delay"
        duration_min: Duration of light exposure in minutes (default 60)

    Returns:
        List of Intervention objects (light_seek, light_avoid)
    """
    interventions = []
    cbtmin_minutes = time_to_minutes(cbtmin_time)
    wake_minutes = time_to_minutes(wake_time)
    sleep_minutes = time_to_minutes(sleep_time)

    if direction == "advance":
        # ADVANCE: Seek light 0-4h AFTER CBTmin
        # Optimal timing: ~2h after CBTmin, but clamp to wake_time if during sleep
        ideal_seek_minutes = cbtmin_minutes + 120  # 2h after CBTmin

        if _is_during_sleep(ideal_seek_minutes, sleep_minutes, wake_minutes):
            # Clamp to wake_time - still in advance zone (0-4h after CBTmin)
            seek_start_minutes = wake_minutes
        else:
            seek_start_minutes = ideal_seek_minutes

        seek_time = minutes_to_time(seek_start_minutes)

        interventions.append(Intervention(
            time=format_time(seek_time),
            type="light_seek",
            title="Seek bright light",
            description="Get bright outdoor light or use a 10,000 lux lightbox. "
                       "This helps advance your circadian clock for eastward travel.",
            duration_min=duration_min
        ))

        # AVOID: Light 0-4h BEFORE CBTmin (would cause delay)
        # Truncate to waking hours only
        avoid_start_minutes = cbtmin_minutes - 240  # 4h before CBTmin
        avoid_end_minutes = cbtmin_minutes

        truncated = _truncate_to_waking_hours(
            avoid_start_minutes, avoid_end_minutes,
            sleep_minutes, wake_minutes
        )

        if truncated:
            adjusted_start, adjusted_end, adjusted_duration = truncated
            avoid_start = minutes_to_time(adjusted_start)
            avoid_end = minutes_to_time(adjusted_end)

            interventions.append(Intervention(
                time=format_time(avoid_start),
                type="light_avoid",
                title="Avoid bright light",
                description=f"Wear sunglasses or stay indoors until {format_time_12h(avoid_end)}. "
                           "Light now would shift your clock the wrong direction.",
                duration_min=adjusted_duration
            ))

    else:  # delay
        # DELAY: Evening light exposure (3h before sleep)
        # Changed from CBTmin-based to sleep-based timing for practicality
        seek_start_minutes = sleep_minutes - 180  # 3h before sleep
        seek_time = minutes_to_time(seek_start_minutes)

        interventions.append(Intervention(
            time=format_time(seek_time),
            type="light_seek",
            title="Seek bright light",
            description="Get bright outdoor light or use a 10,000 lux lightbox. "
                       "Evening light helps delay your circadian clock for westward travel.",
            duration_min=duration_min
        ))

        # AVOID: Light 0-4h AFTER CBTmin (would cause advance)
        # Truncate to waking hours only
        avoid_start_minutes = cbtmin_minutes
        avoid_end_minutes = cbtmin_minutes + 240  # 4h after CBTmin

        truncated = _truncate_to_waking_hours(
            avoid_start_minutes, avoid_end_minutes,
            sleep_minutes, wake_minutes
        )

        if truncated:
            adjusted_start, adjusted_end, adjusted_duration = truncated
            avoid_start = minutes_to_time(adjusted_start)
            avoid_end = minutes_to_time(adjusted_end)

            interventions.append(Intervention(
                time=format_time(avoid_start),
                type="light_avoid",
                title="Avoid bright light",
                description=f"Wear sunglasses or stay indoors until {format_time_12h(avoid_end)}. "
                           "Morning light would shift your clock the wrong direction.",
                duration_min=adjusted_duration
            ))

    return interventions


def generate_shifted_light_windows(
    base_wake: time,
    base_sleep: time,
    base_cbtmin: time,
    cumulative_shift: float,
    direction: str,
    total_shift: float = 0.0,
    day: int = 0,
    duration_min: int = 60
) -> List[Intervention]:
    """
    Generate light windows accounting for phase shift progress.

    As the circadian clock shifts, the optimal light timing shifts too.
    Wake, sleep, and CBTmin all shift together.

    Uses timezone-aware calculation:
    - Pre-departure (day <= 0): Times shifted from base in origin timezone
    - Post-arrival (day >= 1): Times offset from ideal in destination timezone

    Args:
        base_wake: Original wake time before any shifting
        base_sleep: Original sleep time before any shifting
        base_cbtmin: Original CBTmin before any shifting
        cumulative_shift: Hours already shifted (positive = advanced)
        direction: "advance" or "delay"
        total_shift: Total shift needed (absolute value)
        day: Day relative to departure (negative = prep, 0 = flight, positive = arrival)
        duration_min: Duration of light exposure

    Returns:
        List of Intervention objects
    """
    # Shift all times based on progress using timezone-aware helper
    current_wake = calculate_intervention_time(
        base_time=base_wake,
        cumulative_shift=cumulative_shift,
        total_shift=total_shift,
        direction=direction,
        day=day
    )
    current_sleep = calculate_intervention_time(
        base_time=base_sleep,
        cumulative_shift=cumulative_shift,
        total_shift=total_shift,
        direction=direction,
        day=day
    )
    current_cbtmin = calculate_intervention_time(
        base_time=base_cbtmin,
        cumulative_shift=cumulative_shift,
        total_shift=total_shift,
        direction=direction,
        day=day
    )

    return generate_light_windows(
        current_wake, current_sleep, current_cbtmin,
        direction, duration_min
    )
