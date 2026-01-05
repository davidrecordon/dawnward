"""
Light intervention generation using Khalsa et al. 2003 Phase Response Curve.

Scientific basis: Khalsa SBS et al. (2003). A phase response curve to single
bright light pulses in human subjects. J Physiol, 549(3), 945-952.

Key findings:
- Peak-to-trough amplitude: ~5 hours
- Maximum phase delays: ~3.4 hours (light 0-4h before CBTmin)
- Maximum phase advances: ~2.0 hours (light 0-4h after CBTmin)
- Crossover point near CBTmin (critical - avoid light here)
"""

from datetime import time
from typing import List

from .types import Intervention
from .circadian_math import (
    time_to_minutes,
    minutes_to_time,
    format_time,
    shift_time,
)


def generate_light_windows(
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

    Args:
        cbtmin_time: Estimated CBTmin for this day
        direction: "advance" or "delay"
        duration_min: Duration of light exposure in minutes (default 60)

    Returns:
        List of Intervention objects (light_seek, light_avoid)
    """
    interventions = []
    cbtmin_minutes = time_to_minutes(cbtmin_time)

    if direction == "advance":
        # ADVANCE: Seek light 0-4h AFTER CBTmin
        # Optimal timing: ~2h after CBTmin for practical scheduling
        seek_start_minutes = cbtmin_minutes + 120  # 2h after CBTmin
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
        avoid_start_minutes = cbtmin_minutes - 240  # 4h before CBTmin
        avoid_end_minutes = cbtmin_minutes
        avoid_start = minutes_to_time(avoid_start_minutes)
        avoid_end = minutes_to_time(avoid_end_minutes)

        interventions.append(Intervention(
            time=format_time(avoid_start),
            type="light_avoid",
            title="Avoid bright light",
            description=f"Wear sunglasses or stay indoors until {format_time(avoid_end)}. "
                       "Light now would shift your clock the wrong direction.",
            duration_min=240  # 4 hours
        ))

    else:  # delay
        # DELAY: Seek light 0-4h BEFORE CBTmin
        # Optimal timing: ~2h before CBTmin
        seek_start_minutes = cbtmin_minutes - 120  # 2h before CBTmin
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
        avoid_start_minutes = cbtmin_minutes
        avoid_end_minutes = cbtmin_minutes + 240  # 4h after CBTmin
        avoid_start = minutes_to_time(avoid_start_minutes)
        avoid_end = minutes_to_time(avoid_end_minutes)

        interventions.append(Intervention(
            time=format_time(avoid_start),
            type="light_avoid",
            title="Avoid bright light",
            description=f"Wear sunglasses or stay indoors until {format_time(avoid_end)}. "
                       "Morning light would shift your clock the wrong direction.",
            duration_min=240  # 4 hours
        ))

    return interventions


def generate_shifted_light_windows(
    base_cbtmin: time,
    cumulative_shift: float,
    direction: str,
    duration_min: int = 60
) -> List[Intervention]:
    """
    Generate light windows accounting for phase shift progress.

    As the circadian clock shifts, the optimal light timing shifts too.

    Args:
        base_cbtmin: Original CBTmin before any shifting
        cumulative_shift: Hours already shifted (positive = advanced)
        direction: "advance" or "delay"
        duration_min: Duration of light exposure

    Returns:
        List of Intervention objects
    """
    # Shift CBTmin based on progress
    shift_hours = cumulative_shift if direction == "advance" else -cumulative_shift
    current_cbtmin = shift_time(base_cbtmin, shift_hours)

    return generate_light_windows(current_cbtmin, direction, duration_min)
