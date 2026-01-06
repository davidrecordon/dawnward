"""
Data structures for schedule generation.
"""

from dataclasses import dataclass, field
from typing import List, Literal, Optional


@dataclass
class TripLeg:
    """Single flight segment."""
    origin_tz: str              # IANA timezone (e.g., "America/Los_Angeles")
    dest_tz: str                # IANA timezone (e.g., "Asia/Tokyo")
    departure_datetime: str     # ISO format local time at origin
    arrival_datetime: str       # ISO format local time at destination


NapPreference = Literal["no", "flight_only", "all_days"]


@dataclass
class ScheduleRequest:
    """Input from the trip form."""
    legs: List[TripLeg]
    prep_days: int              # 1-7, will be auto-adjusted if needed
    wake_time: str              # "07:00" format
    sleep_time: str             # "23:00" format
    uses_melatonin: bool = True
    uses_caffeine: bool = True
    uses_exercise: bool = False
    nap_preference: NapPreference = "flight_only"


InterventionType = Literal[
    "light_seek",
    "light_avoid",
    "melatonin",
    "exercise",
    "caffeine_ok",
    "caffeine_cutoff",
    "sleep_target",
    "wake_target",
    "nap_window",
]


@dataclass
class Intervention:
    """Single scheduled intervention."""
    time: str                           # "18:00" local time
    type: InterventionType
    title: str                          # Display title
    description: str                    # User-facing explanation
    duration_min: Optional[int] = None  # For time-window interventions
    window_end: Optional[str] = None    # "HH:MM" for nap window end time
    ideal_time: Optional[str] = None    # "HH:MM" for ideal nap time


@dataclass
class DaySchedule:
    """Interventions for one day."""
    day: int                    # Relative to departure (-3, -2, -1, 0, 1, 2...)
    date: str                   # "2025-01-12" ISO date
    timezone: str               # IANA timezone for this day's times
    items: List[Intervention] = field(default_factory=list)


@dataclass
class ScheduleResponse:
    """Output to the frontend."""
    total_shift_hours: float
    direction: Literal["advance", "delay"]
    estimated_adaptation_days: int
    origin_tz: str              # Origin IANA timezone
    dest_tz: str                # Destination IANA timezone
    interventions: List[DaySchedule]
