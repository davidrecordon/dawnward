"""
Data structures for schedule generation.

Includes both day-based types (backward compatible) and phase-based types (new).
"""

from dataclasses import dataclass, field
from datetime import datetime, time
from typing import List, Literal, Optional, Any, Dict


# =============================================================================
# Phase Types (New - for phase-based scheduler)
# =============================================================================

PhaseType = Literal[
    "preparation",      # Full days before departure
    "pre_departure",    # Departure day, before flight
    "in_transit",       # On the plane (< 12h flights)
    "in_transit_ulr",   # Ultra-long-range flight (12+ hours)
    "post_arrival",     # Arrival day, after landing
    "adaptation",       # Full days at destination
]


@dataclass
class TravelPhase:
    """
    A distinct phase of the trip with its own scheduling rules.

    Phases replace the day-based model to properly handle:
    - Partial days (pre-departure, post-arrival)
    - In-transit periods (no interventions during flight)
    - Flight time awareness (activities after landing, not before)
    """
    phase_type: PhaseType
    start_datetime: datetime          # Actual start (not midnight)
    end_datetime: datetime            # Actual end (not midnight)
    timezone: Optional[str]           # IANA timezone (None for in_transit)

    # Circadian context
    cumulative_shift: float           # Hours shifted so far
    remaining_shift: float            # Hours left to shift
    day_number: int                   # For backward compatibility with UI

    # Phase metadata
    available_for_interventions: bool = True  # False for in_transit

    # Optional in-transit metadata
    flight_duration_hours: Optional[float] = None
    sleep_windows: Optional[List[Dict[str, Any]]] = None  # For ULR flights

    @property
    def duration_hours(self) -> float:
        """Duration of this phase in hours."""
        return (self.end_datetime - self.start_datetime).total_seconds() / 3600

    @property
    def is_partial_day(self) -> bool:
        """True if phase doesn't span full waking hours."""
        return self.phase_type in ("pre_departure", "post_arrival")

    @property
    def is_ulr_flight(self) -> bool:
        """True if this is an ultra-long-range flight phase."""
        return self.phase_type == "in_transit_ulr"


# =============================================================================
# Trip Leg Types
# =============================================================================

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
    flight_offset_hours: Optional[float] = None  # Hours into flight (for in-transit naps)


@dataclass
class DaySchedule:
    """Interventions for one day/phase."""
    day: int                    # Relative to departure (-3, -2, -1, 0, 1, 2...)
    date: str                   # "2025-01-12" ISO date
    timezone: str               # IANA timezone for this day's times
    items: List[Intervention] = field(default_factory=list)

    # New optional phase fields (backward compatible)
    phase_type: Optional[PhaseType] = None
    phase_start: Optional[str] = None    # "HH:MM" when phase starts
    phase_end: Optional[str] = None      # "HH:MM" when phase ends
    phase_spans_midnight: Optional[bool] = None  # True if phase ends the next day


@dataclass
class ScheduleResponse:
    """Output to the frontend."""
    total_shift_hours: float
    direction: Literal["advance", "delay"]
    estimated_adaptation_days: int
    origin_tz: str              # Origin IANA timezone
    dest_tz: str                # Destination IANA timezone
    interventions: List[DaySchedule]

    # Science impact stored internally, not exposed by default
    # Per flight-timing-edge-cases.md decision:
    # - Only surface in "Compare Flights" feature (future scope)
    # - Never phrase as a loss; phrase as timeline ("adapts in X days")
    _science_impact_internal: Optional[str] = None

    def get_science_impact(self, context: str = "default") -> Optional[str]:
        """
        Get science impact only in appropriate contexts.

        Args:
            context: "compare_flights", "user_asked", or "default"

        Returns:
            Impact string for compare_flights/user_asked, None for default
        """
        if context in ("compare_flights", "user_asked"):
            return self._science_impact_internal
        return None
