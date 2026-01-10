"""
Constraint filter for practical scheduling adjustments.

Applies practical constraints to planned interventions:
1. Remove interventions outside phase bounds (before landing, after departure)
2. Remove interventions during sleep windows
3. Apply special rules for partial days

Records all modifications for transparency/debugging and science impact calculation.
"""

from dataclasses import dataclass
from datetime import datetime, time
from typing import Literal

from ..circadian_math import is_during_sleep, parse_time, time_to_minutes
from ..types import Intervention, TravelPhase

# Sleep target should not appear within this many hours before departure
SLEEP_TARGET_DEPARTURE_BUFFER_HOURS = 4.0


@dataclass
class ConstraintViolation:
    """Record of a constraint that was applied."""

    intervention_type: str
    original_time: str
    action_taken: Literal["removed", "moved", "shortened"]
    reason: str
    science_impact: str  # How this affects circadian efficacy


class ConstraintFilter:
    """
    Apply practical constraints to planned interventions.

    Records all modifications for transparency/debugging.
    This is the key to fixing the "activities before landing" bug -
    interventions are now explicitly filtered to phase bounds.
    """

    def __init__(self) -> None:
        """Initialize filter with empty violation list."""
        self.violations: list[ConstraintViolation] = []

    def filter_phase(
        self,
        interventions: list[Intervention],
        phase: TravelPhase,
        departure_datetime: datetime | None = None,
    ) -> list[Intervention]:
        """
        Apply all constraints to a phase's interventions.

        Args:
            interventions: List of planned interventions
            phase: The travel phase
            departure_datetime: Flight departure time (for filtering sleep_target)

        Returns:
            Filtered list with constraints applied
        """
        filtered = interventions.copy()

        # Skip most filtering for ULR in-transit phases - their interventions are
        # positioned by flight_offset_hours, not timezone-local times.
        # Just sort and return.
        if phase.phase_type == "in_transit_ulr":
            return self._sort_interventions(filtered)

        # 1. Remove interventions outside phase bounds
        filtered = self._filter_phase_bounds(filtered, phase, departure_datetime)

        # 2. Remove interventions during sleep window
        filtered = self._filter_sleep_window(filtered)

        # 3. For post_arrival, ensure activities start AFTER landing
        if phase.phase_type == "post_arrival":
            filtered = self._filter_before_arrival(filtered, phase)

        # 4. Sort by time with proper ordering
        filtered = self._sort_interventions(filtered)

        return filtered

    def _filter_phase_bounds(
        self,
        interventions: list[Intervention],
        phase: TravelPhase,
        departure_datetime: datetime | None = None,
    ) -> list[Intervention]:
        """
        Remove interventions outside phase start/end times.

        This is the core fix for "activities before landing" - we explicitly
        check that each intervention falls within the phase's actual time bounds.

        Note: wake_target is always kept as an informational target.
        sleep_target is kept unless it's within 4 hours of departure (unrealistic).
        """
        result = []

        phase_start_minutes = time_to_minutes(phase.start_datetime.time())
        phase_end_minutes = time_to_minutes(phase.end_datetime.time())

        # Handle phases that cross midnight
        crosses_midnight = phase_end_minutes < phase_start_minutes

        # Types that should never be filtered (informational targets)
        # Note: sleep_target has conditional filtering based on departure proximity
        keep_always = {"wake_target"}

        for intervention in interventions:
            # Always keep wake_target - it's informational
            if intervention.type in keep_always:
                result.append(intervention)
                continue

            i_time = parse_time(intervention.time)
            i_minutes = time_to_minutes(i_time)

            # Filter sleep_target if within 4h of departure (unrealistic to sleep then)
            if intervention.type == "sleep_target":
                if departure_datetime and self._is_near_departure(
                    i_time, phase.start_datetime, departure_datetime
                ):
                    self.violations.append(
                        ConstraintViolation(
                            intervention_type="sleep_target",
                            original_time=intervention.time,
                            action_taken="removed",
                            reason=f"Within {SLEEP_TARGET_DEPARTURE_BUFFER_HOURS}h of departure",
                            science_impact="Sleep target too close to flight; sleep opportunity on flight is more relevant",
                        )
                    )
                    continue
                # Keep sleep_target if not near departure
                result.append(intervention)
                continue

            # Check if intervention is within phase bounds
            if crosses_midnight:
                # Phase crosses midnight (e.g., 20:00 to 06:00)
                in_bounds = i_minutes >= phase_start_minutes or i_minutes <= phase_end_minutes
            else:
                # Normal phase (e.g., 07:00 to 22:00)
                in_bounds = phase_start_minutes <= i_minutes <= phase_end_minutes

            if in_bounds:
                result.append(intervention)
            else:
                # Record violation
                self.violations.append(
                    ConstraintViolation(
                        intervention_type=intervention.type,
                        original_time=intervention.time,
                        action_taken="removed",
                        reason=f"Outside phase bounds ({phase.start_datetime.time()} to {phase.end_datetime.time()})",
                        science_impact="Intervention unavailable; phase shift may be slower",
                    )
                )

        return result

    def _filter_before_arrival(
        self, interventions: list[Intervention], phase: TravelPhase
    ) -> list[Intervention]:
        """
        For post_arrival phases, ensure no activities before landing.

        This handles the edge case where phase bounds might technically include
        pre-landing times due to timezone transitions.

        Note: wake_target and sleep_target are always kept as informational targets,
        even if the target time is before arrival.
        """
        result = []
        arrival_minutes = time_to_minutes(phase.start_datetime.time())

        # Types that should never be filtered (informational targets)
        keep_always = {"wake_target", "sleep_target"}

        for intervention in interventions:
            i_time = parse_time(intervention.time)
            i_minutes = time_to_minutes(i_time)

            # Always keep wake/sleep targets - they're informational
            if intervention.type in keep_always:
                result.append(intervention)
                continue

            # For all other interventions, must be after arrival
            if i_minutes < arrival_minutes:
                # Exception: early morning (0-6am) might be next day
                if i_minutes <= 6 * 60:
                    result.append(intervention)
                else:
                    self.violations.append(
                        ConstraintViolation(
                            intervention_type=intervention.type,
                            original_time=intervention.time,
                            action_taken="removed",
                            reason=f"Before arrival at {phase.start_datetime.time()}",
                            science_impact="Intervention impossible while in transit",
                        )
                    )
            else:
                result.append(intervention)

        return result

    def _filter_sleep_window(self, interventions: list[Intervention]) -> list[Intervention]:
        """
        Filter out interventions that fall during sleep hours.

        Users can't act on interventions while asleep.
        """
        # Find sleep and wake targets
        sleep_time = None
        wake_time = None

        for intervention in interventions:
            if intervention.type == "sleep_target":
                sleep_time = intervention.time
            elif intervention.type == "wake_target":
                wake_time = intervention.time

        if not sleep_time or not wake_time:
            return interventions

        sleep_minutes = time_to_minutes(parse_time(sleep_time))
        wake_minutes = time_to_minutes(parse_time(wake_time))

        # Types to filter during sleep
        filterable_types = {
            "light_seek",
            "light_avoid",
            "caffeine_ok",
            "caffeine_cutoff",
            "exercise",
            "nap_window",
        }

        result = []
        for intervention in interventions:
            if intervention.type not in filterable_types:
                result.append(intervention)
                continue

            i_minutes = time_to_minutes(parse_time(intervention.time))

            if is_during_sleep(i_minutes, sleep_minutes, wake_minutes):
                self.violations.append(
                    ConstraintViolation(
                        intervention_type=intervention.type,
                        original_time=intervention.time,
                        action_taken="removed",
                        reason="During sleep window",
                        science_impact="Intervention during sleep is not actionable",
                    )
                )
            else:
                result.append(intervention)

        return result

    def _is_near_departure(
        self, intervention_time: time, phase_date: datetime, departure_datetime: datetime
    ) -> bool:
        """
        Check if an intervention time is within the buffer period before departure.

        Args:
            intervention_time: Time of the intervention (HH:MM)
            phase_date: Date context for the intervention
            departure_datetime: Flight departure datetime

        Returns:
            True if intervention is within SLEEP_TARGET_DEPARTURE_BUFFER_HOURS of departure
        """
        # Build datetime for the intervention using the phase date
        intervention_datetime = phase_date.replace(
            hour=intervention_time.hour, minute=intervention_time.minute, second=0, microsecond=0
        )

        # Calculate hours before departure
        time_diff = departure_datetime - intervention_datetime
        hours_before_departure = time_diff.total_seconds() / 3600

        # Return True if intervention is within the buffer window (0 to N hours before)
        return 0 < hours_before_departure <= SLEEP_TARGET_DEPARTURE_BUFFER_HOURS

    def _sort_interventions(self, interventions: list[Intervention]) -> list[Intervention]:
        """
        Sort interventions by time with proper secondary ordering.

        Times are sorted chronologically with late-night awareness:
        - Times 00:00-05:59 are treated as "late night" (after evening)
        - This ensures sleep targets at 1-2 AM sort AFTER daytime activities

        Same-time items are ordered:
        - wake_target first (at wake time)
        - non-optional (light_seek, light_avoid) before optional
        - sleep_target last (at sleep time)
        """

        def sort_key(intervention: Intervention) -> tuple:
            time_str = intervention.time
            itype = intervention.type

            # Convert time to sortable minutes with late-night awareness
            minutes = time_to_minutes(parse_time(time_str))
            # Only treat sleep_target at 00:00-05:59 as late night
            # Wake times in early morning should still sort first
            if itype == "sleep_target" and minutes < 6 * 60:
                minutes += 24 * 60

            # Define priority groups
            if itype == "wake_target":
                priority = (0, 0)
            elif itype in ("light_seek", "light_avoid"):
                priority = (1, 0)
            elif itype == "caffeine_ok":
                priority = (2, 0)
            elif itype == "caffeine_cutoff":
                priority = (2, 1)
            elif itype == "nap_window":
                priority = (2, 2)
            elif itype == "exercise":
                priority = (2, 3)
            elif itype == "melatonin":
                priority = (2, 4)
            elif itype == "sleep_target":
                priority = (3, 0)
            else:
                priority = (2, 5)

            return (minutes, priority)

        return sorted(interventions, key=sort_key)

    def get_science_impact_summary(self) -> str | None:
        """
        Summarize how constraints affected circadian efficacy.

        Returns:
            Impact summary string, or None if no significant impact
        """
        if not self.violations:
            return None

        removed = [v for v in self.violations if v.action_taken == "removed"]

        if not removed:
            return None

        light_removed = [v for v in removed if "light" in v.intervention_type]

        if light_removed:
            return (
                f"{len(light_removed)} light intervention(s) adjusted due to travel constraints. "
                f"Adaptation may take 1-2 extra days."
            )

        return f"{len(removed)} intervention(s) adjusted for practical constraints."

    def get_detailed_violations(self) -> list[dict]:
        """
        Get detailed list of all constraint violations.

        Useful for debugging and detailed user feedback.
        """
        return [
            {
                "type": v.intervention_type,
                "time": v.original_time,
                "action": v.action_taken,
                "reason": v.reason,
                "impact": v.science_impact,
            }
            for v in self.violations
        ]
