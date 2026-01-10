"""
Intervention planner for phase-based scheduling.

Plans interventions for each phase by:
1. Querying the science layer for optimal timing
2. Constraining to phase bounds (handled by ConstraintFilter)
3. Generating user-friendly intervention objects

Implements per-phase planning including:
- Full day schedules (preparation, adaptation)
- Partial day schedules (pre_departure, post_arrival)
- Very short phases (<8h) with single recommendation
- In-transit sleep suggestions for ULR flights
"""

from dataclasses import dataclass
from datetime import UTC, datetime, time
from typing import Literal
from zoneinfo import ZoneInfo

from ..circadian_math import (
    format_time,
    format_time_12h,
    is_during_sleep,
    minutes_to_time,
    parse_iso_datetime,
    time_to_minutes,
)
from ..science.markers import CircadianMarkerTracker
from ..science.prc import LightPRC, MelatoninPRC
from ..science.shift_calculator import ShiftCalculator
from ..science.sleep_pressure import SleepPressureModel
from ..types import Intervention, ScheduleRequest, TravelPhase


@dataclass
class PlannerContext:
    """Context for intervention planning."""

    markers: CircadianMarkerTracker
    sleep_pressure: SleepPressureModel
    shift_calc: ShiftCalculator
    direction: Literal["advance", "delay"]
    total_shift: float
    uses_melatonin: bool
    uses_caffeine: bool
    uses_exercise: bool
    nap_preference: str


