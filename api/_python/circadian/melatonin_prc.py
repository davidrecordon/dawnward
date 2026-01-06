"""
Melatonin timing generation using Burgess et al. 2010 Phase Response Curve.

Scientific basis: Burgess HJ et al. (2010). Human phase response curves to
three days of daily melatonin: 0.5 mg versus 3.0 mg. J Clin Endocrinol Metab,
95(7), 3325-3331.

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

from datetime import time
from typing import Optional

from .types import Intervention
from .circadian_math import (
    time_to_minutes,
    minutes_to_time,
    format_time,
    shift_time,
    calculate_intervention_time,
)


def generate_melatonin_timing(
    dlmo_time: time,
    direction: str,
    dose_mg: float = 0.5
) -> Optional[Intervention]:
    """
    Generate melatonin intervention using Burgess PRC.

    PRC Rules (from JCEM 95:3325-3331):
    - ADVANCE: Take melatonin ~5h before DLMO (afternoon/early evening)
    - DELAY: Take melatonin in morning (after DLMO) - rarely recommended

    Dosing: 0.5mg is as effective as higher doses (physiological dose)

    Args:
        dlmo_time: Estimated DLMO for this day
        direction: "advance" or "delay"
        dose_mg: Melatonin dose in mg (default 0.5)

    Returns:
        Intervention object with melatonin timing, or None if not recommended
    """
    dlmo_minutes = time_to_minutes(dlmo_time)

    if direction == "advance":
        # ADVANCE: Take ~5h before DLMO (afternoon/early evening)
        # This is the primary use case for jet lag
        melatonin_minutes = dlmo_minutes - 300  # 5 hours before DLMO
        melatonin_time = minutes_to_time(melatonin_minutes)

        return Intervention(
            time=format_time(melatonin_time),
            type="melatonin",
            title="Take melatonin",
            description=f"Take {dose_mg}mg fast-release melatonin. "
                       "This helps advance your circadian clock for your eastward (advance) travel. "
                       "Take with a small snack if needed.",
            duration_min=None  # Point-in-time intervention
        )

    else:  # delay
        # DELAY: Morning melatonin after DLMO
        # Less commonly recommended - delays are easier without melatonin
        # and morning melatonin can cause drowsiness
        melatonin_minutes = dlmo_minutes + 600  # ~10h after DLMO (morning)
        melatonin_time = minutes_to_time(melatonin_minutes)

        return Intervention(
            time=format_time(melatonin_time),
            type="melatonin",
            title="Take melatonin",
            description=f"Take {dose_mg}mg fast-release melatonin. "
                       "Morning melatonin can help delay your clock, but may cause drowsiness. "
                       "You may not need melatonin for your westward (delay) travel as your body already tends to drift toward a later schedule.",
            duration_min=None
        )


def generate_shifted_melatonin_timing(
    base_dlmo: time,
    cumulative_shift: float,
    direction: str,
    total_shift: float = 0.0,
    day: int = 0,
    dose_mg: float = 0.5
) -> Optional[Intervention]:
    """
    Generate melatonin timing accounting for phase shift progress.

    Uses timezone-aware calculation:
    - Pre-departure (day <= 0): Times shifted from base in origin timezone
    - Post-arrival (day >= 1): Times offset from ideal in destination timezone

    Args:
        base_dlmo: Original DLMO before any shifting
        cumulative_shift: Hours already shifted
        direction: "advance" or "delay"
        total_shift: Total shift needed (absolute value)
        day: Day relative to departure (negative = prep, 0 = flight, positive = arrival)
        dose_mg: Melatonin dose in mg

    Returns:
        Intervention object or None
    """
    # Shift DLMO based on progress using timezone-aware helper
    current_dlmo = calculate_intervention_time(
        base_time=base_dlmo,
        cumulative_shift=cumulative_shift,
        total_shift=total_shift,
        direction=direction,
        day=day
    )

    return generate_melatonin_timing(current_dlmo, direction, dose_mg)
