"""
Caffeine strategy generation based on Burke et al. 2015.

Scientific basis: Burke TM et al. (2015). Effects of caffeine on the human
circadian clock in vivo and in vitro. Sci Transl Med, 7(305), 305ra146.

Key findings:
- Evening caffeine (3h before bed) causes ~40-minute phase delay
- Approximately half the magnitude of bright light exposure
- Mechanism: adenosine A1 receptor/cAMP-dependent pathway
- Half-life: 3-5 hours (significant individual variation via ADORA2A gene)

Practical use:
- Maintain alertness during required wake times
- Avoid within 6-8 hours of desired sleep
- Can strategically support westward travel (delays)
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


def generate_caffeine_strategy(
    sleep_time: time,
    wake_time: time,
    cutoff_hours: int = 6
) -> List[Intervention]:
    """
    Generate caffeine OK and cutoff interventions.

    Caffeine half-life is 3-5 hours, so avoid within 6+ hours of sleep
    for minimal sleep disruption.

    Args:
        sleep_time: Target sleep time for this day
        wake_time: Target wake time for this day
        cutoff_hours: Hours before sleep to stop caffeine (default 6)

    Returns:
        List of Intervention objects (caffeine_ok, caffeine_cutoff)
    """
    interventions = []
    sleep_minutes = time_to_minutes(sleep_time)
    wake_minutes = time_to_minutes(wake_time)

    # Caffeine cutoff time
    cutoff_minutes = sleep_minutes - (cutoff_hours * 60)
    cutoff_time = minutes_to_time(cutoff_minutes)

    # Caffeine OK from wake until cutoff
    interventions.append(Intervention(
        time=format_time(wake_time),
        type="caffeine_ok",
        title="Caffeine OK",
        description=f"Coffee and caffeinated drinks are fine until {format_time(cutoff_time)}.",
        duration_min=None
    ))

    interventions.append(Intervention(
        time=format_time(cutoff_time),
        type="caffeine_cutoff",
        title="Caffeine cutoff",
        description="Stop caffeine now to protect your sleep. "
                   "Caffeine has a 3-5 hour half-life and can disrupt sleep quality.",
        duration_min=None
    ))

    return interventions


def generate_shifted_caffeine_strategy(
    base_sleep: time,
    base_wake: time,
    cumulative_shift: float,
    direction: str,
    cutoff_hours: int = 6
) -> List[Intervention]:
    """
    Generate caffeine strategy accounting for phase shift progress.

    Args:
        base_sleep: Original sleep time
        base_wake: Original wake time
        cumulative_shift: Hours already shifted
        direction: "advance" or "delay"
        cutoff_hours: Hours before sleep to stop caffeine

    Returns:
        List of Intervention objects
    """
    # Shift sleep/wake times based on progress
    shift_hours = cumulative_shift if direction == "advance" else -cumulative_shift
    current_sleep = shift_time(base_sleep, shift_hours)
    current_wake = shift_time(base_wake, shift_hours)

    return generate_caffeine_strategy(current_sleep, current_wake, cutoff_hours)