class InterventionPlanner:
    """
    Plan interventions for a phase by querying the science layer.

    Separates "what does science recommend?" from "what's practical?"
    Practical constraints are applied by ConstraintFilter afterward.
    """

    def __init__(
        self, request: ScheduleRequest, total_shift: float, direction: Literal["advance", "delay"]
    ):
        """
        Initialize planner.

        Args:
            request: Schedule request with user preferences
            total_shift: Total timezone shift needed
            direction: "advance" or "delay"
        """
        self.request = request

        # Initialize science layer components
        self.markers = CircadianMarkerTracker(request.wake_time, request.sleep_time)
        self.sleep_pressure = SleepPressureModel(request.wake_time, request.sleep_time)
        self.shift_calc = ShiftCalculator(
            total_shift, direction, request.prep_days, request.schedule_intensity
        )

        self.context = PlannerContext(
            markers=self.markers,
            sleep_pressure=self.sleep_pressure,
            shift_calc=self.shift_calc,
            direction=direction,
            total_shift=abs(total_shift),
            uses_melatonin=request.uses_melatonin,
            uses_caffeine=request.uses_caffeine,
            uses_exercise=request.uses_exercise,
            nap_preference=request.nap_preference,
        )

    def plan_phase(self, phase: TravelPhase) -> list[Intervention]:
        """
        Generate interventions for a single phase.

        Args:
            phase: The travel phase to plan

        Returns:
            List of Intervention objects (before constraint filtering)
        """
        if not phase.available_for_interventions:
            return self._plan_in_transit(phase)

        # Handle very short phases (< 8h available)
        # BUT always include wake/sleep targets for Day 0 (Flight Day) and Day 1 (Arrival)
        if phase.duration_hours < 8:
            return self._plan_single_recommendation(
                phase, include_sleep_wake=(phase.day_number in (0, 1))
            )

        interventions = []

        # Get current circadian markers
        day_markers = self.markers.get_markers_for_day(
            day=phase.day_number,
            cumulative_shift=phase.cumulative_shift,
            total_shift=self.context.total_shift,
            direction=self.context.direction,
        )

        cbtmin = day_markers["cbtmin"]
        dlmo = day_markers["dlmo"]
        wake_target = day_markers["wake_target"]
        sleep_target = day_markers["sleep_target"]

        # 1. Sleep/wake targets (always included)
        interventions.extend(self._plan_sleep_wake(phase, wake_target, sleep_target))

        # 2. Light interventions (always included - primary intervention)
        interventions.extend(self._plan_light(phase, cbtmin, wake_target, sleep_target))

        # 3. Melatonin (if enabled)
        if self.context.uses_melatonin:
            mel = self._plan_melatonin(phase, dlmo, wake_target)
            if mel:
                interventions.append(mel)

        # 4. Caffeine (if enabled)
        if self.context.uses_caffeine:
            interventions.extend(self._plan_caffeine(phase, wake_target, sleep_target))

        # 5. Naps (based on preference and phase type)
        nap = self._plan_nap(phase, wake_target, sleep_target)
        if nap:
            interventions.append(nap)

        return interventions

    def _parse_utc_timestamp(self, iso_str: str) -> datetime | None:
        """Parse an ISO timestamp string to a timezone-aware UTC datetime."""
        if "T" not in iso_str:
            return None

        utc_time = parse_iso_datetime(iso_str)
        if utc_time.tzinfo is None:
            utc_time = utc_time.replace(tzinfo=UTC)
        return utc_time

    def _plan_in_transit(self, phase: TravelPhase) -> list[Intervention]:
        """
        Plan interventions for in-transit phases.

        For regular flights: nap suggestion
        For ULR flights: two sleep window suggestions with times in destination timezone

        Sleep window times are converted from UTC to destination timezone for display,
        with flight_offset_hours indicating how many hours into the flight.
        """
        interventions = []

        if phase.is_ulr_flight and phase.sleep_windows:
            dest_tz_str = self.request.legs[0].dest_tz if self.request.legs else "UTC"
            dest_tz = ZoneInfo(dest_tz_str)

            for window in phase.sleep_windows:
                start_iso = window.get("start", "")
                display_time = "00:00"
                flight_offset = None

                utc_time = self._parse_utc_timestamp(start_iso)
                if utc_time:
                    # Convert to destination timezone for display
                    local_time = utc_time.astimezone(dest_tz)
                    display_time = local_time.strftime("%H:%M")

                    # Calculate hours into flight from departure
                    departure_utc = phase.start_datetime
                    if departure_utc.tzinfo is None:
                        origin_tz_name = self.request.legs[0].origin_tz
                        departure_utc = departure_utc.replace(tzinfo=ZoneInfo(origin_tz_name))
                    departure_utc = departure_utc.astimezone(UTC)

                    flight_offset = (utc_time - departure_utc).total_seconds() / 3600
                    flight_offset = max(0, round(flight_offset, 1))
                elif "T" in start_iso:
                    # Fallback: extract HH:MM from ISO string
                    display_time = start_iso.split("T")[1][:5]

                duration_hours = window.get("duration_hours", 4)
                interventions.append(
                    Intervention(
                        time=display_time,
                        type="nap_window",
                        title=window.get("label", "Sleep opportunity"),
                        description=(
                            f"Your body clock makes sleep easier during this window. "
                            f"Aim for ~{duration_hours:.0f} hours if possible."
                        ),
                        duration_min=int(duration_hours * 60),
                        flight_offset_hours=flight_offset,
                    )
                )
        elif phase.flight_duration_hours and phase.flight_duration_hours >= 8:
            # Regular overnight flight: single nap suggestion
            interventions.append(
                Intervention(
                    time="00:00",  # Placeholder - will be filtered/adjusted
                    type="nap_window",
                    title="In-flight sleep",
                    description=(
                        "Try to sleep on the plane to arrive more rested. "
                        "Use an eye mask and earplugs to improve sleep quality."
                    ),
                    duration_min=int(phase.flight_duration_hours * 0.5 * 60),  # ~50% of flight
                    flight_offset_hours=None,
                )
            )

        return interventions

    def _plan_single_recommendation(
        self, phase: TravelPhase, include_sleep_wake: bool = False
    ) -> list[Intervention]:
        """
        Plan a single high-impact intervention for very short phases (<8h).

        Per flight-timing-edge-cases.md: "One good intervention beats rushed multiples."

        Args:
            phase: The travel phase to plan
            include_sleep_wake: If True, also include wake_target and sleep_target
                                (used for Day 0 and Day 1 where users need clear targets)
        """
        interventions = []

        # Get current circadian markers
        day_markers = self.markers.get_markers_for_day(
            day=phase.day_number,
            cumulative_shift=phase.cumulative_shift,
            total_shift=self.context.total_shift,
            direction=self.context.direction,
        )

        cbtmin = day_markers["cbtmin"]
        dlmo = day_markers["dlmo"]
        wake_target = day_markers["wake_target"]
        sleep_target = day_markers["sleep_target"]

        # Include wake/sleep targets for key days (Day 0 Flight Day, Day 1 Arrival)
        # Exception: pre_departure doesn't get sleep_target (user already slept,
        # and phase ends before departure, not at sleep time)
        if include_sleep_wake:
            if phase.phase_type == "pre_departure":
                # Only include wake_target for departure day
                interventions.append(
                    Intervention(
                        time=format_time(wake_target),
                        type="wake_target",
                        title="Target wake time",
                        description=(
                            f"Try to wake up at this time. "
                            f"{'Get bright light soon after waking.' if self.context.direction == 'advance' else 'Avoid bright light for the first few hours after waking.'}"
                        ),
                        duration_min=None,
                    )
                )
            else:
                interventions.extend(self._plan_sleep_wake(phase, wake_target, sleep_target))

        if self.context.direction == "advance":
            # Most impactful for advance: morning light after CBTmin
            light_start, _ = LightPRC.optimal_light_window(cbtmin, "advance", 30)

            interventions.append(
                Intervention(
                    time=format_time(light_start),
                    type="light_seek",
                    title="Get bright light",
                    description=(
                        "Your departure day is short—focus on this one thing. "
                        "Bright morning light helps shift your clock forward."
                    ),
                    duration_min=30,
                )
            )
        else:
            # Most impactful for delay: evening light or melatonin
            if self.context.uses_melatonin:
                optimal_time = MelatoninPRC.optimal_melatonin_time(dlmo, "delay")
                # Clamp to wake time (can't take melatonin while asleep)
                optimal_minutes = time_to_minutes(optimal_time)
                wake_minutes = time_to_minutes(wake_target)
                if optimal_minutes < wake_minutes:
                    optimal_time = wake_target

                interventions.append(
                    Intervention(
                        time=format_time(optimal_time),
                        type="melatonin",
                        title="Take melatonin",
                        description=(
                            "Your departure day is short—focus on this one thing. "
                            "Morning melatonin helps shift your clock back."
                        ),
                        duration_min=None,
                    )
                )
            else:
                # Fall back to evening light
                light_start, _ = LightPRC.optimal_light_window(cbtmin, "delay", 30)
                interventions.append(
                    Intervention(
                        time=format_time(light_start),
                        type="light_seek",
                        title="Get bright light",
                        description=(
                            "Your departure day is short—focus on this one thing. "
                            "Evening light helps shift your clock back."
                        ),
                        duration_min=30,
                    )
                )

        return interventions

    def _plan_sleep_wake(
        self, phase: TravelPhase, wake_target: time, sleep_target: time
    ) -> list[Intervention]:
        """Plan sleep and wake target interventions."""
        # Direction-specific wake advice
        if self.context.direction == "advance":
            wake_advice = "Get bright light soon after waking."
        else:
            wake_advice = "Avoid bright light for the first few hours after waking."

        return [
            Intervention(
                time=format_time(wake_target),
                type="wake_target",
                title="Target wake time",
                description=(
                    f"Try to wake up at this time to help shift your circadian clock. {wake_advice}"
                ),
                duration_min=None,
            ),
            Intervention(
                time=format_time(sleep_target),
                type="sleep_target",
                title="Target sleep time",
                description=(
                    "Aim to be in bed with lights out at this time. "
                    "Dim lights 1-2 hours before to prepare for sleep."
                ),
                duration_min=None,
            ),
        ]

    def _plan_light(
        self, phase: TravelPhase, cbtmin: time, wake_target: time, sleep_target: time
    ) -> list[Intervention]:
        """Plan light seek and avoid interventions using PRC."""
        interventions = []

        # Get optimal light seek window
        seek_start, seek_end = LightPRC.optimal_light_window(cbtmin, self.context.direction, 60)

        # Get light avoid window
        avoid_start, avoid_end = LightPRC.light_avoid_window(cbtmin, self.context.direction)

        if self.context.direction == "advance":
            # ADVANCE: Morning light
            # Clamp to after wake time if during sleep
            seek_minutes = time_to_minutes(seek_start)
            wake_minutes = time_to_minutes(wake_target)
            sleep_minutes = time_to_minutes(sleep_target)

            # If optimal time is during sleep, use wake time
            if is_during_sleep(seek_minutes, sleep_minutes, wake_minutes):
                seek_start = wake_target

            interventions.append(
                Intervention(
                    time=format_time(seek_start),
                    type="light_seek",
                    title="Seek bright light",
                    description=(
                        "Get bright outdoor light or use a 10,000 lux lightbox. "
                        "This helps advance your circadian clock for eastward travel."
                    ),
                    duration_min=60,
                )
            )

            # Light avoid (truncate to waking hours)
            avoid_result = self._truncate_to_waking(
                avoid_start, avoid_end, sleep_target, wake_target
            )
            if avoid_result:
                adj_start, adj_end, adj_duration = avoid_result
                interventions.append(
                    Intervention(
                        time=format_time(adj_start),
                        type="light_avoid",
                        title="Avoid bright light",
                        description=(
                            f"Wear sunglasses or stay indoors until {format_time_12h(adj_end)}. "
                            "Light now would shift your clock the wrong direction."
                        ),
                        duration_min=adj_duration,
                    )
                )

        else:  # delay
            # DELAY: Evening light
            # Use 3h before sleep for practicality
            sleep_minutes = time_to_minutes(sleep_target)
            seek_minutes = sleep_minutes - 180  # 3h before sleep
            seek_start = minutes_to_time(seek_minutes)

            interventions.append(
                Intervention(
                    time=format_time(seek_start),
                    type="light_seek",
                    title="Seek bright light",
                    description=(
                        "Get bright outdoor light or use a 10,000 lux lightbox. "
                        "Evening light helps delay your circadian clock for westward travel."
                    ),
                    duration_min=60,
                )
            )

            # Light avoid in morning
            avoid_result = self._truncate_to_waking(
                avoid_start, avoid_end, sleep_target, wake_target
            )
            if avoid_result:
                adj_start, adj_end, adj_duration = avoid_result
                interventions.append(
                    Intervention(
                        time=format_time(adj_start),
                        type="light_avoid",
                        title="Avoid bright light",
                        description=(
                            f"Wear sunglasses or stay indoors until {format_time_12h(adj_end)}. "
                            "Morning light would shift your clock the wrong direction."
                        ),
                        duration_min=adj_duration,
                    )
                )

        return interventions

    def _plan_melatonin(
        self, phase: TravelPhase, dlmo: time, wake_target: time
    ) -> Intervention | None:
        """Plan melatonin intervention using PRC.

        Args:
            phase: The travel phase to plan
            dlmo: Dim light melatonin onset time
            wake_target: Target wake time (melatonin won't be scheduled before this)
        """
        optimal_time = MelatoninPRC.optimal_melatonin_time(dlmo, self.context.direction)

        if self.context.direction == "advance":
            return Intervention(
                time=format_time(optimal_time),
                type="melatonin",
                title="Take melatonin",
                description=(
                    "Take 0.5mg fast-release melatonin now. "
                    "This timing shifts your body clock earlier — "
                    "it's not meant to make you sleepy right now."
                ),
                duration_min=None,
            )
        else:
            # Delay: melatonin less commonly recommended
            if MelatoninPRC.is_delay_melatonin_recommended(self.context.total_shift):
                # For delay, morning melatonin must be after wake time
                optimal_minutes = time_to_minutes(optimal_time)
                wake_minutes = time_to_minutes(wake_target)

                # If melatonin is before wake time, shift to wake time
                # (comparing within same day, accounting for early morning hours)
                if optimal_minutes < wake_minutes:
                    # Melatonin scheduled before wake - adjust to wake time
                    optimal_time = wake_target

                return Intervention(
                    time=format_time(optimal_time),
                    type="melatonin",
                    title="Take melatonin",
                    description=(
                        "Take 0.5mg fast-release melatonin. "
                        "Morning melatonin can help delay your clock, but may cause drowsiness."
                    ),
                    duration_min=None,
                )
            return None

    def _plan_caffeine(
        self, phase: TravelPhase, wake_target: time, sleep_target: time
    ) -> list[Intervention]:
        """Plan caffeine strategy interventions."""
        interventions = []

        wake_minutes = time_to_minutes(wake_target)
        sleep_minutes = time_to_minutes(sleep_target)

        # Caffeine OK: from wake time
        interventions.append(
            Intervention(
                time=format_time(wake_target),
                type="caffeine_ok",
                title="Caffeine OK",
                description=(
                    "Coffee and other caffeinated drinks are fine. "
                    "Caffeine can help with alertness during adjustment."
                ),
                duration_min=None,
            )
        )

        # Caffeine cutoff: ~10h before sleep (caffeine half-life ~5-6h)
        cutoff_minutes = sleep_minutes - 600  # 10 hours before sleep
        if cutoff_minutes < 0:
            cutoff_minutes += 24 * 60

        # Only show cutoff if it's during waking hours
        if not is_during_sleep(cutoff_minutes, sleep_minutes, wake_minutes):
            interventions.append(
                Intervention(
                    time=format_time(minutes_to_time(cutoff_minutes)),
                    type="caffeine_cutoff",
                    title="Caffeine cutoff",
                    description=(
                        "Avoid caffeine from now on to protect tonight's sleep. "
                        "Caffeine's half-life is ~6 hours, so late consumption disrupts sleep."
                    ),
                    duration_min=None,
                )
            )

        return interventions

    def _plan_nap(
        self, phase: TravelPhase, wake_target: time, sleep_target: time
    ) -> Intervention | None:
        """Plan nap intervention based on phase type and preferences."""
        if self.context.nap_preference == "no":
            return None

        # Special handling for post-arrival (arrival day fatigue)
        if phase.phase_type == "post_arrival":
            # Estimate sleep debt from red-eye
            arrival_time = phase.start_datetime.time()
            nap_rec = self.sleep_pressure.calculate_arrival_recovery_nap(
                arrival_time=arrival_time,
                target_sleep_time=sleep_target,
                sleep_debt_hours=4.0,  # Assume typical red-eye debt
            )

            if nap_rec:
                return Intervention(
                    time=format_time(nap_rec.window_start),
                    type="nap_window",
                    title="Recovery nap",
                    description=(
                        f"You'll be tired from the flight. Nap anytime before "
                        f"{format_time_12h(nap_rec.window_end)} to recover while protecting tonight's sleep."
                    ),
                    duration_min=nap_rec.max_duration_min,
                    window_end=format_time(nap_rec.window_end),
                    ideal_time=format_time(nap_rec.ideal_time),
                )
            return None

        # Standard nap for all_days preference
        if self.context.nap_preference == "all_days":
            nap_rec = self.sleep_pressure.calculate_nap_window(wake_target, sleep_target)

            return Intervention(
                time=format_time(nap_rec.window_start),
                type="nap_window",
                title="Optional nap",
                description=(
                    f"Nap anytime before {format_time_12h(nap_rec.window_end)} if you're tired. "
                    f"Keep it under {nap_rec.max_duration_min} minutes to protect tonight's sleep."
                ),
                duration_min=nap_rec.max_duration_min,
                window_end=format_time(nap_rec.window_end),
                ideal_time=format_time(nap_rec.ideal_time),
            )

        return None

    def _truncate_to_waking(
        self, start: time, end: time, sleep_target: time, wake_target: time
    ) -> tuple | None:
        """
        Truncate a time window to waking hours only.

        Returns (adjusted_start, adjusted_end, duration_minutes) or None if fully during sleep.
        """
        start_minutes = time_to_minutes(start)
        end_minutes = time_to_minutes(end)
        sleep_minutes = time_to_minutes(sleep_target)
        wake_minutes = time_to_minutes(wake_target)

        start_during_sleep = is_during_sleep(start_minutes, sleep_minutes, wake_minutes)
        end_during_sleep = is_during_sleep(end_minutes, sleep_minutes, wake_minutes)

        if start_during_sleep and end_during_sleep:
            return None

        adjusted_start = start_minutes
        adjusted_end = end_minutes

        if start_during_sleep:
            adjusted_start = wake_minutes

        if end_during_sleep:
            adjusted_end = sleep_minutes

        duration = adjusted_end - adjusted_start
        if duration <= 0:
            duration += 24 * 60

        if duration < 30:
            return None

        return (minutes_to_time(adjusted_start), minutes_to_time(adjusted_end), duration)
