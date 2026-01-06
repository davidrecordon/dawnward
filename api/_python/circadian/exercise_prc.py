"""
Exercise intervention generation using Youngstedt et al. 2019 Phase Response Curve.

Scientific basis: Youngstedt SD et al. (2019). Human circadian phase-response
curves for exercise. J Physiol, 597(8), 2253-2268.

Key findings:
- Exercise at 7:00 AM and 1:00-4:00 PM advanced circadian phase
- Exercise at 7:00-10:00 PM delayed circadian phase
- Pattern roughly similar to light PRC but with smaller effect sizes
- Effect sizes: ~0.5-1h (vs ~2-3h for light)

Additional context from Thomas et al. (2020):
- Effects vary with chronotype
- Morning exercise particularly helpful for late chronotypes
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


def generate_exercise_windows(
    wake_time: time,
    sleep_time: time,
    direction: str,
    duration_min: int = 30
) -> List[Intervention]:
    """
    Generate exercise intervention windows based on Youngstedt PRC.

    PRC Rules (from J Physiol 597:2253-2268):
    - ADVANCE: Exercise 7 AM - 4 PM (morning/early afternoon)
    - DELAY: Exercise 7-10 PM (evening)

    Effect size is smaller than light (~0.5-1h vs ~2-3h), but provides
    additive benefit when combined with light therapy.

    Args:
        wake_time: User's habitual wake time
        sleep_time: User's habitual sleep time
        direction: "advance" or "delay"
        duration_min: Exercise duration in minutes (default 30)

    Returns:
        List of Intervention objects
    """
    interventions = []
    wake_minutes = time_to_minutes(wake_time)
    sleep_minutes = time_to_minutes(sleep_time)

    if direction == "advance":
        # ADVANCE: Morning to early afternoon exercise (7 AM - 4 PM)
        # Recommend ~1-2 hours after wake for practical scheduling
        exercise_minutes = wake_minutes + 90  # 1.5h after wake
        exercise_time = minutes_to_time(exercise_minutes)

        interventions.append(Intervention(
            time=format_time(exercise_time),
            type="exercise",
            title="Morning exercise",
            description="Moderate aerobic exercise (brisk walk, jog, cycling) "
                       "helps advance your circadian clock. "
                       "Outdoor exercise combines light and exercise benefits.",
            duration_min=duration_min
        ))

    else:  # delay
        # DELAY: Evening exercise (7-10 PM)
        # Recommend ~3-4 hours before sleep
        exercise_minutes = sleep_minutes - 210  # 3.5h before sleep
        exercise_time = minutes_to_time(exercise_minutes)

        interventions.append(Intervention(
            time=format_time(exercise_time),
            type="exercise",
            title="Evening exercise",
            description="Moderate aerobic exercise (brisk walk, jog, cycling) "
                       "helps delay your circadian clock. "
                       "Avoid intense exercise too close to bedtime.",
            duration_min=duration_min
        ))

    return interventions


def generate_shifted_exercise_windows(
    base_wake: time,
    base_sleep: time,
    cumulative_shift: float,
    direction: str,
    duration_min: int = 30
) -> List[Intervention]:
    """
    Generate exercise windows accounting for phase shift progress.

    Args:
        base_wake: Original wake time before shifting
        base_sleep: Original sleep time before shifting
        cumulative_shift: Hours already shifted
        direction: "advance" or "delay"
        duration_min: Exercise duration

    Returns:
        List of Intervention objects
    """
    # Shift wake/sleep times based on progress
    shift_hours = cumulative_shift if direction == "advance" else -cumulative_shift
    current_wake = shift_time(base_wake, shift_hours)
    current_sleep = shift_time(base_sleep, shift_hours)

    return generate_exercise_windows(current_wake, current_sleep, direction, duration_min)
