"""
Phase-based schedule generation (v2).

Generates jet lag adaptation schedules using travel phases instead of calendar days.
This fixes the "activities before landing" and "sleep before departure" bugs.

Architecture:
1. Science layer provides optimal circadian timing (science/)
2. Phase generator creates travel phases from flight legs (scheduling/)
3. Intervention planner queries science for each phase (scheduling/)
4. Constraint filter applies practical limits (scheduling/)
"""

from datetime import datetime
from typing import List, Optional

from .types import (
    TripLeg,
    ScheduleRequest,
    ScheduleResponse,
    DaySchedule,
    TravelPhase,
)
from .circadian_math import (
    calculate_timezone_shift,
    calculate_actual_prep_days,
    get_current_datetime_in_tz,
    format_time,
)
from .scheduling.phase_generator import PhaseGenerator
from .scheduling.intervention_planner import InterventionPlanner
from .scheduling.constraint_filter import ConstraintFilter


class ScheduleGeneratorV2:
    """
    Phase-based schedule generator.

    Replaces the day-based model with travel phases:
    - PREPARATION: Full days before departure
    - PRE_DEPARTURE: Departure day, before flight
    - IN_TRANSIT: On the plane
    - POST_ARRIVAL: Arrival day, after landing
    - ADAPTATION: Full days at destination

    This architecture ensures:
    - No activities scheduled during flight
    - No activities scheduled before landing
    - Proper handling of partial days (pre-departure, post-arrival)
    """

    def generate_schedule(
        self,
        request: ScheduleRequest,
        current_datetime: Optional[datetime] = None
    ) -> ScheduleResponse:
        """
        Generate a complete adaptation schedule for the trip.

        Args:
            request: ScheduleRequest with trip legs and preferences
            current_datetime: Current time for filtering (defaults to now)

        Returns:
            ScheduleResponse with daily intervention schedules
        """
        # Use origin timezone for "now" since user is there during prep days
        if current_datetime is None:
            origin_tz = request.legs[0].origin_tz
            current_datetime = get_current_datetime_in_tz(origin_tz)

        # 1. Calculate total timezone shift
        total_shift, direction = self._calculate_total_shift(request.legs)

        # Get timezone info
        first_leg = request.legs[0]
        last_leg = request.legs[-1]
        origin_tz = first_leg.origin_tz
        dest_tz = last_leg.dest_tz

        # Auto-adjust prep days if departure is sooner than requested
        actual_prep_days = calculate_actual_prep_days(
            first_leg.departure_datetime,
            request.prep_days,
            current_datetime
        )

        # 2. Generate travel phases
        phase_gen = PhaseGenerator(
            legs=request.legs,
            prep_days=actual_prep_days,
            wake_time=request.wake_time,
            sleep_time=request.sleep_time,
            total_shift=total_shift,
            direction=direction
        )
        phases = phase_gen.generate_phases()

        # 3. Plan interventions for each phase
        planner = InterventionPlanner(request, total_shift, direction)
        constraint_filter = ConstraintFilter()

        # Parse departure datetime for sleep_target filtering
        departure_datetime = datetime.fromisoformat(
            first_leg.departure_datetime.replace("Z", "+00:00")
        )
        # Remove timezone info for consistent comparisons
        if departure_datetime.tzinfo is not None:
            departure_datetime = departure_datetime.replace(tzinfo=None)

        day_schedules = []

        for phase in phases:
            # Skip in-transit phases for now (no actionable interventions)
            # But keep ULR sleep suggestions
            if phase.phase_type == "in_transit" and not phase.is_ulr_flight:
                continue

            # Get science-optimal interventions
            interventions = planner.plan_phase(phase)

            # Apply practical constraints (pass departure time for sleep_target filtering)
            interventions = constraint_filter.filter_phase(
                interventions, phase, departure_datetime
            )

            # Filter past interventions for today only
            day_date = phase.start_datetime.date().isoformat()
            interventions = self._filter_past_interventions(
                interventions, day_date, current_datetime
            )

            # Skip empty days
            if not interventions:
                continue

            # Build day schedule with phase metadata
            # Detect if phase spans midnight (ends on a different day)
            spans_midnight = phase.end_datetime.date() > phase.start_datetime.date()

            day_schedules.append(DaySchedule(
                day=phase.day_number,
                date=day_date,
                timezone=phase.timezone or "In transit",
                items=interventions,
                phase_type=phase.phase_type,
                phase_start=format_time(phase.start_datetime.time()),
                phase_end=format_time(phase.end_datetime.time()),
                phase_spans_midnight=spans_midnight if spans_midnight else None,
                is_in_transit=phase.phase_type in ("in_transit", "in_transit_ulr")
            ))

        # 4. Build response
        # Count adaptation phases for estimated days
        adaptation_phases = [p for p in phases if p.phase_type == "adaptation"]
        estimated_days = len(adaptation_phases) + 1  # +1 for post_arrival

        return ScheduleResponse(
            total_shift_hours=abs(total_shift),
            direction=direction,
            estimated_adaptation_days=estimated_days,
            origin_tz=origin_tz,
            dest_tz=dest_tz,
            interventions=day_schedules,
            _science_impact_internal=constraint_filter.get_science_impact_summary()
        )

    def _calculate_total_shift(self, legs: List[TripLeg]) -> tuple:
        """
        Calculate the total timezone shift across all legs.

        Args:
            legs: List of trip legs

        Returns:
            Tuple of (total_shift_hours, direction)
        """
        if not legs:
            return (0.0, "advance")

        # For single leg, calculate directly
        if len(legs) == 1:
            leg = legs[0]
            return calculate_timezone_shift(
                leg.origin_tz,
                leg.dest_tz,
                datetime.fromisoformat(leg.departure_datetime.replace("Z", "+00:00"))
            )

        # For multi-leg, calculate from first origin to last destination
        first_origin = legs[0].origin_tz
        last_dest = legs[-1].dest_tz
        reference_date = datetime.fromisoformat(
            legs[0].departure_datetime.replace("Z", "+00:00")
        )

        return calculate_timezone_shift(first_origin, last_dest, reference_date)

    def _filter_past_interventions(
        self,
        interventions: list,
        day_date: str,
        current_datetime: datetime,
        buffer_minutes: int = 30
    ) -> list:
        """
        Filter out interventions that are past the current time (for today only).

        Args:
            interventions: List of interventions for the day
            day_date: The date of this day schedule (YYYY-MM-DD)
            current_datetime: Current datetime when generating
            buffer_minutes: Include interventions within this buffer

        Returns:
            Filtered list with past interventions removed (for today only)
        """
        from datetime import timedelta
        from .circadian_math import parse_time

        # Only filter if this day is today
        current_date = current_datetime.date().isoformat()
        if day_date != current_date:
            return interventions

        # Calculate cutoff time
        cutoff_time = current_datetime - timedelta(minutes=buffer_minutes)
        cutoff_minutes = cutoff_time.hour * 60 + cutoff_time.minute

        # Always preserve these types
        preserved_types = {"sleep_target", "wake_target"}

        filtered = []
        for intervention in interventions:
            if intervention.type in preserved_types:
                filtered.append(intervention)
                continue

            t = parse_time(intervention.time)
            intervention_minutes = t.hour * 60 + t.minute

            if intervention_minutes >= cutoff_minutes:
                filtered.append(intervention)

        return filtered


def generate_schedule_v2(
    request: ScheduleRequest,
    current_datetime: Optional[datetime] = None
) -> ScheduleResponse:
    """
    Convenience function to generate a schedule using phase-based system.

    Args:
        request: ScheduleRequest with trip data and preferences
        current_datetime: Current time for filtering (defaults to now)

    Returns:
        ScheduleResponse with complete schedule
    """
    generator = ScheduleGeneratorV2()
    return generator.generate_schedule(request, current_datetime)
