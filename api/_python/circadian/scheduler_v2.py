"""
Phase-based schedule generation (v2).

Generates jet lag adaptation schedules using travel phases instead of calendar days.
This fixes the "activities before landing" and "sleep before departure" bugs.

Architecture:
1. Science layer provides optimal circadian timing (science/)
2. Phase generator creates travel phases from flight legs (scheduling/)
3. Intervention planner queries science for each phase (scheduling/)
4. Constraint filter applies practical limits (scheduling/)
5. Timezone enrichment adds complete timezone context to each intervention
"""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from .circadian_math import (
    calculate_actual_prep_days,
    calculate_timezone_shift,
    format_time,
    get_current_datetime_in_tz,
    parse_iso_datetime,
    parse_time,
)
from .scheduling.constraint_filter import ConstraintFilter
from .scheduling.intervention_planner import InterventionPlanner
from .scheduling.phase_generator import PhaseGenerator
from .types import (
    DaySchedule,
    FlightContext,
    Intervention,
    ScheduleRequest,
    ScheduleResponse,
    TravelPhase,
    TripLeg,
)

# Scheduler thresholds
SHORT_FLIGHT_THRESHOLD_HOURS = 6  # Flights under this have no actionable interventions
PAST_INTERVENTION_BUFFER_MINUTES = 30  # Include interventions within this buffer of now


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
        self, request: ScheduleRequest, current_datetime: datetime | None = None
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
            first_leg.departure_datetime, request.prep_days, current_datetime
        )

        # 2. Generate travel phases
        phase_gen = PhaseGenerator(
            legs=request.legs,
            prep_days=actual_prep_days,
            wake_time=request.wake_time,
            sleep_time=request.sleep_time,
            total_shift=total_shift,
            direction=direction,
            intensity=request.schedule_intensity,
        )
        phases = phase_gen.generate_phases()

        # 3. Plan interventions for each phase
        planner = InterventionPlanner(request, total_shift, direction)
        constraint_filter = ConstraintFilter()

        # Parse departure datetime for sleep_target filtering
        departure_datetime = parse_iso_datetime(first_leg.departure_datetime)
        # Remove timezone info for consistent comparisons
        if departure_datetime.tzinfo is not None:
            departure_datetime = departure_datetime.replace(tzinfo=None)

        # Build flight context for pre-landing detection
        flight_context = self._build_flight_context(first_leg)

        day_schedules = []

        for phase in phases:
            # Skip short in-transit phases - no actionable interventions
            # Keep ULR flights (12h+) and regular flights that have sleep suggestions
            if phase.phase_type == "in_transit" and not phase.is_ulr_flight:
                flight_hours = phase.flight_duration_hours or 0
                if flight_hours < SHORT_FLIGHT_THRESHOLD_HOURS:
                    continue

            # Get science-optimal interventions
            interventions = planner.plan_phase(phase)

            # Apply practical constraints (pass departure time for sleep_target filtering)
            interventions = constraint_filter.filter_phase(interventions, phase, departure_datetime)

            # Enrich with timezone context (origin/dest times, pre-landing detection)
            interventions = self._enrich_with_timezone_context(
                interventions, phase, flight_context, origin_tz, dest_tz
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

            day_schedules.append(
                DaySchedule(
                    day=phase.day_number,
                    date=day_date,
                    items=interventions,
                    phase_type=phase.phase_type,
                    phase_start=format_time(phase.start_datetime.time()),
                    phase_end=format_time(phase.end_datetime.time()),
                    phase_spans_midnight=spans_midnight if spans_midnight else None,
                    is_in_transit=phase.phase_type in ("in_transit", "in_transit_ulr"),
                )
            )

        # 4. Build response
        # Count adaptation phases for estimated days
        adaptation_phases = [p for p in phases if p.phase_type == "adaptation"]
        estimated_days = len(adaptation_phases) + 1  # +1 for post_arrival

        # Compute shift magnitude for UI mode selection
        shift_magnitude = round(abs(total_shift))
        is_minimal_shift = shift_magnitude <= 2

        return ScheduleResponse(
            total_shift_hours=abs(total_shift),
            direction=direction,
            estimated_adaptation_days=estimated_days,
            origin_tz=origin_tz,
            dest_tz=dest_tz,
            interventions=day_schedules,
            shift_magnitude=shift_magnitude,
            is_minimal_shift=is_minimal_shift,
            _science_impact_internal=constraint_filter.get_science_impact_summary(),
        )

    def _build_flight_context(self, leg: TripLeg) -> FlightContext:
        """
        Build FlightContext from a trip leg for pre-landing detection.

        Args:
            leg: Trip leg with departure/arrival times and timezones

        Returns:
            FlightContext with UTC timestamps
        """
        # Parse departure in origin timezone
        departure_local = parse_iso_datetime(leg.departure_datetime)
        origin_tz = ZoneInfo(leg.origin_tz)
        if departure_local.tzinfo is None:
            departure_local = departure_local.replace(tzinfo=origin_tz)
        departure_utc = departure_local.astimezone(UTC)

        # Parse arrival in destination timezone
        arrival_local = parse_iso_datetime(leg.arrival_datetime)
        dest_tz = ZoneInfo(leg.dest_tz)
        if arrival_local.tzinfo is None:
            arrival_local = arrival_local.replace(tzinfo=dest_tz)
        arrival_utc = arrival_local.astimezone(UTC)

        return FlightContext(departure_utc=departure_utc, arrival_utc=arrival_utc)

    def _enrich_with_timezone_context(
        self,
        interventions: list[Intervention],
        phase: TravelPhase,
        flight_context: FlightContext,
        origin_tz_str: str,
        dest_tz_str: str,
    ) -> list[Intervention]:
        """
        Enrich interventions with complete timezone context.

        For each intervention:
        1. Computes origin_time/dest_time from phase-local time
        2. Computes origin_date/dest_date
        3. Sets origin_tz/dest_tz from the trip
        4. Sets phase_type from the phase
        5. Detects pre-landing items (post_arrival items before landing)
        6. Converts nap window times to UTC

        Args:
            interventions: List of interventions from planner
            phase: Current travel phase
            flight_context: Flight departure/arrival in UTC
            origin_tz_str: Trip origin IANA timezone
            dest_tz_str: Trip destination IANA timezone

        Returns:
            Enriched list of interventions
        """
        # Validate IANA timezones (fail fast)
        origin_tz = ZoneInfo(origin_tz_str)
        dest_tz = ZoneInfo(dest_tz_str)

        # Determine phase timezone
        phase_tz: ZoneInfo | None = None
        if phase.timezone:
            phase_tz = ZoneInfo(phase.timezone)

        enriched = []
        for intervention in interventions:
            # Get the local time from the intervention
            local_time_str = intervention.time
            if not local_time_str:
                # In-transit items may not have a time set yet
                # Use flight_offset_hours to compute the time
                if intervention.flight_offset_hours is not None:
                    utc_dt = flight_context.departure_utc + timedelta(
                        hours=intervention.flight_offset_hours
                    )
                else:
                    # Skip interventions without time
                    enriched.append(intervention)
                    continue
            else:
                # Parse local time and combine with phase date
                local_time = parse_time(local_time_str)
                local_dt = datetime.combine(phase.start_datetime.date(), local_time)

                if phase_tz:
                    # Normal phase with timezone
                    local_dt = local_dt.replace(tzinfo=phase_tz)
                    utc_dt = local_dt.astimezone(UTC)
                else:
                    # In-transit: time is relative to destination timezone
                    # The planner already computed time in dest timezone
                    local_dt = local_dt.replace(tzinfo=dest_tz)
                    utc_dt = local_dt.astimezone(UTC)

            # Compute times in both timezones
            origin_dt = utc_dt.astimezone(origin_tz)
            dest_dt = utc_dt.astimezone(dest_tz)

            # Determine if dual timezone display is needed
            is_in_transit = phase.phase_type in ("in_transit", "in_transit_ulr")
            is_pre_landing = (
                phase.phase_type == "post_arrival" and utc_dt < flight_context.arrival_utc
            )
            show_dual = is_in_transit or is_pre_landing

            # Convert nap window times to UTC if present
            window_end_utc = None
            ideal_time_utc = None
            if intervention.window_end:
                window_end_time = parse_time(intervention.window_end)
                window_end_local = datetime.combine(phase.start_datetime.date(), window_end_time)
                if phase_tz:
                    window_end_local = window_end_local.replace(tzinfo=phase_tz)
                else:
                    window_end_local = window_end_local.replace(tzinfo=dest_tz)
                window_end_utc = window_end_local.astimezone(UTC).isoformat()

            if intervention.ideal_time:
                ideal_time_time = parse_time(intervention.ideal_time)
                ideal_time_local = datetime.combine(phase.start_datetime.date(), ideal_time_time)
                if phase_tz:
                    ideal_time_local = ideal_time_local.replace(tzinfo=phase_tz)
                else:
                    ideal_time_local = ideal_time_local.replace(tzinfo=dest_tz)
                ideal_time_utc = ideal_time_local.astimezone(UTC).isoformat()

            # Create enriched intervention
            enriched.append(
                Intervention(
                    type=intervention.type,
                    title=intervention.title,
                    description=intervention.description,
                    duration_min=intervention.duration_min,
                    time=intervention.time,  # Keep for internal use
                    origin_time=origin_dt.strftime("%H:%M"),
                    dest_time=dest_dt.strftime("%H:%M"),
                    origin_date=origin_dt.strftime("%Y-%m-%d"),
                    dest_date=dest_dt.strftime("%Y-%m-%d"),
                    origin_tz=origin_tz_str,
                    dest_tz=dest_tz_str,
                    phase_type=phase.phase_type,
                    show_dual_timezone=show_dual,
                    window_end=intervention.window_end,
                    ideal_time=intervention.ideal_time,
                    window_end_utc=window_end_utc,
                    ideal_time_utc=ideal_time_utc,
                    flight_offset_hours=intervention.flight_offset_hours,
                )
            )

        return enriched

    def _calculate_total_shift(self, legs: list[TripLeg]) -> tuple:
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
                parse_iso_datetime(leg.departure_datetime),
            )

        # For multi-leg, calculate from first origin to last destination
        first_origin = legs[0].origin_tz
        last_dest = legs[-1].dest_tz
        reference_date = parse_iso_datetime(legs[0].departure_datetime)

        return calculate_timezone_shift(first_origin, last_dest, reference_date)

    def _filter_past_interventions(
        self,
        interventions: list,
        day_date: str,
        current_datetime: datetime,
        buffer_minutes: int = PAST_INTERVENTION_BUFFER_MINUTES,
    ) -> list:
        """
        Filter out interventions that are past the current time (for today only).

        Args:
            interventions: List of interventions for the day
            day_date: The date of this day schedule (YYYY-MM-DD)
            current_datetime: Current datetime when generating
            buffer_minutes: Include interventions within this buffer (default from constant)

        Returns:
            Filtered list with past interventions removed (for today only)
        """
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
    request: ScheduleRequest, current_datetime: datetime | None = None
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
