"""
Nap timing generation based on the Two-Process Model of sleep regulation.

Scientific basis:
- Borbély (1982): Two-Process Model - sleep propensity = Process S × Process C
- Process S: Homeostatic sleep pressure rises during wakefulness
- Process C: Circadian alertness creates natural dips (post-lunch dip)

Key findings:
- Optimal nap window: 30-50% into the wake period
- Ideal nap time: ~38% into wake period (aligns with circadian dip)
- Naps should end at least 4 hours before main sleep
- Duration depends on sleep debt and time until main sleep
"""

from datetime import time
from typing import Optional, Tuple

from .types import Intervention
from .circadian_math import (
    time_to_minutes,
    minutes_to_time,
    format_time,
    format_time_12h,
    calculate_intervention_time,
)


def calculate_nap_window(
    wake_time: time,
    sleep_time: time,
    sleep_debt_hours: float = 0.0
) -> Optional[Tuple[time, time, time, int]]:
    """
    Calculate optimal nap timing based on the Two-Process Model.

    Algorithm:
    - wake_period = sleep_time - wake_time
    - nap_window_start = wake_time + (wake_period * 0.30)
    - nap_window_end = wake_time + (wake_period * 0.50)
    - ideal_nap_time = wake_time + (wake_period * 0.38)
    - latest_nap_end = sleep_time - 4 hours

    Duration by sleep debt:
    - < 1h debt: 15-20 min (power nap)
    - < 3h debt: 20-30 min (standard nap)
    - >= 3h debt with 8h+ until sleep: 90 min (full cycle)
    - else: 20 min (avoid deep sleep interference)

    Args:
        wake_time: Target wake time for this day
        sleep_time: Target sleep time for this day
        sleep_debt_hours: Estimated sleep debt in hours

    Returns:
        Tuple of (window_start, window_end, ideal_time, duration_min)
        or None if no valid nap window exists
    """
    wake_minutes = time_to_minutes(wake_time)
    sleep_minutes = time_to_minutes(sleep_time)

    # Handle overnight sleep (sleep_time is next day)
    if sleep_minutes <= wake_minutes:
        sleep_minutes += 24 * 60

    wake_period = sleep_minutes - wake_minutes

    # Skip nap for very short wake periods (< 6 hours)
    if wake_period < 6 * 60:
        return None

    # Calculate window times
    window_start_min = wake_minutes + int(wake_period * 0.30)
    window_end_min = wake_minutes + int(wake_period * 0.50)
    ideal_min = wake_minutes + int(wake_period * 0.38)

    # Latest nap end: 4 hours before sleep
    latest_end_min = sleep_minutes - (4 * 60)

    # Constrain window_end by latest_nap_end
    window_end_min = min(window_end_min, latest_end_min)

    # If window is invalid (too close to sleep), return None
    if window_end_min <= window_start_min:
        return None

    # Ensure ideal time is within the constrained window
    if ideal_min > window_end_min:
        ideal_min = window_start_min + (window_end_min - window_start_min) // 2

    # Calculate time until sleep from ideal nap time
    time_until_sleep_min = sleep_minutes - ideal_min

    # Calculate recommended duration based on sleep debt
    if sleep_debt_hours < 1:
        duration = 20  # Power nap
    elif sleep_debt_hours < 3:
        duration = 25  # Moderate nap
    else:
        # Check if we have time for full cycle
        if time_until_sleep_min > 8 * 60:  # More than 8 hours
            duration = 90  # Full sleep cycle
        else:
            duration = 20  # Short nap to avoid grogginess

    return (
        minutes_to_time(window_start_min),
        minutes_to_time(window_end_min),
        minutes_to_time(ideal_min),
        duration
    )


def generate_nap_intervention(
    wake_time: time,
    sleep_time: time,
    sleep_debt_hours: float = 0.0
) -> Optional[Intervention]:
    """
    Generate a nap intervention for the given wake/sleep times.

    Args:
        wake_time: Target wake time
        sleep_time: Target sleep time
        sleep_debt_hours: Estimated sleep debt

    Returns:
        Intervention object with nap window details, or None if no valid window
    """
    result = calculate_nap_window(wake_time, sleep_time, sleep_debt_hours)
    if result is None:
        return None

    window_start, window_end, ideal_time, duration = result

    # Format duration description
    if duration == 90:
        duration_desc = "90 min full cycle"
    elif duration >= 25:
        duration_desc = f"{duration} min"
    else:
        duration_desc = f"{duration} min power nap"

    return Intervention(
        time=format_time(window_start),
        type="nap_window",
        title=f"Nap window ({duration_desc})",
        description=(
            f"Best time to nap is around {format_time_12h(ideal_time)}. "
            f"Window closes at {format_time_12h(window_end)}. "
            f"Set an alarm to avoid oversleeping."
        ),
        duration_min=duration,
        window_end=format_time(window_end),
        ideal_time=format_time(ideal_time)
    )


def generate_shifted_nap_intervention(
    base_wake: time,
    base_sleep: time,
    cumulative_shift: float,
    direction: str,
    total_shift: float,
    day: int,
    sleep_debt_hours: float = 0.0
) -> Optional[Intervention]:
    """
    Generate nap intervention with shifted wake/sleep times.

    Uses timezone-aware calculation like other interventions.

    Args:
        base_wake: User's base wake time
        base_sleep: User's base sleep time
        cumulative_shift: Hours shifted so far
        direction: "advance" or "delay"
        total_shift: Total shift needed (absolute)
        day: Day relative to departure
        sleep_debt_hours: Base sleep debt (will be adjusted by day)

    Returns:
        Intervention object or None
    """
    # Get shifted wake/sleep times for this day
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

    # Estimate sleep debt based on day in journey
    # Day 0 (flight) and Day 1 (arrival) typically have higher debt
    estimated_debt = sleep_debt_hours
    if day == 0:
        estimated_debt = max(estimated_debt, 2.0)  # Flight day disruption
    elif day == 1:
        estimated_debt = max(estimated_debt, 3.0)  # Arrival day jet lag peak

    return generate_nap_intervention(
        current_wake,
        current_sleep,
        estimated_debt
    )
