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
from datetime import UTC, datetime, time, timedelta
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

# Crew wakes passengers ~1h before landing
CREW_WAKE_BEFORE_LANDING_HOURS = 1


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

        # =================================================================
        # SLEEP TARGET HANDLING FOR PRE-DEPARTURE PHASES
        # =================================================================
        # We maintain THREE sleep values for pre_departure phases:
        #
        # 1. sleep_target: The circadian-optimal sleep time from the science layer
        #    (e.g., 7 PM for eastward shifts)
        #
        # 2. sleep_target_for_planning: Always equals sleep_target. Used by
        #    _plan_light(), _plan_caffeine(), _plan_nap() since they need the
        #    circadian-optimal time even if we don't display it to the user.
        #
        # 3. sleep_target_for_display: What we show the user. Can be:
        #    - sleep_target (no change needed)
        #    - Capped to phase_end (e.g., 5:40 PM for 8:40 PM departure)
        #    - None (omitted - user gets sleep guidance in "After Landing" instead)
        #
        # Capping/omission happens when:
        # - Sleep is within 4h of departure → cap to phase_end (3h before departure)
        # - Sleep is AFTER departure → omit entirely (user is on plane!)
        # - Phase_end is before noon → omit (impractical to sleep that early)
        #
        # When capped/omitted, original_time stores the circadian-optimal time
        # so the UI can show "Your shifted target is X" as context.
        # =================================================================
        sleep_target_for_planning = sleep_target
        sleep_original_time: str | None = None
        sleep_target_for_display: time | None = sleep_target
        wake_original_time: str | None = None
        if phase.phase_type == "pre_departure":
            wake_target = self._cap_wake_target_for_departure(wake_target)
            capped_sleep, original_sleep = self._cap_sleep_target_for_departure(sleep_target)
            if original_sleep:
                sleep_original_time = format_time(original_sleep)
            if capped_sleep is None:
                # Sleep target omitted - too early to be practical
                # User will get sleep guidance in "After Landing" section
                sleep_target_for_display = None
            else:
                sleep_target_for_display = capped_sleep

        # =================================================================
        # WAKE TARGET HANDLING FOR POST-ARRIVAL PHASES
        # =================================================================
        # For arrival day, wake time might be capped to pre-landing time:
        # - Crew wakes passengers ~1h before landing
        # - If circadian wake is AFTER pre-landing time, cap it
        # - If circadian wake is earlier, use it as-is
        #
        # Example: VS20 lands at 10:45 AM
        # - Circadian wake: 11:00 AM (body clock says wake at 11)
        # - But crew wakes you at 9:45 AM
        # - So wake_target = 9:45 AM, original_time = 11:00 AM
        # =================================================================
        if phase.phase_type == "post_arrival":
            capped_wake, original_wake = self._get_arrival_day_wake_target(
                wake_target, phase.start_datetime
            )
            if original_wake:
                wake_original_time = original_wake
            wake_target = capped_wake

        # 1. Sleep/wake targets (always included, unless sleep_target was omitted)
        interventions.extend(
            self._plan_sleep_wake(
                phase,
                wake_target,
                sleep_target_for_display,
                sleep_original_time,
                wake_original_time,
            )
        )

        # 2. Light interventions (always included - primary intervention)
        # Use original sleep_target for planning, not the capped/omitted one
        interventions.extend(
            self._plan_light(phase, cbtmin, wake_target, sleep_target_for_planning)
        )

        # 3. Melatonin (if enabled)
        if self.context.uses_melatonin:
            mel = self._plan_melatonin(phase, dlmo, wake_target)
            if mel:
                interventions.append(mel)

        # 4. Caffeine (if enabled)
        # Use original sleep_target for planning
        if self.context.uses_caffeine:
            interventions.extend(self._plan_caffeine(phase, wake_target, sleep_target_for_planning))

        # 5. Naps (based on preference and phase type)
        # Use original sleep_target for planning
        nap = self._plan_nap(phase, wake_target, sleep_target_for_planning)
        if nap:
            interventions.append(nap)

        return interventions

    def _cap_wake_target_for_departure(self, wake_target: time) -> time:
        """
        Cap wake_target to allow sufficient time before departure.

        For pre_departure phases, the user needs time to get ready and travel
        to the airport. If the circadian-optimal wake time is too late, cap it
        to 3 hours before departure.

        Args:
            wake_target: Circadian-optimal wake time

        Returns:
            Wake time capped to at most 3h before departure
        """
        AIRPORT_BUFFER_HOURS = 3

        first_leg = self.request.legs[0]
        departure = parse_iso_datetime(first_leg.departure_datetime)
        departure_minutes = time_to_minutes(departure.time())

        max_wake_minutes = departure_minutes - (AIRPORT_BUFFER_HOURS * 60)

        # If max_wake_minutes wrapped overnight (departure before 3 AM), don't cap
        if max_wake_minutes < 0:
            return wake_target

        wake_minutes = time_to_minutes(wake_target)

        if wake_minutes > max_wake_minutes:
            return minutes_to_time(max_wake_minutes)

        return wake_target

    def _cap_sleep_target_for_departure(
        self, sleep_target: time
    ) -> tuple[time | None, time | None]:
        """
        Cap sleep_target to phase end if it would be too close to departure.

        Uses 4h buffer (consistent with SLEEP_TARGET_DEPARTURE_BUFFER_HOURS in constraint_filter).
        Pre_departure phase ends 3h before departure (airport buffer).

        Args:
            sleep_target: Circadian-optimal sleep time

        Returns:
            (capped_time, original_time):
            - capped_time: The time to use (or None if should be omitted)
            - original_time: The original circadian-optimal time (set when capping occurred)
        """
        SLEEP_BUFFER_HOURS = 4.0  # Match SLEEP_TARGET_DEPARTURE_BUFFER_HOURS
        PRE_DEPARTURE_BUFFER_HOURS = 3  # Phase ends 3h before departure

        first_leg = self.request.legs[0]
        departure = parse_iso_datetime(first_leg.departure_datetime)
        departure_minutes = time_to_minutes(departure.time())
        sleep_minutes = time_to_minutes(sleep_target)

        # Calculate hours before departure
        # Handle same-day comparison (sleep after midnight handled separately)
        hours_before = (departure_minutes - sleep_minutes) / 60

        # If sleep is well before departure (>4h buffer), no capping needed
        if hours_before >= SLEEP_BUFFER_HOURS:
            return (sleep_target, None)

        # If sleep is AFTER departure (hours_before <= 0), omit entirely
        # User can't act on "sleep at 7 PM" when they're on a plane at 4:30 PM
        # They'll get sleep guidance in "After Landing" section instead
        if hours_before <= 0:
            return (None, sleep_target)

        # Sleep is within 4h of departure (but still before) - cap to phase end
        # Cap to phase end (3h before departure)
        phase_end_minutes = departure_minutes - (PRE_DEPARTURE_BUFFER_HOURS * 60)

        # If phase_end is before noon (impractical to sleep so early), omit entirely
        # The user will get sleep guidance in "After Landing" section instead
        NOON_MINUTES = 12 * 60
        if phase_end_minutes < NOON_MINUTES:
            return (None, sleep_target)

        # Cap to phase end and record original
        return (minutes_to_time(phase_end_minutes), sleep_target)

    def _get_arrival_day_wake_target(
        self, circadian_wake: time, arrival_datetime: datetime
    ) -> tuple[time, str | None]:
        """
        For arrival day: wake is 1h before landing (when crew wakes you).

        WHY THIS EXISTS:
        Landing forces a wake event regardless of circadian state. For VS20
        (SFO→LHR, 10:45 AM landing), the circadian-optimal wake might be 11:00 AM.
        But that's after landing - the user is already awake!

        Crew wakes passengers ~1 hour before landing anyway,
        so we use that as the wake time and note the circadian target.

        If circadian wake is earlier than pre-landing time, use that instead
        (user naturally wakes earlier - no need to adjust).

        Args:
            circadian_wake: Circadian-optimal wake time
            arrival_datetime: Flight arrival/landing datetime

        Returns:
            (wake_time, original_time):
            - wake_time: The time to use
            - original_time: The original circadian time (set when adjustment occurred)
        """
        arrival_minutes = time_to_minutes(arrival_datetime.time())
        circadian_minutes = time_to_minutes(circadian_wake)

        # Pre-landing wake = 1h before arrival
        pre_landing_minutes = arrival_minutes - int(CREW_WAKE_BEFORE_LANDING_HOURS * 60)

        # Handle overnight wrap (e.g., arrival at 00:30 -> pre-landing at 23:30)
        if pre_landing_minutes < 0:
            pre_landing_minutes += 24 * 60

        # Use whichever is earlier: circadian wake or pre-landing wake
        # For same-day comparison, earlier means smaller minutes value
        # But we need to handle the case where circadian wake is in early morning
        # and pre-landing is late night (unlikely but possible)
        if circadian_minutes < pre_landing_minutes:
            # Circadian wake is earlier - use it as-is
            return (circadian_wake, None)
        else:
            # Use pre-landing time, record circadian target
            return (minutes_to_time(pre_landing_minutes), circadian_wake.strftime("%H:%M"))

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

        Routes to appropriate helper based on flight type:
        - ULR flights (12h+): circadian-timed sleep windows via _plan_ulr_sleep_windows
        - Regular flights (6h+): generic nap suggestion via _plan_regular_flight_nap
        - Short flights (<6h): no interventions (phase skipped in scheduler)
        """
        if phase.is_ulr_flight and phase.sleep_windows:
            return self._plan_ulr_sleep_windows(phase)

        # Suggest sleep for flights 6h+ - even non-ULR overnight flights
        # benefit from sleep suggestions
        if phase.flight_duration_hours and phase.flight_duration_hours >= 6:
            return self._plan_regular_flight_nap(phase)

        return []

    def _plan_ulr_sleep_windows(self, phase: TravelPhase) -> list[Intervention]:
        """Plan sleep window interventions for ultra-long-range flights."""
        dest_tz_str = self.request.legs[0].dest_tz if self.request.legs else "UTC"
        dest_tz = ZoneInfo(dest_tz_str)

        interventions = []
        for window in phase.sleep_windows or []:
            start_iso = window.get("start", "")
            display_time = "00:00"
            flight_offset = None

            utc_time = self._parse_utc_timestamp(start_iso)
            if utc_time:
                local_time = utc_time.astimezone(dest_tz)
                display_time = local_time.strftime("%H:%M")
                flight_offset = self._calculate_flight_offset(phase, utc_time)
            elif "T" in start_iso:
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

        return interventions

    def _calculate_flight_offset(self, phase: TravelPhase, utc_time: datetime) -> float:
        """Calculate hours into flight from departure for a given UTC time."""
        departure_utc = phase.start_datetime
        if departure_utc.tzinfo is None:
            origin_tz_name = self.request.legs[0].origin_tz
            departure_utc = departure_utc.replace(tzinfo=ZoneInfo(origin_tz_name))
        departure_utc = departure_utc.astimezone(UTC)

        offset_hours = (utc_time - departure_utc).total_seconds() / 3600
        return max(0, round(offset_hours, 1))

    def _plan_regular_flight_nap(self, phase: TravelPhase) -> list[Intervention]:
        """Plan a single nap suggestion for flights 6+ hours.

        Places nap window roughly 2 hours into flight (after meal service).
        """
        flight_hours = phase.flight_duration_hours or 8

        # Calculate nap time: ~2 hours after departure (after meal service settles)
        nap_offset_hours = min(2.0, flight_hours * 0.25)

        # Calculate display time in destination timezone
        dest_tz = ZoneInfo(self.request.legs[0].dest_tz)
        departure_utc = phase.start_datetime
        if departure_utc.tzinfo is None:
            origin_tz = ZoneInfo(self.request.legs[0].origin_tz)
            departure_utc = departure_utc.replace(tzinfo=origin_tz)
        departure_utc = departure_utc.astimezone(UTC)

        nap_utc = departure_utc + timedelta(hours=nap_offset_hours)
        nap_local = nap_utc.astimezone(dest_tz)
        display_time = nap_local.strftime("%H:%M")

        return [
            Intervention(
                time=display_time,
                type="nap_window",
                title="In-flight sleep",
                description=(
                    "Try to sleep on the plane to arrive more rested. "
                    "Use an eye mask and earplugs to improve sleep quality."
                ),
                duration_min=int(flight_hours * 0.5 * 60),  # ~50% of flight
                flight_offset_hours=round(nap_offset_hours, 1),
            )
        ]

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
                # Cap wake_target for pre_departure phases (need time for airport)
                capped_wake = self._cap_wake_target_for_departure(wake_target)
                # Only include wake_target for departure day
                interventions.append(
                    Intervention(
                        time=format_time(capped_wake),
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

        # Include caffeine guidance even for short phases - users benefit from knowing
        # when coffee is OK and when to cut off
        if self.context.uses_caffeine:
            interventions.extend(self._plan_caffeine(phase, wake_target, sleep_target))

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
        self,
        phase: TravelPhase,
        wake_target: time,
        sleep_target: time | None,
        sleep_original_time: str | None = None,
        wake_original_time: str | None = None,
    ) -> list[Intervention]:
        """Plan sleep and wake target interventions.

        Args:
            phase: The travel phase
            wake_target: Target wake time
            sleep_target: Target sleep time (None if omitted for pre_departure)
            sleep_original_time: Original circadian-optimal sleep time if capped
            wake_original_time: Original circadian-optimal wake time if capped to pre-landing
        """
        # Direction-specific wake advice
        if self.context.direction == "advance":
            wake_advice = "Get bright light soon after waking."
        else:
            wake_advice = "Avoid bright light for the first few hours after waking."

        # Determine wake title and description based on whether time was adjusted
        if wake_original_time:
            # Wake was capped to pre-landing time
            wake_title = "Target wake time (pre-landing)"
            wake_description = (
                "Cabin crew will wake you about an hour before landing. "
                "This is when your adaptation day begins. Get bright light as soon as "
                "possible after landing."
            )
        else:
            wake_title = "Target wake time"
            wake_description = (
                f"Try to wake up at this time to help shift your circadian clock. {wake_advice}"
            )

        interventions = [
            Intervention(
                time=format_time(wake_target),
                type="wake_target",
                title=wake_title,
                description=wake_description,
                duration_min=None,
                original_time=wake_original_time,
            ),
        ]

        # Only include sleep_target if not omitted
        if sleep_target is not None:
            sleep_description = (
                "Aim to be in bed with lights out at this time. "
                "Dim lights 1-2 hours before to prepare for sleep."
            )
            # Add note about shifted time if capped
            if sleep_original_time:
                sleep_description = (
                    f"Earlier sleep before your flight helps. "
                    f"Your shifted target is {sleep_original_time}."
                )
            interventions.append(
                Intervention(
                    time=format_time(sleep_target),
                    type="sleep_target",
                    title="Target sleep time",
                    description=sleep_description,
                    duration_min=None,
                    original_time=sleep_original_time,
                )
            )

        return interventions

    def _plan_light(
        self, phase: TravelPhase, cbtmin: time, wake_target: time, sleep_target: time
    ) -> list[Intervention]:
        """Plan light seek and avoid interventions using PRC."""
        interventions = []

        # Get optimal light seek window using user's preferred duration
        seek_start, seek_end = LightPRC.optimal_light_window(
            cbtmin, self.context.direction, self.request.light_exposure_minutes
        )

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
                    duration_min=self.request.light_exposure_minutes,
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
                    duration_min=self.request.light_exposure_minutes,
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

        # Caffeine cutoff: user-configurable hours before sleep
        cutoff_minutes = sleep_minutes - (self.request.caffeine_cutoff_hours * 60)
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
