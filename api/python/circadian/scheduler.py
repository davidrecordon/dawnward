"""
Schedule generation orchestration.

Combines all intervention modules to generate complete jet lag adaptation schedules.
Uses research-backed Phase Response Curves for light, melatonin, exercise, and caffeine.
"""

from datetime import datetime, time
from typing import List, Optional

from .types import (
    TripLeg,
    ScheduleRequest,
    ScheduleResponse,
    DaySchedule,
    Intervention,
)
from .circadian_math import (
    parse_time,
    format_time,
    estimate_cbtmin_from_wake,
    estimate_dlmo_from_sleep,
    calculate_timezone_shift,
    calculate_actual_prep_days,
    calculate_daily_shift_targets,
    shift_time,
)
from .light_prc import generate_shifted_light_windows
from .melatonin_prc import generate_shifted_melatonin_timing
from .exercise_prc import generate_shifted_exercise_windows
from .caffeine import generate_shifted_caffeine_strategy


class ScheduleGenerator:
    """
    Generates jet lag adaptation schedules using circadian science.

    Combines:
    - Light exposure (Khalsa 2003 PRC)
    - Melatonin timing (Burgess 2010 PRC)
    - Exercise windows (Youngstedt 2019 PRC)
    - Caffeine strategy (Burke 2015)
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
        if current_datetime is None:
            current_datetime = datetime.now()

        # Calculate total timezone shift across all legs
        total_shift, direction = self._calculate_total_shift(request.legs)

        # Get first leg for timing calculations
        first_leg = request.legs[0]

        # Auto-adjust prep days if departure is sooner than requested
        actual_prep_days = calculate_actual_prep_days(
            first_leg.departure_datetime,
            request.prep_days,
            current_datetime
        )

        # Calculate daily shift targets
        shift_targets = calculate_daily_shift_targets(
            total_shift,
            direction,
            actual_prep_days
        )

        # Estimate baseline circadian markers from habitual schedule
        base_cbtmin = estimate_cbtmin_from_wake(request.wake_time)
        base_dlmo = estimate_dlmo_from_sleep(request.sleep_time)
        base_sleep = parse_time(request.sleep_time)
        base_wake = parse_time(request.wake_time)

        # Generate interventions for each day
        day_schedules = []

        for target in shift_targets:
            day_num = target["day"]
            cumulative_shift = target["cumulative_shift"]

            # Calculate the date for this day
            day_date = self._calculate_day_date(
                first_leg.departure_datetime,
                day_num
            )

            # Generate all interventions for this day
            interventions = self._generate_day_interventions(
                base_cbtmin=base_cbtmin,
                base_dlmo=base_dlmo,
                base_sleep=base_sleep,
                base_wake=base_wake,
                cumulative_shift=cumulative_shift,
                direction=direction,
                request=request
            )

            # Sort interventions by time, with secondary ordering for same-time items
            # Use sorted() to avoid issues with in-place sort referencing the list being sorted
            interventions = sorted(interventions, key=lambda x: self._intervention_sort_key(x, interventions))

            # Filter out past interventions for today only
            interventions = self._filter_past_interventions(
                interventions, day_date, current_datetime
            )

            day_schedules.append(DaySchedule(
                day=day_num,
                date=day_date,
                items=interventions
            ))

        # Estimate total adaptation days
        estimated_days = len(shift_targets)

        return ScheduleResponse(
            total_shift_hours=abs(total_shift),
            direction=direction,
            estimated_adaptation_days=estimated_days,
            interventions=day_schedules
        )

    def _calculate_total_shift(self, legs: List[TripLeg]) -> tuple:
        """
        Calculate the total timezone shift across all legs.

        For multi-leg trips, we sum the shifts but may still need
        to consider the easier direction for very large shifts.

        Args:
            legs: List of trip legs

        Returns:
            Tuple of (total_shift_hours, direction)
        """
        if not legs:
            return (0.0, "advance")

        # For single leg, just calculate directly
        if len(legs) == 1:
            leg = legs[0]
            return calculate_timezone_shift(
                leg.origin_tz,
                leg.dest_tz,
                datetime.fromisoformat(leg.departure_datetime.replace("Z", "+00:00"))
            )

        # For multi-leg, calculate shift from first origin to last destination
        first_origin = legs[0].origin_tz
        last_dest = legs[-1].dest_tz

        # Use departure date of first leg for DST calculation
        reference_date = datetime.fromisoformat(
            legs[0].departure_datetime.replace("Z", "+00:00")
        )

        return calculate_timezone_shift(first_origin, last_dest, reference_date)

    def _calculate_day_date(self, departure_datetime: str, day_offset: int) -> str:
        """
        Calculate the calendar date for a given day offset.

        Args:
            departure_datetime: ISO format departure time
            day_offset: Day offset (negative = before departure)

        Returns:
            Date string in "YYYY-MM-DD" format
        """
        departure = datetime.fromisoformat(departure_datetime.replace("Z", "+00:00"))
        target_date = departure.date()

        from datetime import timedelta
        target_date = target_date + timedelta(days=day_offset)

        return target_date.isoformat()

    def _generate_day_interventions(
        self,
        base_cbtmin: time,
        base_dlmo: time,
        base_sleep: time,
        base_wake: time,
        cumulative_shift: float,
        direction: str,
        request: ScheduleRequest
    ) -> List[Intervention]:
        """
        Generate all interventions for a single day.

        Args:
            base_cbtmin: Original CBTmin before shifting
            base_dlmo: Original DLMO before shifting
            base_sleep: Original sleep time
            base_wake: Original wake time
            cumulative_shift: Hours shifted so far
            direction: "advance" or "delay"
            request: Original schedule request with preferences

        Returns:
            List of Intervention objects for this day
        """
        interventions = []

        # Light interventions (always included - primary intervention)
        light_interventions = generate_shifted_light_windows(
            base_wake=base_wake,
            base_sleep=base_sleep,
            base_cbtmin=base_cbtmin,
            cumulative_shift=cumulative_shift,
            direction=direction
        )
        interventions.extend(light_interventions)

        # Melatonin (if enabled)
        if request.uses_melatonin:
            melatonin = generate_shifted_melatonin_timing(
                base_dlmo=base_dlmo,
                cumulative_shift=cumulative_shift,
                direction=direction
            )
            if melatonin:
                interventions.append(melatonin)

        # Exercise (if enabled)
        if request.uses_exercise:
            exercise_interventions = generate_shifted_exercise_windows(
                base_wake=base_wake,
                base_sleep=base_sleep,
                cumulative_shift=cumulative_shift,
                direction=direction
            )
            interventions.extend(exercise_interventions)

        # Caffeine (if enabled)
        if request.uses_caffeine:
            caffeine_interventions = generate_shifted_caffeine_strategy(
                base_sleep=base_sleep,
                base_wake=base_wake,
                cumulative_shift=cumulative_shift,
                direction=direction
            )
            interventions.extend(caffeine_interventions)

        # Sleep/wake targets
        sleep_wake = self._generate_sleep_wake_targets(
            base_sleep=base_sleep,
            base_wake=base_wake,
            cumulative_shift=cumulative_shift,
            direction=direction
        )
        interventions.extend(sleep_wake)

        # Filter out interventions that fall during sleep
        interventions = self._filter_sleep_interventions(interventions)

        return interventions

    def _is_during_sleep(self, time_str: str, sleep_time: str, wake_time: str) -> bool:
        """
        Check if a time falls within the sleep window (sleep_time to wake_time).

        Handles the common case where sleep crosses midnight (e.g., 23:00 to 07:00).

        Args:
            time_str: Time to check in "HH:MM" format
            sleep_time: Sleep target time in "HH:MM" format
            wake_time: Wake target time in "HH:MM" format

        Returns:
            True if time falls within the sleep window
        """
        from .circadian_math import parse_time, time_to_minutes

        t = time_to_minutes(parse_time(time_str))
        sleep = time_to_minutes(parse_time(sleep_time))
        wake = time_to_minutes(parse_time(wake_time))

        if sleep > wake:  # Sleep crosses midnight (e.g., 23:00 to 07:00)
            return t >= sleep or t < wake
        else:  # Sleep doesn't cross midnight (rare, but handle it)
            return sleep <= t < wake

    def _filter_sleep_interventions(
        self,
        interventions: List[Intervention]
    ) -> List[Intervention]:
        """
        Filter out interventions that fall during sleep hours.

        Users can't act on interventions while asleep, so remove:
        - light_seek, light_avoid, caffeine_ok, caffeine_cutoff, exercise

        Always keep:
        - sleep_target, wake_target (these define the window)
        - melatonin (taken just before sleep, so it's actionable)

        Args:
            interventions: List of interventions for the day

        Returns:
            Filtered list with sleep-period interventions removed
        """
        # Find sleep and wake target times
        sleep_time = None
        wake_time = None

        for intervention in interventions:
            if intervention.type == "sleep_target":
                sleep_time = intervention.time
            elif intervention.type == "wake_target":
                wake_time = intervention.time

        # If we don't have both targets, can't filter
        if not sleep_time or not wake_time:
            return interventions

        # Types to filter during sleep (melatonin is kept - it's taken before sleep)
        filterable_types = {
            "light_seek",
            "light_avoid",
            "caffeine_ok",
            "caffeine_cutoff",
            "exercise",
        }

        filtered = []
        for intervention in interventions:
            # Always keep non-filterable types
            if intervention.type not in filterable_types:
                filtered.append(intervention)
                continue

            # Keep if not during sleep
            if not self._is_during_sleep(intervention.time, sleep_time, wake_time):
                filtered.append(intervention)

        return filtered

    def _filter_past_interventions(
        self,
        interventions: List[Intervention],
        day_date: str,
        current_datetime: datetime,
        buffer_minutes: int = 30
    ) -> List[Intervention]:
        """
        Filter out interventions that are past the current time (for today only).

        When generating a schedule "late" (e.g., at 10 AM for a flight tomorrow),
        we don't want to show interventions that already passed (e.g., "wake at 7 AM").

        Args:
            interventions: List of interventions for the day
            day_date: The date of this day schedule (YYYY-MM-DD)
            current_datetime: Current datetime when generating
            buffer_minutes: Include interventions within this buffer (default 30)

        Returns:
            Filtered list with past interventions removed (for today only)
        """
        from datetime import timedelta

        # Only filter if this day is today
        current_date = current_datetime.date().isoformat()
        if day_date != current_date:
            return interventions

        # Calculate cutoff time (current time minus buffer)
        cutoff_time = current_datetime - timedelta(minutes=buffer_minutes)
        cutoff_minutes = cutoff_time.hour * 60 + cutoff_time.minute

        # Always preserve these types (user needs to see targets even if past)
        preserved_types = {"sleep_target", "wake_target"}

        filtered = []
        for intervention in interventions:
            if intervention.type in preserved_types:
                filtered.append(intervention)
                continue

            # Parse intervention time and compare
            t = parse_time(intervention.time)
            intervention_minutes = t.hour * 60 + t.minute

            if intervention_minutes >= cutoff_minutes:
                filtered.append(intervention)

        return filtered

    def _intervention_sort_key(
        self,
        intervention: Intervention,
        all_interventions: List[Intervention]
    ) -> tuple:
        """
        Generate sort key for an intervention.

        Primary sort: by time
        Secondary sort (for same-time items):
        - If wake_target is at this time: wake_target first, then non-optional, then optional
        - If sleep_target is at this time: non-optional first, then optional, then sleep_target last

        Non-optional: light_seek, light_avoid
        Optional: melatonin, caffeine_ok, caffeine_cutoff, exercise
        """
        # Check what targets are at this time
        same_time_types = {i.type for i in all_interventions if i.time == intervention.time}
        has_wake = "wake_target" in same_time_types
        has_sleep = "sleep_target" in same_time_types

        # Define priority groups
        non_optional = {"light_seek", "light_avoid"}
        # Optional items in priority order (caffeine first since it's actionable in morning)
        optional_priority = {
            "caffeine_ok": 0,
            "caffeine_cutoff": 1,
            "exercise": 2,
            "melatonin": 3,
        }

        # Calculate secondary sort order
        if has_wake:
            # wake_target first (0), then non-optional (1), then optional (2+)
            if intervention.type == "wake_target":
                order = (0, 0)
            elif intervention.type in non_optional:
                order = (1, 0)
            elif intervention.type in optional_priority:
                order = (2, optional_priority[intervention.type])
            else:
                order = (3, 0)
        elif has_sleep:
            # non-optional first (0), then optional (1+), then sleep_target last (2)
            if intervention.type in non_optional:
                order = (0, 0)
            elif intervention.type in optional_priority:
                order = (1, optional_priority[intervention.type])
            elif intervention.type == "sleep_target":
                order = (2, 0)
            else:
                order = (3, 0)
        else:
            # Default: non-optional before optional
            if intervention.type in non_optional:
                order = (0, 0)
            elif intervention.type in optional_priority:
                order = (1, optional_priority[intervention.type])
            else:
                order = (2, 0)

        return (intervention.time, order)

    def _generate_sleep_wake_targets(
        self,
        base_sleep: time,
        base_wake: time,
        cumulative_shift: float,
        direction: str
    ) -> List[Intervention]:
        """
        Generate sleep and wake target interventions.

        Args:
            base_sleep: Original sleep time
            base_wake: Original wake time
            cumulative_shift: Hours shifted so far
            direction: "advance" or "delay"

        Returns:
            List of sleep_target and wake_target interventions
        """
        interventions = []

        # Calculate shifted times
        shift_hours = cumulative_shift if direction == "advance" else -cumulative_shift
        target_sleep = shift_time(base_sleep, shift_hours)
        target_wake = shift_time(base_wake, shift_hours)

        interventions.append(Intervention(
            time=format_time(target_wake),
            type="wake_target",
            title="Target wake time",
            description="Try to wake up at this time to help shift your circadian clock. "
                       "Get bright light soon after waking.",
            duration_min=None
        ))

        interventions.append(Intervention(
            time=format_time(target_sleep),
            type="sleep_target",
            title="Target sleep time",
            description="Aim to be in bed with lights out at this time. "
                       "Dim lights 1-2 hours before to prepare for sleep.",
            duration_min=None
        ))

        return interventions


def generate_schedule(
    request: ScheduleRequest,
    current_datetime: Optional[datetime] = None
) -> ScheduleResponse:
    """
    Convenience function to generate a schedule.

    Args:
        request: ScheduleRequest with trip data and preferences
        current_datetime: Current time for filtering (defaults to now)

    Returns:
        ScheduleResponse with complete schedule
    """
    generator = ScheduleGenerator()
    return generator.generate_schedule(request, current_datetime)
