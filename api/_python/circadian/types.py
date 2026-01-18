"""
Data structures for schedule generation.

Includes both day-based types (backward compatible) and phase-based types (new).
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

# =============================================================================
# Phase Types (New - for phase-based scheduler)
# =============================================================================

PhaseType = Literal[
    "preparation",  # Full days before departure
    "pre_departure",  # Departure day, before flight
    "in_transit",  # On the plane (< 12h flights)
    "in_transit_ulr",  # Ultra-long-range flight (12+ hours)
    "post_arrival",  # Arrival day, after landing
    "adaptation",  # Full days at destination
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
    start_datetime: datetime  # Actual start (not midnight)
    end_datetime: datetime  # Actual end (not midnight)
    timezone: str | None  # IANA timezone (None for in_transit)

    # Circadian context
    cumulative_shift: float  # Hours shifted so far
    remaining_shift: float  # Hours left to shift
    day_number: int  # For backward compatibility with UI

    # Phase metadata
    available_for_interventions: bool = True  # False for in_transit

    # Optional in-transit metadata
    flight_duration_hours: float | None = None
    sleep_windows: list[dict[str, Any]] | None = None  # For ULR flights

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

    origin_tz: str  # IANA timezone (e.g., "America/Los_Angeles")
    dest_tz: str  # IANA timezone (e.g., "Asia/Tokyo")
    departure_datetime: str  # ISO format local time at origin
    arrival_datetime: str  # ISO format local time at destination


NapPreference = Literal["no", "flight_only", "all_days"]

# Schedule intensity controls circadian shift rates (direction-specific).
# See INTENSITY_CONFIGS in scheduling/shift_calculator.py for rate values.
ScheduleIntensity = Literal["gentle", "balanced", "aggressive"]


@dataclass
class ScheduleRequest:
    """Input from the trip form."""

    legs: list[TripLeg]
    prep_days: int  # 1-7, will be auto-adjusted if needed
    wake_time: str  # "07:00" format
    sleep_time: str  # "23:00" format
    uses_melatonin: bool = True
    uses_caffeine: bool = True
    uses_exercise: bool = False
    caffeine_cutoff_hours: int = 8  # Hours before sleep to stop caffeine (6/8/10/12)
    light_exposure_minutes: int = 60  # Duration per light session (30/45/60/90)
    nap_preference: NapPreference = "flight_only"
    schedule_intensity: ScheduleIntensity = "balanced"


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
class FlightContext:
    """
    Flight timing for pre-landing detection and offset calculation.

    Internal to scheduler - not exposed to frontend.
    """

    departure_utc: datetime  # UTC datetime of departure
    arrival_utc: datetime  # UTC datetime of arrival


@dataclass
class Intervention:
    """
    Single scheduled intervention with complete timezone context.

    Each intervention is self-describing: it carries both origin and destination
    times/dates/timezones, so consumers (UI, calendar sync) don't need external
    context to display or process it.

    Internal workflow:
    1. InterventionPlanner creates with `time` field (local time in phase timezone)
    2. Scheduler enriches with `_enrich_with_timezone_context()` to populate all fields
    3. Frontend receives populated origin_time/dest_time (ignores `time`)
    """

    # Core fields
    type: InterventionType
    title: str  # Display title
    description: str  # User-facing explanation
    duration_min: int | None = None  # For time-window interventions

    # Internal: local time in phase timezone (used during planning, ignored by frontend)
    time: str | None = None  # "HH:MM" - enrichment uses this to compute origin/dest times

    # Dual timezone times - frontend picks which to display based on phase_type
    origin_time: str | None = None  # "HH:MM" in origin timezone
    dest_time: str | None = None  # "HH:MM" in destination timezone
    origin_date: str | None = None  # "YYYY-MM-DD" in origin timezone
    dest_date: str | None = None  # "YYYY-MM-DD" in destination timezone

    # Trip timezone context (always present after enrichment)
    origin_tz: str | None = None  # Trip's origin IANA timezone
    dest_tz: str | None = None  # Trip's destination IANA timezone

    # Phase info
    phase_type: PhaseType | None = None  # Which phase this belongs to
    show_dual_timezone: bool = False  # True = display both origin and dest times

    # Nap window fields - internal uses local, enrichment converts to UTC
    window_end: str | None = None  # "HH:MM" internal local time (legacy, used by planner)
    ideal_time: str | None = None  # "HH:MM" internal local time (legacy, used by planner)
    window_end_utc: str | None = None  # ISO 8601 UTC (after enrichment)
    ideal_time_utc: str | None = None  # ISO 8601 UTC (after enrichment)

    # In-flight sleep windows only
    flight_offset_hours: float | None = None  # Pre-computed hours into flight


@dataclass
class DaySchedule:
    """
    Interventions for one day/phase.

    Note: timezone removed - each intervention now carries its own timezone context.
    DaySchedule is now just a grouping container.
    """

    day: int  # Relative to departure (-3, -2, -1, 0, 1, 2...)
    date: str  # "2025-01-12" ISO date
    items: list[Intervention] = field(default_factory=list)

    # Phase metadata
    phase_type: PhaseType | None = None
    phase_start: str | None = None  # "HH:MM" when phase starts
    phase_end: str | None = None  # "HH:MM" when phase ends
    phase_spans_midnight: bool | None = None  # True if phase ends the next day

    # In-transit flag for UI section styling
    is_in_transit: bool = False


@dataclass
class ScheduleResponse:
    """Output to the frontend."""

    total_shift_hours: float
    direction: Literal["advance", "delay"]
    estimated_adaptation_days: int
    origin_tz: str  # Origin IANA timezone
    dest_tz: str  # Destination IANA timezone
    interventions: list[DaySchedule]

    # Science impact stored internally, not exposed by default
    # Per flight-timing-edge-cases.md decision:
    # - Only surface in "Compare Flights" feature (future scope)
    # - Never phrase as a loss; phrase as timeline ("adapts in X days")
    _science_impact_internal: str | None = None

    def get_science_impact(self, context: str = "default") -> str | None:
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
