"""
Phase generator for travel-aware scheduling.

Converts flight legs into distinct travel phases:
- PREPARATION: Full days before departure
- PRE_DEPARTURE: Departure day, before flight
- IN_TRANSIT / IN_TRANSIT_ULR: On the plane
- POST_ARRIVAL: Arrival day, after landing
- ADAPTATION: Full days at destination

Scientific basis for multi-leg strategy:
- Layover < 48h: Aim through to final destination
- Layover 48-96h: Partial adaptation
- Layover > 96h: Restart (treat as separate trips)
- Opposite directions: Always restart
"""

from datetime import datetime, timedelta
from typing import List, Literal, Optional

from ..types import TripLeg, TravelPhase
from ..circadian_math import (
    parse_time,
    time_to_minutes,
    minutes_to_time,
    calculate_timezone_shift,
)
from ..science.shift_calculator import ShiftCalculator


# Constants
PRE_DEPARTURE_BUFFER_HOURS = 3.0  # End interventions 3h before flight
ULR_FLIGHT_THRESHOLD_HOURS = 12.0  # Ultra-long-range threshold


class PhaseGenerator:
    """
    Generate travel phases from flight legs.

    Phases replace the day-based model to properly handle:
    - Flight times (no activities during flight or before landing)
    - Partial days (pre-departure ends at airport time, post-arrival starts at landing)
    - Multi-leg trips with layover strategy
    """

    def __init__(
        self,
        legs: List[TripLeg],
        prep_days: int,
        wake_time: str,
        sleep_time: str,
        total_shift: float,
        direction: Literal["advance", "delay"]
    ):
        """
        Initialize phase generator.

        Args:
            legs: List of flight legs
            prep_days: Number of preparation days
            wake_time: Habitual wake time (HH:MM)
            sleep_time: Habitual sleep time (HH:MM)
            total_shift: Total timezone shift needed (absolute value)
            direction: "advance" or "delay"
        """
        self.legs = legs
        self.prep_days = prep_days
        self.wake_time = parse_time(wake_time)
        self.sleep_time = parse_time(sleep_time)
        self.total_shift = abs(total_shift)
        self.direction = direction

        # Initialize shift calculator
        self.shift_calc = ShiftCalculator(total_shift, direction, prep_days)

    def generate_phases(self) -> List[TravelPhase]:
        """
        Generate all phases for the trip.

        Returns:
            List of TravelPhase objects in chronological order
        """
        if len(self.legs) == 1:
            return self._generate_single_leg_phases()
        else:
            return self._generate_multi_leg_phases()

    def _generate_single_leg_phases(self) -> List[TravelPhase]:
        """Generate phases for a single-leg trip."""
        phases = []

        # 1. Preparation phases (full days before departure)
        phases.extend(self._generate_preparation_phases())

        # 2. Pre-departure phase (departure day, before flight)
        phases.append(self._generate_pre_departure_phase())

        # 3. In-transit phase(s) - depends on flight duration
        phases.extend(self._generate_in_transit_phases())

        # 4. Post-arrival phase (arrival day, after landing)
        phases.append(self._generate_post_arrival_phase())

        # 5. Adaptation phases (full days at destination)
        phases.extend(self._generate_adaptation_phases())

        return phases

    def _generate_multi_leg_phases(self) -> List[TravelPhase]:
        """
        Generate phases for multi-leg trips.

        Strategy per flight-timing-edge-cases.md:
        - Layover < 48h: Aim through to final destination
        - Layover 48-96h: Partial adaptation to layover timezone
        - Layover > 96h: Restart (treat as two separate trips)
        - Opposite directions: Always restart
        """
        strategy = self._calculate_multi_leg_strategy()

        if strategy == "aim_through":
            # Treat as single trip to final destination
            return self._generate_aim_through_phases()
        elif strategy == "partial_adaptation":
            # Some local alignment at layover, maintain trajectory
            return self._generate_partial_adaptation_phases()
        else:  # "restart"
            # Treat as two independent trips
            return self._generate_restart_phases()

    def _calculate_multi_leg_strategy(self) -> Literal["aim_through", "partial_adaptation", "restart"]:
        """
        Determine multi-leg strategy based on layover duration and directions.

        Returns:
            Strategy string
        """
        # Check if directions match (both eastward or both westward)
        if not self._check_leg_directions_match():
            return "restart"  # Opposite directions = must restart

        # Calculate layover duration
        layover_hours = self._calculate_layover_duration()

        if layover_hours < 48:
            return "aim_through"
        elif layover_hours <= 96:
            return "partial_adaptation"
        else:
            return "restart"

    def _check_leg_directions_match(self) -> bool:
        """Check if all legs go the same direction (all east or all west)."""
        directions = []
        for leg in self.legs:
            departure_dt = datetime.fromisoformat(leg.departure_datetime.replace("Z", "+00:00"))
            _, direction = calculate_timezone_shift(
                leg.origin_tz, leg.dest_tz, departure_dt
            )
            directions.append(direction)
        return len(set(directions)) == 1

    def _calculate_layover_duration(self) -> float:
        """Calculate hours between arrival of leg N and departure of leg N+1."""
        if len(self.legs) < 2:
            return 0

        leg1_arrival = datetime.fromisoformat(self.legs[0].arrival_datetime.replace("Z", "+00:00"))
        leg2_departure = datetime.fromisoformat(self.legs[1].departure_datetime.replace("Z", "+00:00"))
        return (leg2_departure - leg1_arrival).total_seconds() / 3600

    def _generate_preparation_phases(self) -> List[TravelPhase]:
        """Generate preparation phases (full days before departure)."""
        phases = []
        leg = self.legs[0]
        departure = datetime.fromisoformat(leg.departure_datetime.replace("Z", "+00:00"))

        # Get shift targets for each prep day
        shift_targets = self.shift_calc.generate_shift_targets()

        wake_minutes = time_to_minutes(self.wake_time)
        sleep_minutes = time_to_minutes(self.sleep_time)

        for day_offset in range(-self.prep_days, 0):
            day_date = departure.date() + timedelta(days=day_offset)

            # Find cumulative shift for this day
            cumulative = 0.0
            for target in shift_targets:
                if target.day == day_offset:
                    cumulative = target.cumulative_shift
                    break

            # Full day: wake to sleep
            phase_start = datetime.combine(day_date, self.wake_time)
            phase_end = datetime.combine(day_date, self.sleep_time)

            # Handle sleep time crossing midnight
            if sleep_minutes < wake_minutes:
                phase_end += timedelta(days=1)

            phases.append(TravelPhase(
                phase_type="preparation",
                start_datetime=phase_start,
                end_datetime=phase_end,
                timezone=leg.origin_tz,
                cumulative_shift=cumulative,
                remaining_shift=self.total_shift - cumulative,
                day_number=day_offset,
                available_for_interventions=True
            ))

        return phases

    def _generate_pre_departure_phase(self) -> TravelPhase:
        """
        Generate the pre-departure phase.

        Starts at wake time, ends 3 hours before departure (airport buffer).
        """
        leg = self.legs[0]
        departure = datetime.fromisoformat(leg.departure_datetime.replace("Z", "+00:00"))

        # Phase ends 3 hours before departure
        phase_end = departure - timedelta(hours=PRE_DEPARTURE_BUFFER_HOURS)

        # Phase starts at wake time on departure day
        phase_start = datetime.combine(departure.date(), self.wake_time)

        # If wake time is after flight departure (rare edge case), adjust
        if phase_start > phase_end:
            # Very early flight - minimal pre-departure phase
            phase_start = phase_end - timedelta(hours=1)

        # Calculate cumulative shift at departure
        cumulative = self._get_cumulative_shift_at_day(0)

        return TravelPhase(
            phase_type="pre_departure",
            start_datetime=phase_start,
            end_datetime=phase_end,
            timezone=leg.origin_tz,
            cumulative_shift=cumulative,
            remaining_shift=self.total_shift - cumulative,
            day_number=0,
            available_for_interventions=True
        )

    def _generate_in_transit_phases(self) -> List[TravelPhase]:
        """
        Generate in-transit phase(s) based on flight duration.

        Per flight-timing-edge-cases.md:
        - < 12h: Single IN_TRANSIT phase
        - 12+h: IN_TRANSIT_ULR with two sleep windows
        """
        leg = self.legs[0]
        departure = datetime.fromisoformat(leg.departure_datetime.replace("Z", "+00:00"))
        arrival = datetime.fromisoformat(leg.arrival_datetime.replace("Z", "+00:00"))
        flight_hours = (arrival - departure).total_seconds() / 3600

        cumulative = self._get_cumulative_shift_at_day(0)

        if flight_hours >= ULR_FLIGHT_THRESHOLD_HOURS:
            # Ultra-long-range: model two sleep windows
            return self._generate_ulr_transit_phase(departure, arrival, cumulative, flight_hours)
        else:
            # Standard flight: single phase
            return [TravelPhase(
                phase_type="in_transit",
                start_datetime=departure,
                end_datetime=arrival,
                timezone=None,
                cumulative_shift=cumulative,
                remaining_shift=self.total_shift - cumulative,
                day_number=0,
                available_for_interventions=False,
                flight_duration_hours=flight_hours,
                sleep_windows=[{"recommended": flight_hours >= 8}]
            )]

    def _generate_ulr_transit_phase(
        self,
        departure: datetime,
        arrival: datetime,
        cumulative_shift: float,
        flight_hours: float
    ) -> List[TravelPhase]:
        """
        Generate in-transit phase for ultra-long-range flights (12+ hours).

        Models two sleep windows timed to user's circadian position:
        1. Early sleep: ~2h after departure
        2. Late sleep: ~4h before arrival
        """
        # Calculate sleep windows
        # Window 1: Early in flight (after initial meal service)
        window1_start = departure + timedelta(hours=2)
        window1_duration = min(4.0, flight_hours / 3)

        # Window 2: Later in flight (before descent)
        window2_end = arrival - timedelta(hours=2)
        window2_duration = min(4.0, flight_hours / 3)
        window2_start = window2_end - timedelta(hours=window2_duration)

        sleep_windows = [
            {
                "start": window1_start.isoformat(),
                "duration_hours": window1_duration,
                "label": "Sleep opportunity"
            },
            {
                "start": window2_start.isoformat(),
                "duration_hours": window2_duration,
                "label": "Sleep opportunity"
            }
        ]

        return [TravelPhase(
            phase_type="in_transit_ulr",
            start_datetime=departure,
            end_datetime=arrival,
            timezone=None,
            cumulative_shift=cumulative_shift,
            remaining_shift=self.total_shift - cumulative_shift,
            day_number=0,
            available_for_interventions=False,
            flight_duration_hours=flight_hours,
            sleep_windows=sleep_windows
        )]

    def _generate_post_arrival_phase(self) -> TravelPhase:
        """
        Generate the post-arrival phase.

        Starts at arrival, ends at target bedtime.
        This is the critical "arrival-day fatigue" period.
        """
        leg = self.legs[-1]
        arrival = datetime.fromisoformat(leg.arrival_datetime.replace("Z", "+00:00"))

        # Calculate cumulative shift at arrival (day 1)
        cumulative = self._get_cumulative_shift_at_day(1)
        remaining = self.total_shift - cumulative

        # Calculate target sleep time for arrival day
        # The body is still offset from destination by remaining shift
        sleep_minutes = time_to_minutes(self.sleep_time)

        if self.direction == "advance":
            # Body wants to sleep later than ideal
            adjusted_sleep = sleep_minutes + int(remaining * 60)
        else:
            # Body wants to sleep earlier than ideal
            adjusted_sleep = sleep_minutes - int(remaining * 60)

        target_sleep = minutes_to_time(adjusted_sleep)
        phase_end = datetime.combine(arrival.date(), target_sleep)

        # Handle sleep time crossing midnight
        if phase_end <= arrival:
            phase_end += timedelta(days=1)

        return TravelPhase(
            phase_type="post_arrival",
            start_datetime=arrival,
            end_datetime=phase_end,
            timezone=leg.dest_tz,
            cumulative_shift=cumulative,
            remaining_shift=remaining,
            day_number=1,
            available_for_interventions=True
        )

    def _generate_adaptation_phases(self) -> List[TravelPhase]:
        """Generate adaptation phases (full days at destination)."""
        phases = []
        leg = self.legs[-1]
        arrival = datetime.fromisoformat(leg.arrival_datetime.replace("Z", "+00:00"))

        # Get shift targets
        shift_targets = self.shift_calc.generate_shift_targets()

        wake_minutes = time_to_minutes(self.wake_time)
        sleep_minutes = time_to_minutes(self.sleep_time)

        # Start from day 2 (day 1 is post_arrival)
        day_num = 2
        current_date = arrival.date() + timedelta(days=1)

        # Continue until fully adapted
        for target in shift_targets:
            if target.day < 2:
                continue

            cumulative = target.cumulative_shift
            remaining = self.total_shift - cumulative

            # Calculate adjusted wake/sleep times based on remaining shift
            if self.direction == "advance":
                adjusted_wake = wake_minutes + int(remaining * 60)
                adjusted_sleep = sleep_minutes + int(remaining * 60)
            else:
                adjusted_wake = wake_minutes - int(remaining * 60)
                adjusted_sleep = sleep_minutes - int(remaining * 60)

            phase_start = datetime.combine(current_date, minutes_to_time(adjusted_wake))
            phase_end = datetime.combine(current_date, minutes_to_time(adjusted_sleep))

            # Handle sleep time crossing midnight
            # This can happen when:
            # 1. adjusted_sleep >= 24*60 (time wrapped past midnight, e.g., 1440 = 00:00)
            # 2. adjusted_sleep < adjusted_wake (sleep is before wake in same day)
            if adjusted_sleep >= 24 * 60 or adjusted_sleep < adjusted_wake:
                phase_end += timedelta(days=1)

            phases.append(TravelPhase(
                phase_type="adaptation",
                start_datetime=phase_start,
                end_datetime=phase_end,
                timezone=leg.dest_tz,
                cumulative_shift=cumulative,
                remaining_shift=remaining,
                day_number=target.day,
                available_for_interventions=True
            ))

            current_date += timedelta(days=1)
            day_num += 1

        return phases

    def _generate_aim_through_phases(self) -> List[TravelPhase]:
        """Generate phases for aim-through multi-leg strategy."""
        # For aim-through, treat as single trip to final destination
        # but with multiple in-transit phases
        phases = []

        # Preparation phases (before first leg)
        phases.extend(self._generate_preparation_phases())

        # Pre-departure phase
        phases.append(self._generate_pre_departure_phase())

        # Multiple in-transit phases (one per leg)
        cumulative = self._get_cumulative_shift_at_day(0)

        for i, leg in enumerate(self.legs):
            departure = datetime.fromisoformat(leg.departure_datetime.replace("Z", "+00:00"))
            arrival = datetime.fromisoformat(leg.arrival_datetime.replace("Z", "+00:00"))
            flight_hours = (arrival - departure).total_seconds() / 3600

            phase_type = "in_transit_ulr" if flight_hours >= ULR_FLIGHT_THRESHOLD_HOURS else "in_transit"

            phases.append(TravelPhase(
                phase_type=phase_type,
                start_datetime=departure,
                end_datetime=arrival,
                timezone=None,
                cumulative_shift=cumulative,
                remaining_shift=self.total_shift - cumulative,
                day_number=0 if i == 0 else 1,
                available_for_interventions=False,
                flight_duration_hours=flight_hours
            ))

        # Post-arrival phase (after last leg)
        phases.append(self._generate_post_arrival_phase())

        # Adaptation phases
        phases.extend(self._generate_adaptation_phases())

        return phases

    def _generate_partial_adaptation_phases(self) -> List[TravelPhase]:
        """Generate phases for partial adaptation strategy (48-96h layover)."""
        # Similar to aim-through but with some local adaptation at layover
        # For now, implement same as aim-through (can be refined later)
        return self._generate_aim_through_phases()

    def _generate_restart_phases(self) -> List[TravelPhase]:
        """Generate phases treating legs as separate trips (>96h layover or opposite directions)."""
        # For restart, generate phases for each leg independently
        # This is more complex - for now, use aim-through as fallback
        return self._generate_aim_through_phases()

    def _get_cumulative_shift_at_day(self, day: int) -> float:
        """Get cumulative shift at a specific day number."""
        return self.shift_calc.get_shift_at_day(day)
